/**
 * Citation statuses against real Postgres: the upsert and the ownership
 * join. The write path is insert...select gated on the tenant join, so
 * "a foreign siteId writes nothing" is a property of the SQL, and only
 * the SQL can prove it.
 */
const url = process.env.TEST_DATABASE_URL || "postgresql://ascent@localhost:55432/postgres";
process.env.DATABASE_URL = url;

import { promises as fs } from "fs";
import { listCitationStatuses, setCitationStatus } from "../src/lib/engine/store";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fails++; };

async function main() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await pool.query("select 1");
  } catch {
    console.log("SKIP citations live test — no database at", url.replace(/:[^:@]*@/, ":***@"));
    process.exit(0);
  }
  await pool.query(await fs.readFile("db/schema.sql", "utf8")).catch(() => {});
  await pool.query(`delete from tenants where email like 'cit-%@test'`);

  const seed = async (email: string) => {
    const t = await pool.query(`insert into tenants (email, plan_status) values ($1, 'active') returning id`, [email]);
    const s = await pool.query(
      `insert into sites (tenant_id, url, platform, host) values ($1, 'https://cit.example', 'github', 'cit.example') returning id`,
      [t.rows[0].id]);
    return s.rows[0].id as string;
  };

  const siteId = await seed("cit-owner@test");
  await seed("cit-stranger@test");

  check("a status writes", await setCitationStatus(siteId, "cit-owner@test", "yelp", "submitted"));
  check("...and reads back", (await listCitationStatuses(siteId, "cit-owner@test")).yelp === "submitted");
  check("upsert updates in place", await setCitationStatus(siteId, "cit-owner@test", "yelp", "live") &&
    (await listCitationStatuses(siteId, "cit-owner@test")).yelp === "live");

  check("a stranger's write lands nowhere",
    !(await setCitationStatus(siteId, "cit-stranger@test", "yelp", "todo")));
  check("...and did not change the owner's row",
    (await listCitationStatuses(siteId, "cit-owner@test")).yelp === "live");
  check("a stranger reads nothing",
    Object.keys(await listCitationStatuses(siteId, "cit-stranger@test")).length === 0);

  await pool.query(`delete from tenants where email like 'cit-%@test'`);
  await pool.end();
  process.exit(fails);
}
main();
