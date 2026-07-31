import { Pool } from "pg";
import { decryptSecret, encryptSecret } from "../secrets";

/**
 * Multi tenant data access. Activates when DATABASE_URL is set (Neon,
 * Supabase or any Postgres); every helper returns null or [] when the
 * store is unconfigured so the pipeline degrades instead of crashing.
 * Schema lives in db/schema.sql.
 */

let pool: Pool | null = null;

export function storeConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function db(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      // Local Postgres usually has no TLS. Matching only the literal
      // "localhost" made a 127.0.0.1 URL fail with the unhelpful "server
      // does not support SSL connections".
      ssl: /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(process.env.DATABASE_URL || "")
        ? undefined
        : { rejectUnauthorized: false },
    });
  }
  return pool;
}

/**
 * Actually connects and runs `select 1`, translating the common failure
 * codes into instructions. Diagnostics used to report the database healthy
 * whenever DATABASE_URL existed — which is how a deployment sat at
 * "password authentication failed" on every request while the health check
 * said everything was fine.
 */
export async function probeStore(): Promise<{ ok: boolean; error: string | null }> {
  if (!storeConfigured()) return { ok: false, error: "DATABASE_URL is not set" };
  try {
    await db().query("select 1");
    return { ok: true, error: null };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    let hint = "";
    if (err.code === "28P01") {
      hint =
        " The password inside DATABASE_URL is wrong. Common causes: a [YOUR-PASSWORD] placeholder left in the copied string, a reset password that was never updated here, or special characters (@ : / #) in the password that need URL-encoding. Fix the string in Vercel and redeploy.";
    } else if (err.code === "3D000") {
      hint = " The database named in DATABASE_URL does not exist on that server.";
    } else if (err.code === "42P01") {
      hint = " Connected, but the tables are missing — run db/schema.sql against this database.";
    } else if (/ENOTFOUND|EAI_AGAIN/.test(err.message || "")) {
      hint = " The host in DATABASE_URL cannot be resolved — check for typos.";
    }
    return { ok: false, error: `${err.message || "connection failed"}${hint}` };
  }
}

export type SiteRow = {
  id: string;
  tenant_id: string;
  url: string;
  platform: "wordpress" | "github";
  cadence: "daily" | "every3days" | "weekly";
  publish_mode: "autopilot" | "review";
  business_name: string;
  phone: string;
  address: string;
  city: string;
  region: string;
  service_area: string;
  industry: string;
  services: string;
  target_locations: string;
  seed_competitors: string;
  brand: Record<string, unknown>;
  last_run_at: string | null;
};

export type ConnectionRow = {
  site_id: string;
  wp_user: string | null;
  wp_app_password: string | null;
  github_repo: string | null;
  github_token: string | null;
  github_branch: string | null;
  gsc_refresh_token: string | null;
};

export type PageSummary = {
  id: string;
  keyword: string;
  slug: string;
  folder: string;
  title: string;
  html: string | null;
  status: string;
  /** Where the page went live, once published. Null until then. */
  live_url: string | null;
  /** Verification of that URL: live:200, error:404, unreachable. */
  live_status: string | null;
  audit_score: number;
  audit_grade: string;
  held_reason: string | null;
  word_count: number;
  published_at: string | null;
  created_at: string;
};

// "continuous" is a testing cadence, set via SQL rather than offered in
// onboarding: the site is due again minutes after each run, so every cron
// firing (scheduled or manual) produces a page. Real customers pick from
// the three human cadences; this one exists so the pipeline can be
// exercised without editing timestamps between test runs.
const CADENCE_HOURS: Record<string, number> = { continuous: 0.1, daily: 24, every3days: 72, weekly: 168 };

/** Sites whose cadence interval has elapsed, on an active tenant plan. */
export async function getDueSites(limit = 3): Promise<SiteRow[]> {
  if (!storeConfigured()) return [];
  const res = await db().query(
    `select s.* from sites s
     join tenants t on t.id = s.tenant_id
     where s.active and t.plan_status = 'active'
       and (s.last_run_at is null
            or s.last_run_at < now() - make_interval(mins =>
              -- Integer minutes on purpose: make_interval only accepts
              -- integers for every unit except secs, and the fractional
              -- hours 'continuous' first shipped with made this query —
              -- and therefore the whole cron endpoint — throw on every call.
              case s.cadence when 'continuous' then 6 when 'daily' then 1440 when 'every3days' then 4320 else 10080 end))
     order by s.last_run_at asc nulls first
     limit $1`,
    [limit]
  );
  return res.rows as SiteRow[];
}

