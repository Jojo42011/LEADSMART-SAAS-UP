/**
 * The free preview, against real Postgres.
 *
 * Two claims are made about the free tier and neither can be unit-tested,
 * because both live entirely in the database.
 *
 * The first is the same claim the paid entitlement makes: the scheduler
 * decides in SQL (freeTierSqlFragment) while every button decides in
 * TypeScript (entitlementFor), and if those disagree the agent either
 * keeps writing for someone who has used up their allowance or refuses
 * someone who still has pages left. Both are silent.
 *
 * The second is the anti-abuse claim, and it is the whole reason the
 * allowance is counted by host rather than by tenant: signing up again
 * with a different email and the same website must NOT hand out three
 * more free pages. An email address costs nothing to mint. That property
 * is a join, so it is asserted here rather than argued about.
 */
const url = process.env.TEST_DATABASE_URL || "postgresql://ascent@localhost:55432/postgres";
process.env.DATABASE_URL = url;

import { promises as fs } from "fs";
import { entitlementFor, freeTierSqlFragment, entitledSqlFragment, FREE_PAGE_LIMIT } from "../src/lib/engine/entitlement";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fails++; };

async function main() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await pool.query("select 1");
  } catch {
    console.log("SKIP free-tier live test — no database at", url.replace(/:[^:@]*@/, ":***@"));
    console.log("     start one with: test/scripts/pg-scratch.sh start");
    process.exit(0);
  }

  await pool.query(await fs.readFile("db/schema.sql", "utf8")).catch(() => {});
  // Older scratch databases predate the column; the app adds it the same way.
  await pool.query(`alter table sites add column if not exists host text not null default ''`).catch(() => {});
  await pool.query(`delete from tenants where email like 'free-%@test'`);

  /** A tenant with one site on `host`, and `published` published pages. */
  const seed = async (email: string, host: string, published: number, status = "inactive") => {
    const t = await pool.query(
      `insert into tenants (email, plan_status, plan_status_since)
       values ($1, $2, now()) on conflict (email) do update set plan_status = excluded.plan_status
       returning id`,
      [email, status]
    );
    const tenantId = t.rows[0].id as string;
    const s = await pool.query(
      `insert into sites (tenant_id, url, platform, host) values ($1, $2, 'github', $3) returning id`,
      [tenantId, `https://${host}`, host]
    );
    const siteId = s.rows[0].id as string;
    for (let i = 0; i < published; i++) {
      await pool.query(
        `insert into pages (site_id, keyword, slug, folder, title, status)
         values ($1, $2, $3, 'services', $4, 'published')`,
        [siteId, `kw-${email}-${i}`, `slug-${email}-${i}`.replace(/[@.]/g, "-"), `Page ${i}`]
      );
    }
    return { tenantId, siteId };
  };

  /** What the scheduler would admit, using its own predicate. */
  const schedulerAdmits = async (): Promise<Set<string>> => {
    const res = await pool.query(
      `select t.email from sites s join tenants t on t.id = s.tenant_id
        where t.email like 'free-%@test'
          and (${entitledSqlFragment("t")} or ${freeTierSqlFragment("s", "t")})`
    );
    return new Set(res.rows.map((r) => r.email as string));
  };

  /** The count the TypeScript side sees, by host, across every tenant. */
  const freeUsedFor = async (email: string): Promise<number> => {
    const res = await pool.query(
      `select count(*)::int as n from pages p join sites s on s.id = p.site_id
        where p.status = 'published' and s.host <> '' and s.host in (
          select s2.host from sites s2 join tenants t on t.id = s2.tenant_id
          where t.email = $1 and s2.host <> '')`,
      [email]
    );
    return Number(res.rows[0].n);
  };

  /* ------- SQL and TypeScript must admit exactly the same tenants -------- */
  const cases: [string, string, number, boolean][] = [
    ["free-fresh@test", "fresh.example", 0, true],
    ["free-partway@test", "partway.example", FREE_PAGE_LIMIT - 1, true],
    ["free-spent@test", "spent.example", FREE_PAGE_LIMIT, false],
    ["free-over@test", "over.example", FREE_PAGE_LIMIT + 2, false],
  ];
  for (const [email, host, published] of cases) await seed(email, host, published);

  let admitted = await schedulerAdmits();
  for (const [email, , , expected] of cases) {
    const sqlSays = admitted.has(email);
    const tsSays = entitlementFor("inactive", null, new Date(), await freeUsedFor(email)).allowed;
    check(`SQL agrees with TypeScript for ${email}`, sqlSays === tsSays, `sql=${sqlSays} ts=${tsSays}`);
    check(`  ...and both match the intended rule`, sqlSays === expected, `got ${sqlSays}, want ${expected}`);
  }

  /* --------- The allowance belongs to the website, not the email --------- */
  // The abuse case, played out exactly as someone would actually do it:
  // the first account uses up the free pages, then a brand new email is
  // pointed at the same website.
  await seed("free-abuser-one@test", "abuse.example", FREE_PAGE_LIMIT);
  await seed("free-abuser-two@test", "abuse.example", 0);

  admitted = await schedulerAdmits();
  const secondAccountUsed = await freeUsedFor("free-abuser-two@test");
  check("a second account on the same website inherits the pages already spent",
    secondAccountUsed >= FREE_PAGE_LIMIT, `counted ${secondAccountUsed}`);
  check("...so the scheduler will not write for it", !admitted.has("free-abuser-two@test"));
  check("...and neither will the on-demand path",
    !entitlementFor("inactive", null, new Date(), secondAccountUsed).allowed);

  // The mirror image: a genuinely different website is unaffected by it.
  await seed("free-neighbour@test", "neighbour.example", 0);
  admitted = await schedulerAdmits();
  check("a different website still gets its own free preview",
    admitted.has("free-neighbour@test"));

  /* ---------------- Paying customers are never free-gated ---------------- */
  await seed("free-payer@test", "payer.example", FREE_PAGE_LIMIT + 50, "active");
  admitted = await schedulerAdmits();
  check("an active plan is not stopped by the free-page count",
    admitted.has("free-payer@test"));

  // And a settled ending is not rescued by having pages left over.
  await seed("free-cancelled@test", "cancelled.example", 0, "canceled");
  admitted = await schedulerAdmits();
  check("a cancelled plan is not handed a free preview",
    !admitted.has("free-cancelled@test"));

  /* ------------- An unidentifiable site gets no free pages --------------- */
  // Empty hosts must not collide with each other; a site we cannot identify
  // cannot be metered, so it is refused rather than served unmetered.
  const t = await pool.query(
    `insert into tenants (email, plan_status) values ('free-hostless@test', 'inactive') returning id`
  );
  await pool.query(`insert into sites (tenant_id, url, platform, host) values ($1, '', 'github', '')`,
    [t.rows[0].id]);
  admitted = await schedulerAdmits();
  check("a site with no resolvable host is not served for free",
    !admitted.has("free-hostless@test"));

  await pool.query(`delete from tenants where email like 'free-%@test'`);
  await pool.end();
  process.exit(fails);
}
main();
