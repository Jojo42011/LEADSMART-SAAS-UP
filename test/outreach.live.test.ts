/**
 * Outreach targets against real Postgres.
 *
 * The property worth a database: a research re-run refreshes rows the
 * owner has NOT acted on, and never touches one that has moved past
 * 'new'. "Pitched three weeks ago" is a record of the owner's own work,
 * and a refresh silently resetting it would erase the one thing the
 * tracker exists to hold. That guard is a WHERE on the upsert's conflict
 * arm, so only SQL can prove it — same as the rebuild's paid-row guard.
 */
const url = process.env.TEST_DATABASE_URL || "postgresql://ascent@localhost:55432/postgres";
process.env.DATABASE_URL = url;

import { promises as fs } from "fs";
import {
  saveOutreachTargets,
  listOutreachTargets,
  setOutreachStatus,
} from "../src/lib/engine/store";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fails++; };

async function main() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await pool.query("select 1");
  } catch {
    console.log("SKIP outreach live test — no database at", url.replace(/:[^:@]*@/, ":***@"));
    process.exit(0);
  }
  await pool.query(await fs.readFile("db/schema.sql", "utf8")).catch(() => {});
  await pool.query(`delete from tenants where email like 'out-%@test'`);

  const seed = async (email: string) => {
    const t = await pool.query(`insert into tenants (email, plan_status) values ($1, 'active') returning id`, [email]);
    const s = await pool.query(
      `insert into sites (tenant_id, url, platform, host) values ($1, 'https://out.example', 'github', 'out.example') returning id`,
      [t.rows[0].id]);
    return s.rows[0].id as string;
  };

  const siteId = await seed("out-owner@test");
  await seed("out-stranger@test");

  const target = (url: string, pitch: string) => ({
    name: "Scottsdale Living", url, kind: "roundup", why: "ranks for the phrase",
    pitchSubject: "subject", pitchBody: pitch,
  });

  /* ------------------------------ save + dedupe ---------------------------- */
  check("targets save", (await saveOutreachTargets(siteId, [target("https://a.example/best", "v1")])) === 1);
  check("a re-run with the same url refreshes rather than duplicates",
    (await saveOutreachTargets(siteId, [target("https://a.example/best", "v2")])) === 1);
  let rows = await listOutreachTargets(siteId, "out-owner@test");
  check("one row, carrying the refreshed pitch", rows.length === 1 && rows[0].pitch_body === "v2");

  /* --------------------------- ownership ----------------------------------- */
  check("a stranger lists nothing",
    (await listOutreachTargets(siteId, "out-stranger@test")).length === 0);
  check("a stranger cannot move a status",
    !(await setOutreachStatus(rows[0].id, "out-stranger@test", "placed")));

  /* ------------------ the owner's history survives refresh ----------------- */
  check("the owner moves it to pitched", await setOutreachStatus(rows[0].id, "out-owner@test", "pitched"));
  check("A REFRESH DOES NOT TOUCH A ROW THE OWNER ACTED ON",
    (await saveOutreachTargets(siteId, [target("https://a.example/best", "v3-should-not-land")])) === 0);
  rows = await listOutreachTargets(siteId, "out-owner@test");
  check("...status still pitched", rows[0].status === "pitched");
  check("...pitch still the one they sent", rows[0].pitch_body === "v2", rows[0].pitch_body);

  /* ------------------------------- validation ------------------------------ */
  check("an invalid status is refused",
    !(await setOutreachStatus(rows[0].id, "out-owner@test", "hacked")));
  check("the full status walk works",
    (await setOutreachStatus(rows[0].id, "out-owner@test", "placed")) &&
    (await listOutreachTargets(siteId, "out-owner@test"))[0].status === "placed");

  await pool.query(`delete from tenants where email like 'out-%@test'`);
  await pool.end();
  process.exit(fails);
}
main();