export function cadenceHours(cadence: string): number {
  return CADENCE_HOURS[cadence] ?? 24;
}

/** Claims the single flight slot for a site. Returns run id, or null if a cycle is already running. */
export async function claimRun(siteId: string): Promise<string | null> {
  try {
    const res = await db().query(
      `insert into runs (site_id, status, phase) values ($1, 'running', 'start') returning id`,
      [siteId]
    );
    return res.rows[0].id as string;
  } catch {
    return null; // unique partial index: a cycle is already running
  }
}

export async function updateRun(
  runId: string,
  patch: Partial<{ phase: string; keywords_found: number; pages_generated: number; published: number }>
): Promise<void> {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await db().query(`update runs set ${sets} where id = $1`, [runId, ...Object.values(patch)]);
}

export async function finishRun(
  runId: string,
  status: "done" | "failed",
  summary: string,
  error?: string
): Promise<void> {
  await db().query(
    `update runs set status = $2, summary = $3, error = $4, finished_at = now() where id = $1`,
    [runId, status, summary, error ?? null]
  );
}

export async function touchSiteRun(siteId: string): Promise<void> {
  await db().query(`update sites set last_run_at = now() where id = $1`, [siteId]);
}

/** Recovers cycles stuck in running for over 90 minutes. */
export async function recoverStuckRuns(): Promise<number> {
  if (!storeConfigured()) return 0;
  const res = await db().query(
    `update runs set status = 'timeout', finished_at = now()
     where status = 'running' and started_at < now() - interval '90 minutes'`
  );
  return res.rowCount ?? 0;
}

export async function getConnection(siteId: string): Promise<ConnectionRow | null> {
  const res = await db().query(`select * from connections where site_id = $1`, [siteId]);
  const row = (res.rows[0] as ConnectionRow) ?? null;
  if (!row) return null;
  // Decrypt at the point of use. Rows written before encryption existed are
  // passed through unchanged and re-encrypted on the next connection save.
  return {
    ...row,
    wp_app_password: decryptSecret(row.wp_app_password),
    github_token: decryptSecret(row.github_token),
    gsc_refresh_token: decryptSecret(row.gsc_refresh_token),
  };
}

/**
 * Ensures a tenant row exists for a signed-in account. Called from the
 * OAuth callbacks so signing in with Google or GitHub is visible in the
 * tenants table immediately, not only after onboarding or payment.
 */
export async function upsertTenant(email: string, name?: string): Promise<string | null> {
  if (!storeConfigured()) return null;
  const res = await db().query(
    `insert into tenants (email, name) values ($1, $2)
     on conflict (email) do update set name = coalesce(nullif(excluded.name, ''), tenants.name)
     returning id`,
    [email.toLowerCase(), name ?? ""]
  );
  return (res.rows[0]?.id as string) ?? null;
}

/** One page with its stored HTML, only if it belongs to this email's tenant. */
export async function getPageForEmail(
  pageId: string,
  email: string
): Promise<{ id: string; title: string; html: string | null; live_url: string | null; status: string } | null> {
  if (!storeConfigured()) return null;
  const res = await db().query(
    `select p.id, p.title, p.html, p.live_url, p.status
     from pages p
     join sites s on s.id = p.site_id
     join tenants t on t.id = s.tenant_id
     where p.id = $1 and t.email = $2`,
    [pageId, email.toLowerCase()]
  );
  return res.rows[0] ?? null;
}

/**
 * Stores a Search Console refresh token (already encrypted by the caller)
 * on the tenant's most recent site. Returns false when the tenant has no
 * site yet — the onboarding cookie path covers that case instead.
 */
export async function saveGscTokenForEmail(email: string, encryptedToken: string): Promise<boolean> {
  if (!storeConfigured()) return false;
  const sites = await listSitesForEmail(email);
  const site = sites[0];
  if (!site) return false;
  await db().query(
    `insert into connections (site_id, gsc_refresh_token, updated_at) values ($1, $2, now())
     on conflict (site_id) do update set gsc_refresh_token = excluded.gsc_refresh_token, updated_at = now()`,
    [site.id, encryptedToken]
  );
  return true;
}

export async function upsertKeywords(
  siteId: string,
  keywords: { keyword: string; intent: string; difficulty: string; opportunity: number; reason: string }[]
): Promise<void> {
  for (const k of keywords) {
    await db().query(
      `insert into keywords (site_id, term, intent, difficulty, opportunity, reason)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (site_id, term) do update set opportunity = excluded.opportunity, reason = excluded.reason`,
      [siteId, k.keyword.toLowerCase(), k.intent, k.difficulty, k.opportunity, k.reason]
    );
  }
}

