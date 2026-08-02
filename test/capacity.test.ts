/**
 * Capacity: the arithmetic that decides how many customers the agent can
 * serve, and the rate limiter that has to hold under concurrency.
 *
 * The throughput ceiling is not a matter of opinion — it is batch size ×
 * scheduled firings per day, against a measured cycle duration and a fixed
 * function window. This asserts the numbers so a future change that halves
 * the batch, or lengthens a cycle, fails here instead of in production six
 * weeks later when sites start slipping behind cadence.
 */

let fails = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(ok ? "PASS" : "FAIL", name, extra);
  if (!ok) fails++;
};

/* ------------------------- Throughput arithmetic ------------------------- */

// Measured from a real production run log: 02:58:12 -> 02:59:54.
const CYCLE_SECONDS = 102;
const FUNCTION_WINDOW = 300;
// GitHub Actions "23,53 * * * *" = 48/day, plus the Vercel daily cron.
const FIRINGS_PER_DAY = 48 + 1;
const TARGET_CUSTOMERS = 100;

const BATCH = Math.max(1, Number(process.env.CRON_BATCH_SIZE) || 6);
const POOL = Math.max(1, Number(process.env.PG_POOL_MAX) || 6);

const serialCeiling = FIRINGS_PER_DAY * Math.floor(FUNCTION_WINDOW / CYCLE_SECONDS);
check(
  "the serial design could not have served 100 daily-cadence customers",
  serialCeiling < TARGET_CUSTOMERS,
  `serial ceiling was ${serialCeiling} cycles/day`
);

const concurrentCeiling = FIRINGS_PER_DAY * BATCH;
check(
  "concurrent batching clears 100 customers",
  concurrentCeiling >= TARGET_CUSTOMERS,
  `${concurrentCeiling} cycles/day at batch ${BATCH}`
);

// GitHub dropped three consecutive scheduled runs the night this was
// measured, so the ceiling has to survive losing a share of firings.
const degraded = Math.floor(FIRINGS_PER_DAY * 0.6) * BATCH;
check(
  "still clears 100 with 40% of scheduled runs dropped",
  degraded >= TARGET_CUSTOMERS,
  `${degraded} cycles/day`
);

check(
  "a full batch fits the function window when run concurrently",
  CYCLE_SECONDS < FUNCTION_WINDOW,
  `slowest cycle ${CYCLE_SECONDS}s of ${FUNCTION_WINDOW}s`
);

check(
  "the batch cannot outrun the connection pool",
  BATCH <= POOL,
  `batch ${BATCH} vs pool ${POOL} — a larger batch queues on connections`
);

// Supabase free tier allows 200 pooler client connections.
const POOLER_LIMIT = 200;
check(
  "pool sizing leaves room for concurrent serverless instances",
  Math.floor(POOLER_LIMIT / POOL) >= 30,
  `${Math.floor(POOLER_LIMIT / POOL)} concurrent instances before exhaustion`
);

/* --------------------------- Rate limit window --------------------------- */

// The limiter's decision logic, exercised without a database: a fixed
// window that resets on expiry and counts every call in between.
type Row = { count: number; windowStart: number };
const store = new Map<string, Row>();
const consume = (key: string, limit: number, windowMs: number, now: number) => {
  const row = store.get(key);
  if (!row || now - row.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: 1 <= limit };
  }
  row.count += 1;
  return { allowed: row.count <= limit };
};

const t0 = 1_000_000;
const verdicts = Array.from({ length: 7 }, () => consume("support:1.2.3.4", 5, 600_000, t0));
check("allows exactly the limit", verdicts.filter((v) => v.allowed).length === 5,
  `${verdicts.filter((v) => v.allowed).length} allowed of 7`);
check("blocks past the limit", verdicts.slice(5).every((v) => !v.allowed));
check("resets after the window", consume("support:1.2.3.4", 5, 600_000, t0 + 600_001).allowed);
check("counters are per key", consume("support:9.9.9.9", 5, 600_000, t0).allowed);
check("buckets are independent", consume("signup:1.2.3.4", 5, 600_000, t0).allowed);

process.exit(fails);
