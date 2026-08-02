/**
 * Entitlement against real Postgres.
 *
 * Two properties only exist in the database and cannot be unit-tested.
 *
 * The scheduler decides in SQL while every button decides in TypeScript.
 * If those disagree the product either works for people who stopped
 * paying or refuses people who are, and both are silent.
 *
 * And the grace clock is measured from plan_status_since, which is only
 * stamped when the status actually CHANGES. Stripe emits an event per
 * dunning retry, so a naive write would roll the window forward on every
 * one and past_due would never expire — free service forever for anyone
 * whose card kept failing. That is a property of the upsert, not of any
 * TypeScript.
 */
const url = process.env.TEST_DATABASE_URL || "postgresql://ascent@localhost:55432/postgres";
process.env.DATABASE_URL = url;

import { entitlementFor, entitledSqlFragment } from "../src/lib/engine/entitlement";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fails++; };

async function main() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await pool.query("select 1");
  } catch {
    console.log("SKIP entitlement live test — no database at", url.replace(/:[^:@]*@/, ":***@"));
    console.log("     start one with: test/scripts/pg-scratch.sh start");
    process.exit(0);
  }

  await pool.query(`create table if not exists tenants (
    id uuid primary key default gen_random_uuid(), email text unique not null, name text,
    password_hash text, plan_status text not null default 'inactive',
    stripe_customer_id text, created_at timestamptz not null default now())`).catch(() => {});
  await pool.query(`create extension if not exists pgcrypto`).catch(() => {});
  await pool.query(`alter table tenants add column if not exists plan_status_since timestamptz default now()`);
  await pool.query(`delete from tenants where email like 'ent-%@test'`);

  const seed = async (email: string, status: string, daysAgo: number) => {
    await pool.query(
      `insert into tenants (email, plan_status, plan_status_since)
       values ($1, $2, now() - make_interval(days => $3::int))
       on conflict (email) do update set plan_status = excluded.plan_status, plan_status_since = excluded.plan_status_since`,
      [email, status, daysAgo]
    );
  };

  const cases: [string, string, number, boolean][] = [
    ["ent-trial@test", "trialing", 1, true],
    ["ent-active@test", "active", 40, true],
    ["ent-grace@test", "past_due", 2, true],
    ["ent-lapsed@test", "past_due", 30, false],
    ["ent-cancelled@test", "canceled", 1, false],
    ["ent-unpaid@test", "unpaid", 1, false],
    ["ent-incomplete@test", "incomplete", 1, false],
    ["ent-none@test", "inactive", 1, false],
  ];
  for (const [email, status, days] of cases) await seed(email, status, days);

  // The scheduler's own predicate, run against the same rows.
  const res = await pool.query(
    `select email from tenants t where t.email like 'ent-%@test' and ${entitledSqlFragment("t")}`
  );
  const admitted = new Set(res.rows.map((r) => r.email as string));

  for (const [email, status, days, expected] of cases) {
    const sqlSays = admitted.has(email);
    const tsSays = entitlementFor(status, new Date(Date.now() - days * 86_400_000)).allowed;
    check(`SQL agrees with TypeScript for ${status} (${days}d)`, sqlSays === tsSays,
      `sql=${sqlSays} ts=${tsSays}`);
    check(`  ...and both match the intended rule`, sqlSays === expected, `got ${sqlSays}, want ${expected}`);
  }

  /* --------- the grace clock must not restart on repeated webhooks -------- */
  const { setTenantPlanByCustomer } = await import("../src/lib/engine/store");
  await pool.query(
    `insert into tenants (email, plan_status, plan_status_since, stripe_customer_id)
     values ('ent-dunning@test', 'past_due', now() - interval '5 days', 'cus_dunning')
     on conflict (email) do update set plan_status='past_due',
       plan_status_since = now() - interval '5 days', stripe_customer_id='cus_dunning'`
  );
  // Stripe retries: three more past_due events for the same status.
  for (let i = 0; i < 3; i++) await setTenantPlanByCustomer("cus_dunning", "past_due");
  const after = await pool.query(
    `select extract(epoch from now() - plan_status_since)/86400 as days from tenants where email='ent-dunning@test'`
  );
  const daysHeld = Number(after.rows[0].days);
  check("repeated past_due webhooks do not restart the grace clock", daysHeld > 4.9,
    `clock still reads ${daysHeld.toFixed(2)} days old`);

  // A real transition DOES restamp it.
  await setTenantPlanByCustomer("cus_dunning", "active");
  const moved = await pool.query(
    `select extract(epoch from now() - plan_status_since) as secs from tenants where email='ent-dunning@test'`
  );
  check("a genuine status change does restamp the clock", Number(moved.rows[0].secs) < 5,
    `${Number(moved.rows[0].secs).toFixed(1)}s old`);

  await pool.query(`delete from tenants where email like 'ent-%@test'`);
  await pool.end();
  process.exit(fails);
}
main();