export async function upsertCompetitors(
  siteId: string,
  competitors: { domain: string; strength: string; weakness: string }[]
): Promise<void> {
  for (const c of competitors) {
    await db().query(
      `insert into competitors (site_id, domain, strength, weakness) values ($1, $2, $3, $4)
       on conflict (site_id, domain) do update set strength = excluded.strength, weakness = excluded.weakness`,
      [siteId, c.domain, c.strength, c.weakness]
    );
  }
}

export async function countKeywords(siteId: string): Promise<number> {
  const res = await db().query(`select count(*)::int as n from keywords where site_id = $1`, [siteId]);
  return res.rows[0].n as number;
}

/** Highest opportunity keyword not yet covered by a page. */
export async function nextTarget(
  siteId: string
): Promise<{ id: string; term: string; intent: string } | null> {
  const res = await db().query(
    `select id, term, intent from keywords
     where site_id = $1 and covered_by is null
     order by opportunity desc limit 1`,
    [siteId]
  );
  return res.rows[0] ?? null;
}

export async function listPages(siteId: string, withHtml = false): Promise<PageSummary[]> {
  const res = await db().query(
    `select id, keyword, slug, folder, title, status,
            live_url, live_status, audit_score, audit_grade, held_reason,
            word_count, published_at, created_at,
            ${withHtml ? "html" : "null as html"}
     from pages where site_id = $1 order by created_at desc limit 60`,
    [siteId]
  );
  return res.rows as PageSummary[];
}

export async function insertPage(page: {
  siteId: string;
  keyword: string;
  pageType: string;
  slug: string;
  folder: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  html: string;
  wordCount: number;
  auditScore: number;
  auditGrade: string;
  auditReport: unknown;
  status: string;
  heldReason?: string;
}): Promise<string> {
  const res = await db().query(
    `insert into pages (site_id, keyword, page_type, slug, folder, title, meta_title,
       meta_description, html, word_count, audit_score, audit_grade, audit_report, status, held_reason)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     on conflict (site_id, slug) do update set
       html = excluded.html, audit_score = excluded.audit_score, audit_grade = excluded.audit_grade,
       audit_report = excluded.audit_report, status = excluded.status, held_reason = excluded.held_reason
     returning id`,
    [
      page.siteId, page.keyword, page.pageType, page.slug, page.folder, page.title,
      page.metaTitle, page.metaDescription, page.html, page.wordCount, page.auditScore,
      page.auditGrade, JSON.stringify(page.auditReport), page.status, page.heldReason ?? null,
    ]
  );
  return res.rows[0].id as string;
}

export async function markKeywordCovered(keywordId: string, pageId: string): Promise<void> {
  await db().query(`update keywords set covered_by = $2 where id = $1`, [keywordId, pageId]);
}

/* ------------------------- Tenant provisioning ------------------------- */

export type ProvisionInput = {
  email: string;
  name?: string;
  site: {
    url: string;
    platform: "wordpress" | "github";
    cadence: "daily" | "every3days" | "weekly";
    publishMode: "autopilot" | "review";
    businessName: string;
    phone: string;
    address: string;
    city: string;
    region: string;
    serviceArea: string;
    industry: string;
    services: string;
    targetLocations: string;
    seedCompetitors: string;
    avgSaleValue: number | null;
    brand: Record<string, unknown>;
  };
  connection: {
    wpUser?: string;
    wpAppPassword?: string;
    githubRepo?: string;
    githubToken?: string;
    githubBranch?: string;
    gscRefreshToken?: string;
  };
};

/**
 * Turns a completed onboarding into real tenant rows: upsert the tenant by
 * email, upsert the site by (tenant, url) so re-running onboarding updates
 * instead of duplicating, and store publishing credentials. This is the
 * bridge between the wizard and the autonomous cycle — a site the cron can
 * pick up exists only after this runs.
 */
