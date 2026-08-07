/**
 * The production migration path.
 *
 * Every table and column added after launch lives in TWO places:
 * db/schema.sql for a fresh install, and SCHEMA_REPAIRS in store.ts for
 * databases that already exist. Only the second one runs against a live
 * customer database, and forgetting it is silent — the code ships, the
 * feature 500s on the one database that matters, and every local test
 * still passes because they all load the complete schema.
 *
 * So this starts from a snapshot of the schema as it was BEFORE this
 * session's tables existed, triggers a cold start the way a real request
 * does, and asserts the new tables and columns appear. The fixture is
 * pinned deliberately: it is the shape a real deployed database was in,
 * not a shape derived from the current schema file.
 */
const url = process.env.TEST_DATABASE_URL || "postgresql://ascent@localhost:55432/postgres";
process.env.DATABASE_URL = url;
import { promises as fs } from "fs";
let fails = 0;
const check = (n: string, ok: boolean, x = "") => { console.log(ok ? "PASS" : "FAIL", n, x); if (!ok) fails++; };

async function main() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url });
  // Wipe, then install ONLY the pre-session schema.
  await pool.query("drop schema public cascade; create schema public;");
  const old = await fs.readFile("test/fixtures-old-schema.sql", "utf8");
  await pool.query(old);
  const before = await pool.query(
    `select table_name from information_schema.tables where table_schema='public'`);
  const had = new Set(before.rows.map(r => r.table_name));
  check("baseline really lacks the new tables",
    !had.has("citation_listings") && !had.has("outreach_targets") && !had.has("rebuilds"),
    [...had].join(","));
  await pool.end();

  // Any store call triggers ensureSchema — this is what a cold start does.
  const { listCitationStatuses } = await import("../src/lib/engine/store");
  await listCitationStatuses("00000000-0000-4000-8000-000000000000", "x@test").catch(() => {});

  const p2 = new (await import("pg")).Pool({ connectionString: url });
  const after = await p2.query(
    `select table_name from information_schema.tables where table_schema='public'`);
  const now = new Set(after.rows.map(r => r.table_name));
  for (const t of ["citation_listings", "outreach_targets", "rebuilds"])
    check(`${t} auto-created on the existing database`, now.has(t));
  const cols = await p2.query(
    `select column_name from information_schema.columns where table_name='connections'`);
  const c = new Set(cols.rows.map(r => r.column_name));
  check("connections gained the ftp_* columns",
    ["ftp_host","ftp_user","ftp_password","ftp_protocol","ftp_root"].every(x => c.has(x)));
  const sc = await p2.query(
    `select column_name from information_schema.columns where table_name='sites'`);
  check("sites gained the host column", new Set(sc.rows.map(r => r.column_name)).has("host"));
  await p2.end();
  process.exit(fails);
}
main();
