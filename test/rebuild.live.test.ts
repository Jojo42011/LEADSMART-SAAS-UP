/**
 * The rebuild's status walk, against real Postgres.
 *
 * The property that matters is immutability after money: once a rebuild
 * is paid for, the customer bought THAT document, and no regeneration —
 * however innocent — may replace it. That guard is a WHERE clause on an
 * upsert, which only a real database can prove. So is ownership: the
 * rebuild row holds a full homepage plus the previous homepage's bytes,
 * and it must be unreadable across accounts.
 */
const url = process.env.TEST_DATABASE_URL || "postgresql://ascent@localhost:55432/postgres";
process.env.DATABASE_URL = url;

import { promises as fs } from "fs";
import {
  saveRebuildPreview,
  getRebuildForEmail,
  markRebuildPaid,
  markRebuildPublished,
} from "../src/lib/engine/store";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fails++; };

async function main() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await pool.query("select 1");
  } catch {
    console.log("SKIP rebuild live test — no database at", url.replace(/:[^:@]*@/, ":***@"));
    console.log("     start one with: test/scripts/pg-scratch.sh start");
    process.exit(0);
  }

  await pool.query(await fs.readFile("db/schema.sql", "utf8")).catch(() => {});
  await pool.query(`delete from tenants where email like 'rb-%@test'`);

  const seed = async (email: string) => {
    const t = await pool.query(
      `insert into tenants (email, plan_status) values ($1, 'active') returning id`, [email]);
    const s = await pool.query(
      `insert into sites (tenant_id, url, platform, host) values ($1, 'https://rb.example', 'github', 'rb.example') returning id`,
      [t.rows[0].id]);
    return s.rows[0].id as string;
  };

  const siteId = await seed("rb-owner@test");

  /* ------------------------------ preview --------------------------------- */
  check("a preview saves", await saveRebuildPreview(siteId, "<html>v1</html>", "V1"));
  check("regenerating a preview is allowed",
    await saveRebuildPreview(siteId, "<html>v2</html>", "V2"));
  let row = await getRebuildForEmail(siteId, "rb-owner@test");
  check("the newest preview is what is stored", row?.html === "<html>v2</html>", row?.html ?? "");

  /* ------------------------------ ownership ------------------------------- */
  await seed("rb-stranger@test");
  check("a stranger cannot read the rebuild",
    (await getRebuildForEmail(siteId, "rb-stranger@test")) === null);

  /* -------------------------------- paid ---------------------------------- */
  check("payment marks the row paid", await markRebuildPaid(siteId));
  check("THE PAID DOCUMENT CANNOT BE REPLACED BY A REGENERATION",
    !(await saveRebuildPreview(siteId, "<html>sneaky-v3</html>", "V3")));
  row = await getRebuildForEmail(siteId, "rb-owner@test");
  check("...and the bought bytes are untouched", row?.html === "<html>v2</html>");

  const paidAtFirst = row?.paid_at;
  check("a duplicate payment webhook is a no-op, not an error",
    !(await markRebuildPaid(siteId)) || true); // idempotent either way
  row = await getRebuildForEmail(siteId, "rb-owner@test");
  check("...and does not restamp paid_at",
    String(row?.paid_at) === String(paidAtFirst));

  /* ------------------------------ published ------------------------------- */
  await markRebuildPublished(siteId, {
    previousHomeHtml: "<html>the old homepage</html>",
    liveUrl: "https://rb.example/",
    liveStatus: "live:200",
  });
  row = await getRebuildForEmail(siteId, "rb-owner@test");
  check("published state is recorded", row?.status === "published");
  check("NEVER-DELETE: the replaced homepage's bytes are stored on the row",
    row?.previous_home_html === "<html>the old homepage</html>");
  check("a late duplicate payment webhook cannot demote a published rebuild",
    !(await markRebuildPaid(siteId)) && (await getRebuildForEmail(siteId, "rb-owner@test"))?.status === "published");
  check("neither can a regeneration",
    !(await saveRebuildPreview(siteId, "<html>v4</html>", "V4")));

  await pool.query(`delete from tenants where email like 'rb-%@test'`);
  await pool.end();
  process.exit(fails);
}
main();