export async function provisionSite(
  input: ProvisionInput
): Promise<{ tenantId: string; siteId: string } | null> {
  if (!storeConfigured()) return null;

  const tenantRes = await db().query(
    `insert into tenants (email, name) values ($1, $2)
     on conflict (email) do update set name = coalesce(nullif(excluded.name, ''), tenants.name)
     returning id`,
    [input.email.toLowerCase(), input.name ?? ""]
  );
  const tenantId = tenantRes.rows[0].id as string;

  const s = input.site;
  const existing = await db().query(`select id from sites where tenant_id = $1 and url = $2`, [
    tenantId,
    s.url,
  ]);

  let siteId: string;
  if (existing.rows[0]) {
    siteId = existing.rows[0].id as string;
    // Brand only overwrites when the caller actually sent one. Saves that
    // carry no brand snapshot (a Settings save, a replayed onboarding)
    // used to blank it, and every page generated after that rendered in
    // default black-and-white instead of the site's own colors.
    await db().query(
      `update sites set platform=$2, cadence=$3, publish_mode=$4, business_name=$5, phone=$6,
         address=$7, city=$8, region=$9, service_area=$10, industry=$11, services=$12,
         target_locations=$13, seed_competitors=$14, avg_sale_value=$15,
         brand = case when $16::jsonb = '{}'::jsonb then sites.brand else $16::jsonb end
       where id = $1`,
      [
        siteId, s.platform, s.cadence, s.publishMode, s.businessName, s.phone,
        s.address, s.city, s.region, s.serviceArea, s.industry, s.services,
        s.targetLocations, s.seedCompetitors, s.avgSaleValue, JSON.stringify(s.brand),
      ]
    );
  } else {
    const siteRes = await db().query(
      `insert into sites (tenant_id, url, platform, cadence, publish_mode, business_name, phone,
         address, city, region, service_area, industry, services, target_locations,
         seed_competitors, avg_sale_value, brand)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       returning id`,
      [
        tenantId, s.url, s.platform, s.cadence, s.publishMode, s.businessName, s.phone,
        s.address, s.city, s.region, s.serviceArea, s.industry, s.services,
        s.targetLocations, s.seedCompetitors, s.avgSaleValue, JSON.stringify(s.brand),
      ]
    );
    siteId = siteRes.rows[0].id as string;
  }

  const c = input.connection;
  await db().query(
    `insert into connections (site_id, wp_user, wp_app_password, github_repo, github_token, github_branch, gsc_refresh_token, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7, now())
     on conflict (site_id) do update set
       wp_user = coalesce(nullif(excluded.wp_user, ''), connections.wp_user),
       wp_app_password = coalesce(nullif(excluded.wp_app_password, ''), connections.wp_app_password),
       github_repo = coalesce(nullif(excluded.github_repo, ''), connections.github_repo),
       github_token = coalesce(nullif(excluded.github_token, ''), connections.github_token),
       github_branch = coalesce(nullif(excluded.github_branch, ''), connections.github_branch),
       gsc_refresh_token = coalesce(nullif(excluded.gsc_refresh_token, ''), connections.gsc_refresh_token),
       updated_at = now()`,
    [
      siteId,
      c.wpUser ?? null,
      // Publishing credentials grant write access to the customer's own
      // website; they are encrypted before they touch the database and
      // decrypted only in getConnection, at the point of use.
      encryptSecret(c.wpAppPassword),
      c.githubRepo ?? null,
      encryptSecret(c.githubToken),
      c.githubBranch ?? null,
      encryptSecret(c.gscRefreshToken),
    ]
  );

  return { tenantId, siteId };
}

/**
 * Billing activation, called by the Stripe webhook. Upserts by email so
 * activation works even if payment lands before onboarding created the
 * tenant row.
 */
export async function setTenantPlanByEmail(
  email: string,
  status: "active" | "past_due" | "canceled",
  stripeCustomerId?: string
): Promise<void> {
  if (!storeConfigured()) return;
  await db().query(
    `insert into tenants (email, plan_status, stripe_customer_id) values ($1, $2, $3)
     on conflict (email) do update set
       plan_status = excluded.plan_status,
       stripe_customer_id = coalesce(excluded.stripe_customer_id, tenants.stripe_customer_id)`,
    [email.toLowerCase(), status, stripeCustomerId ?? null]
  );
}

/**
 * Clears the planning state so the next cycle re-researches from a changed
 * market profile.
 *
 * The cycle only researches when the keyword pool is thin (fewer than 10
 * terms), so a site that was onboarded with one set of services would keep
 * working from that original pool forever, no matter what the owner later
 * changed in Settings. Emptying the pool is what makes the agent think
 * again.
 *
 * Published pages are deliberately left alone: they are live on the
 * customer's own website, and editing a settings field must never delete
 * something the agent already shipped. Only unpublished drafts — work that
 * was planned from the stale profile and has not gone anywhere — are
 * removed, along with the keyword and competitor pools.
 */
