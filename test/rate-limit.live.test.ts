/**
 * The rate limiter against real Postgres, under real concurrency.
 *
 * The whole point of the upsert is that a burst of simultaneous requests
 * cannot all read the same pre-increment count and slip through together.
 * That property only exists in the database; a mocked test would assert
 * the shape of the code, not the behaviour that matters.
 */
// Points at TEST_DATABASE_URL, or a scratch Postgres on 55432. Skips
// loudly when neither exists: a concurrency test that silently passes
// without a database is worse than no test, because it reads as coverage.
const url = process.env.TEST_DATABASE_URL || "postgresql://ascent@localhost:55432/postgres";
process.env.DATABASE_URL = url;
import { consumeRateLimit, pruneRateLimits } from "../src/lib/engine/store";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fails++; };

async function main() {
  const { Pool } = await import("pg");
  const probe = new Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await probe.query("select 1");
    // Start from a clean slate. The counters are deliberately durable, so
    // without this a second run of the suite inherits the first run's
    // exhausted windows and every assertion inverts.
    await probe.query(
      "delete from rate_limits where key like 'burst:%' or key like 'expiry:%' or key like 'load:%' or key like 'signup:%'"
    );
  } catch {
    console.log("SKIP rate-limit live test — no database at", url.replace(/:[^:@]*@/, ":***@"));
    console.log("     start one with: test/scripts/pg-scratch.sh start");
    process.exit(0);
  } finally {
    await probe.end().catch(() => {});
  }

  // 40 simultaneous requests against a limit of 5 — the burst the fixed
  // window exists to stop.
  const burst = await Promise.all(
    Array.from({ length: 40 }, () => consumeRateLimit("burst:1.2.3.4", 5, 600))
  );
  const allowed = burst.filter((v) => v.allowed).length;
  check("40 concurrent requests, exactly 5 allowed", allowed === 5, `${allowed} allowed`);
  check("blocked responses carry a retry hint", burst.filter(v => !v.allowed).every(v => v.retryAfterSeconds > 0));

  // Independence: one client's burst must not consume another's budget.
  const other = await consumeRateLimit("burst:9.9.9.9", 5, 600);
  check("a different client is unaffected", other.allowed);
  const otherBucket = await consumeRateLimit("signup:1.2.3.4", 5, 600);
  check("a different bucket is unaffected", otherBucket.allowed);

  // A one-second window, to prove expiry resets rather than accumulating.
  await Promise.all(Array.from({ length: 6 }, () => consumeRateLimit("expiry:k", 3, 1)));
  const beforeReset = await consumeRateLimit("expiry:k", 3, 1);
  check("still blocked inside the window", !beforeReset.allowed);
  await new Promise((r) => setTimeout(r, 1200));
  check("allowed again once the window expires", (await consumeRateLimit("expiry:k", 3, 1)).allowed);

  // Sustained load: 300 requests across 30 clients, 10 each, limit 10.
  const keys = Array.from({ length: 30 }, (_, i) => `load:client-${i}`);
  const started = Date.now();
  const results = await Promise.all(keys.flatMap((k) =>
    Array.from({ length: 10 }, () => consumeRateLimit(k, 10, 600))
  ));
  const ms = Date.now() - started;
  check("300 concurrent checks all allowed at their limit",
    results.filter((r) => r.allowed).length === 300, `${results.filter(r=>r.allowed).length}/300`);
  check("limiter adds negligible latency under load", ms < 5000, `${ms}ms for 300 checks`);

  const pruned = await pruneRateLimits();
  check("prune runs without error", pruned >= 0, `${pruned} old rows removed`);
  process.exit(fails);
}
main();
