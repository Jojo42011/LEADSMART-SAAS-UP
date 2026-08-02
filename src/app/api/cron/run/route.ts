import { NextResponse } from "next/server";
import { storeConfigured, getDueSites, recoverStuckRuns, pruneRateLimits } from "@/lib/engine/store";
import { runSiteCycle, type CycleResult } from "@/lib/engine/orchestrator";

/**
 * The daily heartbeat, fired by the Vercel cron in vercel.json.
 * With DATABASE_URL set this is the real autonomous loop: recover stuck
 * cycles, pick the sites whose cadence is due, and run one full cycle
 * per site (research, plan, generate, audit, publish). Without a
 * database it reports pipeline readiness so the wiring stays provable.
 */

export const maxDuration = 300;

/**
 * Sites processed per invocation, now that they run concurrently.
 *
 * Sized against the two real limits rather than optimistically. Each cycle
 * holds at most one database connection at a time, so the batch must not
 * exceed the per-instance pool (6 by default) or cycles queue on
 * connections instead of doing work. And each cycle makes several model
 * calls, so a batch is also a burst against the Gemini rate limit.
 *
 * Six concurrent × 49 scheduled firings a day is ~294 site-cycles, which
 * carries 100 daily-cadence customers with room for the scheduled runs
 * GitHub drops — it dropped three consecutive hours the night this was
 * measured. Raise CRON_BATCH_SIZE and PG_POOL_MAX together; raising this
 * one alone just moves the queue from the scheduler into the pool.
 */
const BATCH_SIZE = Math.max(1, Number(process.env.CRON_BATCH_SIZE) || 6);

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  // Fail closed. Previously the check was skipped entirely when CRON_SECRET
  // was unset, so a deployment that forgot the variable exposed a public
  // endpoint that runs cycles — and spends Gemini quota — for every tenant.
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured; refusing to run" },
      { status: 503 }
    );
  }
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!storeConfigured()) {
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      readiness: {
        tenantStore: false,
        research: Boolean(process.env.GEMINI_API_KEY),
        githubOauth: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      },
      note: "Set DATABASE_URL and apply db/schema.sql to activate per site autonomous cycles. Pipeline endpoints are live and callable now.",
    });
  }

  const startedAt = Date.now();
  const recovered = await recoverStuckRuns();
  // Housekeeping on the heartbeat: one row per client per bucket would
  // otherwise accumulate for the life of the database.
  await pruneRateLimits();
  const due = await getDueSites(BATCH_SIZE);

  // Concurrent, not serial. A cycle is almost entirely waiting — on the
  // model, on GitHub or WordPress, on the live-URL check — so running them
  // one after another spent the function's 300 seconds mostly idle. At two
  // serial cycles of ~100s each, 49 scheduled firings a day gave a hard
  // ceiling of 98 site-cycles: a hundred customers on a daily cadence
  // could not all be served, and sites would silently slip behind cadence.
  //
  // Each cycle still claims its own single-flight row, so concurrency here
  // cannot double-publish a site; the limit is the pool and the model's
  // rate, not correctness.
  const results = await Promise.all(
    due.map(async (site): Promise<CycleResult> => {
      try {
        return await runSiteCycle(site);
      } catch (e) {
        // One site's failure must not reject the batch and lose the
        // results of every site that succeeded alongside it.
        return {
          siteId: site.id,
          ok: false,
          error: e instanceof Error ? e.message : "cycle threw",
        };
      }
    })
  );

  const elapsedMs = Date.now() - startedAt;
  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    recoveredStuckRuns: recovered,
    sitesDue: due.length,
    batchSize: BATCH_SIZE,
    elapsedMs,
    // Surfaced so capacity is observable rather than inferred: if this
    // creeps toward maxDuration, the batch is too large for the window.
    budgetUsed: `${Math.round((elapsedMs / (maxDuration * 1000)) * 100)}%`,
    results,
  });
}