export async function resetSitePlanning(
  siteId: string
): Promise<{ keywords: number; competitors: number; drafts: number }> {
  if (!storeConfigured()) return { keywords: 0, competitors: 0, drafts: 0 };

  const drafts = await db().query(
    `delete from pages where site_id = $1 and status <> 'published'`,
    [siteId]
  );
  const keywords = await db().query(`delete from keywords where site_id = $1`, [siteId]);
  const competitors = await db().query(`delete from competitors where site_id = $1`, [siteId]);
  // Null last_run_at so the cadence check treats the site as due immediately.
  await db().query(`update sites set last_run_at = null where id = $1`, [siteId]);

  return {
    keywords: keywords.rowCount ?? 0,
    competitors: competitors.rowCount ?? 0,
    drafts: drafts.rowCount ?? 0,
  };
}

/**
 * The sites belonging to a signed-in owner, newest first. Scoped by email
 * through the tenant so one account can never read another's sites.
 */
export async function listSitesForEmail(email: string): Promise<SiteRow[]> {
  if (!storeConfigured()) return [];
  const res = await db().query(
    `select s.* from sites s
     join tenants t on t.id = s.tenant_id
     where t.email = $1
     order by s.created_at desc`,
    [email.toLowerCase()]
  );
  return res.rows as SiteRow[];
}

/** The most recent runs for a site, so the dashboard can show real progress. */
export async function listRuns(siteId: string, limit = 5): Promise<{
  id: string; phase: string; status: string; summary: string | null;
  started_at: string; finished_at: string | null;
}[]> {
  if (!storeConfigured()) return [];
  const res = await db().query(
    `select id, phase, status, summary, started_at, finished_at
     from runs where site_id = $1 order by started_at desc limit $2`,
    [siteId, limit]
  );
  return res.rows;
}

/* ------------------------- Email account records ------------------------ */

export type TenantAccount = {
  id: string;
  email: string;
  name: string | null;
  password_hash: string | null;
};

/** Looks up an email account. Returns null when the store is unconfigured. */
export async function findTenantByEmail(email: string): Promise<TenantAccount | null> {
  if (!storeConfigured()) return null;
  const res = await db().query(
    `select id, email, name, password_hash from tenants where email = $1`,
    [email.toLowerCase()]
  );
  return (res.rows[0] as TenantAccount) ?? null;
}

/**
 * Creates an email account, or attaches a password to a tenant that already
 * exists without one (a Stripe webhook can create the row before signup).
 * Returns null when a password is already set, so the caller can tell the
 * visitor to sign in instead of silently overwriting a live credential.
 */
export async function createPasswordTenant(
  email: string,
  passwordHash: string,
  name: string | null
): Promise<TenantAccount | null> {
  if (!storeConfigured()) return null;
  const res = await db().query(
    `insert into tenants (email, name, password_hash) values ($1, $2, $3)
     on conflict (email) do update set
       password_hash = excluded.password_hash,
       name = coalesce(tenants.name, excluded.name)
     where tenants.password_hash is null
     returning id, email, name, password_hash`,
    [email.toLowerCase(), name, passwordHash]
  );
  return (res.rows[0] as TenantAccount) ?? null;
}

/** Plan changes keyed by Stripe customer (subscription updated/canceled events). */
export async function setTenantPlanByCustomer(
  stripeCustomerId: string,
  status: "active" | "past_due" | "canceled"
): Promise<void> {
  if (!storeConfigured()) return;
  await db().query(`update tenants set plan_status = $2 where stripe_customer_id = $1`, [
    stripeCustomerId,
    status,
  ]);
}

/** Stores a recovered brand snapshot (see the orchestrator's self-heal). */
export async function updateSiteBrand(siteId: string, brand: Record<string, unknown>): Promise<void> {
  await db().query(`update sites set brand = $2 where id = $1`, [siteId, JSON.stringify(brand)]);
}

/**
 * Refreshes the stored reachability verdict for a published page. The
 * verdict is first written seconds after the publish commit — before the
 * target site has rebuilt — so a page's badge could read error:404 forever
 * while the page was actually live a minute later.
 */
export async function updateLiveStatus(pageId: string, liveStatus: string): Promise<void> {
  await db().query(`update pages set live_status = $2 where id = $1`, [pageId, liveStatus]);
}

export async function markPagePublished(
  pageId: string,
  patch: { liveUrl?: string; liveStatus?: string; wpPageId?: number; githubSha?: string }
): Promise<void> {
  await db().query(
    `update pages set status = 'published', published_at = now(),
       live_url = coalesce($2, live_url), live_status = coalesce($3, live_status),
       wp_page_id = coalesce($4, wp_page_id), github_sha = coalesce($5, github_sha)
     where id = $1`,
    [pageId, patch.liveUrl ?? null, patch.liveStatus ?? null, patch.wpPageId ?? null, patch.githubSha ?? null]
  );
}
