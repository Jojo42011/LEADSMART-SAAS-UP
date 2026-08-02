/**
 * Account deletion and service disconnect, against real Postgres.
 *
 * These cannot be unit-tested, because what is being asserted is what the
 * database contains after the operation — and that is exactly where the
 * interesting failure lives. Most tables cascade from tenants or sites,
 * but `notifications` and `support_messages` key off the email as plain
 * text rather than a foreign key, so a cascade silently leaves rows
 * naming the deleted person behind. A mocked test would pass while the
 * product broke a promise in the privacy policy.
 *
 * The other property worth a real database: deletion must remove exactly
 * one account. A `like` or a case mismatch that took a second tenant's
 * data with it would be unrecoverable, so the tests keep a bystander
 * account alongside and assert it survives untouched.
 */
// Marks this file as a module. Every import here is dynamic (the store
// must not load until DATABASE_URL is set below), which without this
// leaves the file a script whose top-level `fails` and `check` collide
// with the same names in every other test file.
export {};

const url = process.env.TEST_DATABASE_URL || "postgresql://ascent@localhost:55432/postgres";
process.env.DATABASE_URL = url;

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => {
  console.log(ok ? "PASS" : "FAIL", n, extra);
  if (!ok) fails++;
};

async function main() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await pool.query("select 1");
  } catch {
    console.log(`SKIP account-delete live test — no database at ${url.replace(/:[^:@]*@/, ":***@")}`);
    console.log("     start one with: test/scripts/pg-scratch.sh start");
    await pool.end();
    return;
  }

  const fs = await import("node:fs/promises");
  await pool.query(await fs.readFile("db/schema.sql", "utf8"));

  const { deleteAccount, disconnectService } = await import("../src/lib/engine/store");

  const victim = "victim@example.com";
  const bystander = "bystander@example.com";

  /** Build a complete account: tenant, site, connection, page, run, notice. */
  async function seed(email: string): Promise<string> {
    const t = await pool.query(
      `insert into tenants (email, plan_status) values ($1,'active')
       on conflict (email) do update set plan_status='active' returning id`,
      [email]
    );
    const tenantId = t.rows[0].id as string;
    const s = await pool.query(
      `insert into sites (tenant_id, url, platform, cadence, publish_mode, business_name)
       values ($1,$2,'wordpress','daily','autopilot','Test Co') returning id`,
      [tenantId, `https://${email.split("@")[0]}.example`]
    );
    const siteId = s.rows[0].id as string;
    await pool.query(
      `insert into connections (site_id, wp_user, wp_app_password, github_token, github_repo, gsc_refresh_token)
       values ($1,'admin','secret','ghtok','o/r','gsctok')`,
      [siteId]
    );
    await pool.query(
      `insert into pages (site_id, keyword, slug, folder, title, status)
       values ($1,'kw','slug','folder','Title','published')`,
      [siteId]
    );
    await pool.query(`insert into runs (site_id, phase, status) values ($1,'plan','done')`, [siteId]);
    await pool.query(`insert into notifications (tenant_email, kind) values ($1,'welcome')`, [email]);
    await pool.query(
      `insert into support_messages (email, message, tenant_email) values ($1,'hello',$1)`,
      [email]
    );
    return siteId;
  }

  const victimSite = await seed(victim);
  await seed(bystander);

  // --- disconnect ---------------------------------------------------------
  const okGsc = await disconnectService(victim, victimSite, "gsc");
  const afterGsc = await pool.query(`select * from connections where site_id = $1`, [victimSite]);
  check("disconnect reports it changed something", okGsc === true);
  check("gsc token is cleared", afterGsc.rows[0].gsc_refresh_token === null);
  check(
    "disconnecting gsc leaves wordpress and github alone",
    afterGsc.rows[0].wp_app_password === "secret" && afterGsc.rows[0].github_token === "ghtok"
  );

  await disconnectService(victim, victimSite, "wordpress");
  const afterWp = await pool.query(`select * from connections where site_id = $1`, [victimSite]);
  check(
    "wordpress credentials are cleared",
    afterWp.rows[0].wp_user === null && afterWp.rows[0].wp_app_password === null
  );
  check("github survives a wordpress disconnect", afterWp.rows[0].github_token === "ghtok");

  // Ownership: another account's email must not be able to clear this site.
  const stranger = await disconnectService(bystander, victimSite, "github");
  const afterStranger = await pool.query(`select github_token from connections where site_id = $1`, [
    victimSite,
  ]);
  check("a stranger cannot disconnect a site they do not own", stranger === false);
  check("and the token is still there", afterStranger.rows[0].github_token === "ghtok");

  // --- deletion -----------------------------------------------------------
  // Mixed case on purpose: the session email is whatever the user typed.
  const removed = await deleteAccount("VICTIM@Example.com");
  check("one tenant removed", removed.tenants === 1, JSON.stringify(removed));
  check("counts report the site", removed.sites === 1);
  check("counts report the page", removed.pages === 1);

  const left = async (q: string, p: unknown[]) => Number((await pool.query(q, p)).rows[0].count);
  check(
    "tenant row is gone",
    (await left(`select count(*) from tenants where email = $1`, [victim])) === 0
  );
  check(
    "sites cascade",
    (await left(`select count(*) from sites where id = $1`, [victimSite])) === 0
  );
  check(
    "connections cascade — credentials do not outlive the account",
    (await left(`select count(*) from connections where site_id = $1`, [victimSite])) === 0
  );
  check(
    "pages cascade",
    (await left(`select count(*) from pages where site_id = $1`, [victimSite])) === 0
  );
  check(
    "runs cascade",
    (await left(`select count(*) from runs where site_id = $1`, [victimSite])) === 0
  );
  // The two tables that do NOT cascade. This is the whole reason the test
  // needs a real database.
  check(
    "notifications are deleted explicitly (no foreign key to cascade on)",
    (await left(`select count(*) from notifications where tenant_email = $1`, [victim])) === 0
  );
  check(
    "support messages are deleted explicitly",
    (await left(`select count(*) from support_messages where email = $1`, [victim])) === 0
  );

  // --- the bystander ------------------------------------------------------
  check(
    "another account's tenant is untouched",
    (await left(`select count(*) from tenants where email = $1`, [bystander])) === 1
  );
  check(
    "another account's site is untouched",
    (await left(
      `select count(*) from sites s join tenants t on t.id = s.tenant_id where t.email = $1`,
      [bystander]
    )) === 1
  );
  check(
    "another account's notifications are untouched",
    (await left(`select count(*) from notifications where tenant_email = $1`, [bystander])) === 1
  );
  check(
    "another account's support messages are untouched",
    (await left(`select count(*) from support_messages where email = $1`, [bystander])) === 1
  );

  // Deleting a second time is a no-op rather than an error.
  const again = await deleteAccount(victim);
  check("deleting an already-deleted account removes nothing", again.tenants === 0);

  await pool.query(`delete from tenants where email = $1`, [bystander]);
  await pool.query(`delete from notifications where tenant_email = $1`, [bystander]);
  await pool.query(`delete from support_messages where email = $1`, [bystander]);
  await pool.end();

  if (fails > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
