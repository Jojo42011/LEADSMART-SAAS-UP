import { Pool } from "pg";
import { decryptSecret, encryptSecret } from "../secrets";
import { type PlanStatus, type Entitlement, entitlementFor, entitledSqlFragment } from "./entitlement";

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

/**
 * Connections per instance.
 *
 * The ceiling that matters is Supabase's pooler, not this number: the free
 * tier allows 200 client connections and every serverless instance opens
 * its own pool, so `max` multiplied by peak concurrent instances must stay
 * under it. At 3 that was 66 instances before "Max client connections
 * reached" — which fails everything at once rather than degrading, and
 * Vercel will scale past 66 during a spike.
 *
 * 6 is chosen against the work rather than by feel. A cron invocation now
 * runs several cycles concurrently and each cycle holds one connection at
 * a time, so a batch needs roughly as many connections as it has parallel
 * cycles; request handlers use one or two. Six covers a batch without
 * idling connections a web request will never use, and keeps the instance
 * ceiling at ~33 concurrent — which is why POOL_MAX is settable: on a
 * larger Supabase compute (or a bigger pooler allowance) this goes up
 * without a deploy.
 */
const POOL_MAX = Math.max(1, Number(process.env.PG_POOL_MAX) || 6);

function db(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: POOL_MAX,
      // Reap idle connections quickly. A serverless instance can sit warm
      // for minutes between requests, and every second it holds an idle
      // connection is a second another instance cannot have one.
      idleTimeoutMillis: 10_000,
      // Fail fast instead of hanging the whole function on a saturated
      // pooler: a request that cannot get a connection in 10s should
      // surface that, not consume the 300s budget waiting.
      connectionTimeoutMillis: 10_000,
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
 * Additive schema repairs, applied automatically on first use.
 *
 * This exists because of a real outage. Refresh cycles added
 * pages.refreshed_at and started selecting it, the code deployed, and
 * db/schema.sql had not been re-run against the live database — so every
 * read of the pages table failed with `column "refreshed_at" does not
 * exist`. The dashboard lost its page list AND its agent controls, since
 * a site list that fails to load is indistinguishable from an account
 * with no sites.
 *
 * "Remember to run the SQL after deploying" is not a safeguard, it is a
 * landmine with a delay on it. Every statement here is idempotent and
 * additive — add column if not exists, create table if not exists — so
 * running them on every cold start is safe and costs one round trip.
 * Destructive or data-shaping migrations deliberately do NOT belong here;
 * those stay in db/schema.sql for a human to run deliberately.
 */
const SCHEMA_REPAIRS = [
  `create extension if not exists pgcrypto`,
  `alter table pages add column if not exists refreshed_at timestamptz`,
  `alter table pages add column if not exists refresh_count int not null default 0`,
  `alter table tenants add column if not exists notify_publishes boolean not null default true`,
  // When plan_status last CHANGED. The grace window for a failed payment
  // is measured from here, so it must not be restamped by the repeated
  // webhooks Stripe sends during dunning — see setTenantPlan*.
  `alter table tenants add column if not exists plan_status_since timestamptz default now()`,
  // Websites the tenant is paying for. Stored rather than derived from
  // Stripe on every read, so onboarding does not fail when Stripe is slow;
  // the webhook and reconciliation keep it in step.
  `alter table tenants add column if not exists site_allowance int not null default 1`,
  `create table if not exists support_messages (
     id uuid primary key default gen_random_uuid(),
     name text, email text not null, subject text, message text not null,
     tenant_email text, delivered boolean not null default false,
     delivery_error text, created_at timestamptz not null default now())`,
  // recoverStuckRuns filters on status alone, which had no index: a full
  // scan of a table that grows ~36k rows a year at a hundred customers,
  // run at the top of every cycle. Partial, so it indexes only the
  // handful of rows that are ever in flight.
  `create index if not exists runs_running_idx on runs(started_at) where status = 'running'`,
  `create table if not exists rate_limits (
     key text primary key,
     count int not null default 0,
     window_start timestamptz not null default now())`,
  `create table if not exists notifications (
     id uuid primary key default gen_random_uuid(),
     tenant_email text not null, kind text not null,
     delivered boolean not null default false, error text,
     created_at timestamptz not null default now())`,
];

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const stmt of SCHEMA_REPAIRS) {
        // Each statement stands alone: one failing (a permissions quirk,
        // a table that genuinely is not there yet) must not stop the rest
        // from applying, and none of them are required for the queries
        // that do not touch their columns.
        // The raw pool, never sql(): routing these through the wrapper
        // would await the very promise this function is creating.
        await db().query(stmt).catch(() => {});
      }
    })();
  }
  return schemaReady;
}

/**
 * Every query goes through here so the schema repairs above are applied
 * before the first read, once per process. Bypassing this is how the
 * outage above happened; there is no second path to the database.
 */
async function sql(text: string, params?: unknown[]) {
  await ensureSchema();
  return db().query(text, params);
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
    // Deliberately the raw pool: this probe reports on the connection
    // itself, and routing it through the migration path would mask a
    // connection failure as a migration failure.
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
  /** False while the owner has paused autonomous production. */
  active: boolean;
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
  /** When the agent last rewrote this page in place. Null until refreshed. */
  refreshed_at: string | null;
  refresh_count: number;
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
  const res = await sql(
    `select s.* from sites s
     join tenants t on t.id = s.tenant_id
     where s.active and ${entitledSqlFragment("t")}
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
    const res = await sql(
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
  await sql(`update runs set ${sets} where id = $1`, [runId, ...Object.values(patch)]);
}

export async function finishRun(
  runId: string,
  status: "done" | "failed",
  summary: string,
  error?: string
): Promise<void> {
  await sql(
    `update runs set status = $2, summary = $3, error = $4, finished_at = now() where id = $1`,
    [runId, status, summary, error ?? null]
  );
}

export async function touchSiteRun(siteId: string): Promise<void> {
  await sql(`update sites set last_run_at = now() where id = $1`, [siteId]);
}

/**
 * Recovers cycles whose process died before finishRun() could mark them
 * done, so the single flight slot is never held by a run that no longer
 * exists.
 *
 * The default window is derived from the real ceiling rather than picked
 * for comfort: every route that runs a cycle declares maxDuration = 300,
 * so a serverless invocation is killed at five minutes and a run still
 * "running" at fifteen is dead with a wide margin for a slow publish. The
 * old window was 90 minutes, which meant one timed-out cycle locked the
 * owner out of their own Generate button for up to an hour and a half —
 * and since only the cron reaped, it looked like the button was broken
 * until the next hourly tick silently fixed it.
 *
 * Scoped to one site when a siteId is given, so claiming a slot can reap
 * its own site's corpse without touching other tenants' live runs.
 */
export async function recoverStuckRuns(siteId?: string, minutes = 15): Promise<number> {
  if (!storeConfigured()) return 0;
  const res = await sql(
    `update runs set status = 'timeout', finished_at = now(),
            error = coalesce(error, 'the cycle process ended before it could report a result')
     where status = 'running'
       and started_at < now() - make_interval(mins => $1::int)
       and ($2::uuid is null or site_id = $2::uuid)`,
    [Math.max(1, Math.round(minutes)), siteId ?? null]
  );
  return res.rowCount ?? 0;
}

/** When the currently-held flight slot for a site was claimed, if any. */
export async function runningSince(siteId: string): Promise<Date | null> {
  const res = await sql(
    `select started_at from runs where site_id = $1 and status = 'running' limit 1`,
    [siteId]
  );
  return (res.rows[0]?.started_at as Date) ?? null;
}

export async function getConnection(siteId: string): Promise<ConnectionRow | null> {
  const res = await sql(`select * from connections where site_id = $1`, [siteId]);
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
  const res = await sql(
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
  const res = await sql(
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
  await sql(
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
    await sql(
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
    await sql(
      `insert into competitors (site_id, domain, strength, weakness) values ($1, $2, $3, $4)
       on conflict (site_id, domain) do update set strength = excluded.strength, weakness = excluded.weakness`,
      [siteId, c.domain, c.strength, c.weakness]
    );
  }
}

export async function countKeywords(siteId: string): Promise<number> {
  const res = await sql(`select count(*)::int as n from keywords where site_id = $1`, [siteId]);
  return res.rows[0].n as number;
}

/** Highest opportunity keyword not yet covered by a page. */
export async function nextTarget(
  siteId: string
): Promise<{ id: string; term: string; intent: string } | null> {
  const res = await sql(
    `select id, term, intent from keywords
     where site_id = $1 and covered_by is null
     order by opportunity desc limit 1`,
    [siteId]
  );
  return res.rows[0] ?? null;
}

/**
 * Finds the keyword row for a term, creating one if the owner asked for a
 * page the research pool never produced. The dashboard's planned queue is
 * built from the local plan, whose terms don't always match the engine's
 * researched pool — "generate this now" must work for whatever card the
 * owner actually clicked, not just terms the engine already knew.
 */
export async function findOrCreateKeyword(
  siteId: string,
  term: string
): Promise<{ id: string; term: string; intent: string }> {
  const normalized = term.trim().toLowerCase();
  const existing = await sql(
    `select id, term, intent from keywords where site_id = $1 and lower(term) = $2 limit 1`,
    [siteId, normalized]
  );
  if (existing.rows[0]) return existing.rows[0];
  const created = await sql(
    `insert into keywords (site_id, term, intent, opportunity) values ($1, $2, 'informational', 50)
     returning id, term, intent`,
    [siteId, normalized]
  );
  return created.rows[0];
}

/**
 * Deletes a page if — and only if — it belongs to a site owned by the
 * given email, returning what the caller needs to also remove the file
 * from the connected repo. The keyword is uncovered so the queue shows it
 * as planned again rather than silently never revisiting it.
 */
export async function deletePageOwned(
  pageId: string,
  email: string
): Promise<{
  siteId: string;
  slug: string;
  folder: string;
  keyword: string;
  /** The WordPress page to remove from the live site, when it published there. */
  wpPageId: number | null;
  liveUrl: string | null;
} | null> {
  const res = await sql(
    `delete from pages p using sites s, tenants t
     where p.id = $1 and p.site_id = s.id and s.tenant_id = t.id and t.email = $2
     returning p.site_id as site_id, p.slug, p.folder, p.keyword, p.wp_page_id, p.live_url`,
    [pageId, email.toLowerCase()]
  );
  const row = res.rows[0];
  if (!row) return null;
  await sql(`update keywords set covered_by = null where covered_by = $1`, [pageId]);
  return {
    siteId: row.site_id,
    slug: row.slug,
    folder: row.folder,
    keyword: row.keyword,
    wpPageId: row.wp_page_id ?? null,
    liveUrl: row.live_url ?? null,
  };
}

/** Removes an uncovered keyword the owner dismissed from the queue. */
export async function deleteKeywordOwned(siteId: string, term: string, email: string): Promise<boolean> {
  const res = await sql(
    `delete from keywords k using sites s, tenants t
     where k.site_id = $1 and lower(k.term) = $2 and k.covered_by is null
       and k.site_id = s.id and s.tenant_id = t.id and t.email = $3`,
    [siteId, term.trim().toLowerCase(), email.toLowerCase()]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function listPages(siteId: string, withHtml = false): Promise<PageSummary[]> {
  const res = await sql(
    `select id, keyword, slug, folder, title, status,
            live_url, live_status, audit_score, audit_grade, held_reason,
            word_count, published_at, refreshed_at, refresh_count, created_at,
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
  const res = await sql(
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
  await sql(`update keywords set covered_by = $2 where id = $1`, [keywordId, pageId]);
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
): Promise<{ tenantId: string; siteId: string; created: boolean } | null> {
  if (!storeConfigured()) return null;

  const tenantRes = await sql(
    `insert into tenants (email, name) values ($1, $2)
     on conflict (email) do update set name = coalesce(nullif(excluded.name, ''), tenants.name)
     returning id`,
    [input.email.toLowerCase(), input.name ?? ""]
  );
  const tenantId = tenantRes.rows[0].id as string;

  const s = input.site;
  const existing = await sql(`select id from sites where tenant_id = $1 and url = $2`, [
    tenantId,
    s.url,
  ]);

  let siteId: string;


  // True only when this call inserted the site row, so first-run side

  // effects (the welcome email) do not fire on every Settings save.

  let created = false;
  if (existing.rows[0]) {
    siteId = existing.rows[0].id as string;
    // Brand only overwrites when the caller actually sent one. Saves that
    // carry no brand snapshot (a Settings save, a replayed onboarding)
    // used to blank it, and every page generated after that rendered in
    // default black-and-white instead of the site's own colors.
    await sql(
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
    const siteRes = await sql(
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
    created = true;
  }

  const c = input.connection;
  await sql(
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

  return { tenantId, siteId, created };
}

/**
 * Billing activation, called by the Stripe webhook. Upserts by email so
 * activation works even if payment lands before onboarding created the
 * tenant row.
 */
/**
 * Sets a tenant's plan status, stamping plan_status_since only when the
 * status actually changes.
 *
 * That condition carries the whole grace period. Stripe emits an event
 * per dunning retry, all of them reporting past_due, so restamping on
 * every write would roll the seven-day window forward each time and it
 * would never expire — a customer whose card kept failing would get the
 * agent forever. Returns the previous status so callers can tell a real
 * transition from a repeat and notify only on the former.
 */
export async function setTenantPlanByEmail(
  email: string,
  status: PlanStatus,
  stripeCustomerId?: string
): Promise<{ previous: string | null; changed: boolean }> {
  if (!storeConfigured()) return { previous: null, changed: false };
  const before = await sql(`select plan_status from tenants where email = $1`, [email.toLowerCase()]);
  const previous = (before.rows[0]?.plan_status as string) ?? null;
  await sql(
    `insert into tenants (email, plan_status, stripe_customer_id, plan_status_since)
     values ($1, $2, $3, now())
     on conflict (email) do update set
       plan_status = excluded.plan_status,
       stripe_customer_id = coalesce(excluded.stripe_customer_id, tenants.stripe_customer_id),
       plan_status_since = case
                             when tenants.plan_status is distinct from excluded.plan_status
                             then now()
                             else tenants.plan_status_since
                           end`,
    [email.toLowerCase(), status, stripeCustomerId ?? null]
  );
  return { previous, changed: previous !== status };
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

  const drafts = await sql(
    `delete from pages where site_id = $1 and status <> 'published'`,
    [siteId]
  );
  const keywords = await sql(`delete from keywords where site_id = $1`, [siteId]);
  const competitors = await sql(`delete from competitors where site_id = $1`, [siteId]);
  // Null last_run_at so the cadence check treats the site as due immediately.
  await sql(`update sites set last_run_at = null where id = $1`, [siteId]);

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
  const res = await sql(
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
  const res = await sql(
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
  const res = await sql(
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
  const res = await sql(
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
  status: PlanStatus
): Promise<{ email: string | null; previous: string | null; changed: boolean }> {
  if (!storeConfigured()) return { email: null, previous: null, changed: false };
  const res = await sql(
    `update tenants set
       plan_status = $2,
       plan_status_since = case
                             when plan_status is distinct from $2 then now()
                             else plan_status_since
                           end
     where stripe_customer_id = $1
     returning email, plan_status`,
    [stripeCustomerId, status]
  );
  const row = res.rows[0];
  if (!row) return { email: null, previous: null, changed: false };
  // plan_status is already the new value here, so the transition is
  // inferred from whether plan_status_since was just moved.
  const sinceRes = await sql(
    `select plan_status_since > now() - interval '5 seconds' as just_changed
       from tenants where stripe_customer_id = $1`,
    [stripeCustomerId]
  );
  return {
    email: row.email as string,
    previous: null,
    changed: Boolean(sinceRes.rows[0]?.just_changed),
  };
}

/**
 * The master switch for autonomous production.
 *
 * getDueSites already filters on sites.active, so flipping this column is
 * all that stopping the agent requires — no new scheduling state, and no
 * risk of the cron and the UI disagreeing about whether work is paused.
 * Scoped through the ownership join so one account cannot pause another's
 * agent. Returns how many sites changed, which is what the caller reports.
 */
export async function setAgentActive(email: string, active: boolean): Promise<number> {
  if (!storeConfigured()) return 0;
  const res = await sql(
    `update sites s set active = $2
     from tenants t
     where s.tenant_id = t.id and t.email = $1`,
    [email.toLowerCase(), active]
  );
  return res.rowCount ?? 0;
}

/** Stores a recovered brand snapshot (see the orchestrator's self-heal). */
export async function updateSiteBrand(siteId: string, brand: Record<string, unknown>): Promise<void> {
  await sql(`update sites set brand = $2 where id = $1`, [siteId, JSON.stringify(brand)]);
}

/**
 * Refreshes the stored reachability verdict for a published page. The
 * verdict is first written seconds after the publish commit — before the
 * target site has rebuilt — so a page's badge could read error:404 forever
 * while the page was actually live a minute later.
 */
export async function updateLiveStatus(pageId: string, liveStatus: string): Promise<void> {
  await sql(`update pages set live_status = $2 where id = $1`, [pageId, liveStatus]);
}

export async function markPagePublished(
  pageId: string,
  patch: { liveUrl?: string; liveStatus?: string; wpPageId?: number; githubSha?: string }
): Promise<void> {
  await sql(
    `update pages set status = 'published', published_at = now(),
       live_url = coalesce($2, live_url), live_status = coalesce($3, live_status),
       wp_page_id = coalesce($4, wp_page_id), github_sha = coalesce($5, github_sha)
     where id = $1`,
    [pageId, patch.liveUrl ?? null, patch.liveStatus ?? null, patch.wpPageId ?? null, patch.githubSha ?? null]
  );
}

/* ------------------------------ Support mail ----------------------------- */

export type SupportMessage = {
  name?: string | null;
  email: string;
  subject?: string | null;
  message: string;
  tenantEmail?: string | null;
};

/**
 * Records a support enquiry before any send is attempted, and returns its
 * id so the delivery outcome can be written back honestly.
 *
 * Storing first is the point: if the mail transport is unconfigured or
 * failing, the message is still on disk to be answered by hand rather than
 * discarded behind a cheerful "thanks, we'll be in touch".
 */
export async function insertSupportMessage(m: SupportMessage): Promise<string | null> {
  if (!storeConfigured()) return null;
  const res = await sql(
    `insert into support_messages (name, email, subject, message, tenant_email)
     values ($1, $2, $3, $4, $5) returning id`,
    [m.name ?? null, m.email, m.subject ?? null, m.message, m.tenantEmail ?? null]
  );
  return res.rows[0].id as string;
}

export async function markSupportDelivered(
  id: string,
  delivered: boolean,
  error?: string
): Promise<void> {
  if (!storeConfigured()) return;
  await sql(
    `update support_messages set delivered = $2, delivery_error = $3 where id = $1`,
    [id, delivered, error ?? null]
  );
}

/**
 * One page with its full HTML plus the owning site row, fetched through
 * the tenant join so an id from another account returns nothing. This is
 * what the owner's Publish button operates on.
 */
export async function getPageWithSiteOwned(
  pageId: string,
  email: string
): Promise<{
  page: { id: string; slug: string; folder: string; title: string; keyword: string; status: string; html: string | null; live_url: string | null };
  site: SiteRow;
} | null> {
  const res = await sql(
    `select p.id, p.slug, p.folder, p.title, p.keyword, p.status, p.html, p.live_url,
            row_to_json(s.*) as site
     from pages p
     join sites s on s.id = p.site_id
     join tenants t on t.id = s.tenant_id
     where p.id = $1 and t.email = $2`,
    [pageId, email.toLowerCase()]
  );
  const row = res.rows[0];
  if (!row) return null;
  const { site, ...page } = row as typeof res.rows[0] & { site: SiteRow };
  return { page, site };
}

/** The tenant's billing identity: plan status plus Stripe customer id. */
export async function getTenantBillingByEmail(
  email: string
): Promise<{ planStatus: string; stripeCustomerId: string | null } | null> {
  if (!storeConfigured()) return null;
  const res = await sql(
    `select plan_status, stripe_customer_id from tenants where email = $1`,
    [email.toLowerCase()]
  );
  const row = res.rows[0];
  if (!row) return null;
  return { planStatus: row.plan_status as string, stripeCustomerId: (row.stripe_customer_id as string) ?? null };
}

/**
 * Replaces a page's stored HTML.
 *
 * Used after a WordPress publish rewrites artwork references from the
 * generator's root-relative paths to real media-library URLs: persisting
 * the published version means a later republish, preview, or sibling
 * comparison sees what the site actually serves rather than a path that
 * only ever resolved on GitHub.
 */
export async function updatePageHtml(pageId: string, html: string): Promise<void> {
  if (!storeConfigured()) return;
  await sql(`update pages set html = $2 where id = $1`, [pageId, html]);
}

/* -------------------------------- Refresh -------------------------------- */

export type RefreshCandidate = {
  id: string;
  keyword: string;
  slug: string;
  folder: string;
  page_type: string;
  title: string;
  audit_score: number;
  live_url: string | null;
  wp_page_id: number | null;
  /** Days since the page last changed — published or refreshed. */
  stale_days: number;
};

/**
 * The stalest live page past the refresh threshold, or null.
 *
 * Staleness counts from the last time the page actually changed
 * (refreshed_at, falling back to published_at), not from when it was first
 * written — a page maintained last week is fresh regardless of its age.
 * Only published pages are candidates: refreshing a held draft would be
 * rewriting something no reader has ever seen.
 */
export async function getRefreshCandidate(
  siteId: string,
  olderThanDays: number
): Promise<RefreshCandidate | null> {
  if (!storeConfigured()) return null;
  const res = await sql(
    `select id, keyword, slug, folder, page_type, title, audit_score, live_url, wp_page_id,
            floor(extract(epoch from now() - coalesce(refreshed_at, published_at)) / 86400)::int as stale_days
     from pages
     where site_id = $1
       and status = 'published'
       and coalesce(refreshed_at, published_at) is not null
       and coalesce(refreshed_at, published_at) < now() - make_interval(days => $2::int)
     order by coalesce(refreshed_at, published_at) asc
     limit 1`,
    [siteId, Math.max(1, Math.round(olderThanDays))]
  );
  return (res.rows[0] as RefreshCandidate) ?? null;
}

/** How many published pages this site has — the library the agent maintains. */
export async function countPublishedPages(siteId: string): Promise<number> {
  if (!storeConfigured()) return 0;
  const res = await sql(
    `select count(*)::int as n from pages where site_id = $1 and status = 'published'`,
    [siteId]
  );
  return (res.rows[0]?.n as number) ?? 0;
}

/** Records a completed refresh: new content, new score, and a fresh clock. */
export async function markPageRefreshed(
  pageId: string,
  patch: { html: string; auditScore: number; auditGrade: string; auditReport: unknown; wordCount: number; liveStatus?: string }
): Promise<void> {
  await sql(
    `update pages set html = $2, audit_score = $3, audit_grade = $4, audit_report = $5,
            word_count = $6, live_status = coalesce($7, live_status),
            refreshed_at = now(), refresh_count = refresh_count + 1
     where id = $1`,
    [pageId, patch.html, patch.auditScore, patch.auditGrade, JSON.stringify(patch.auditReport), patch.wordCount, patch.liveStatus ?? null]
  );
}

/** One page as a refresh candidate, by id, regardless of how stale it is. */
export async function getPageAsRefreshCandidate(
  siteId: string,
  pageId: string
): Promise<RefreshCandidate | null> {
  if (!storeConfigured()) return null;
  const res = await sql(
    `select id, keyword, slug, folder, page_type, title, audit_score, live_url, wp_page_id,
            coalesce(floor(extract(epoch from now() - coalesce(refreshed_at, published_at)) / 86400)::int, 0) as stale_days
     from pages where id = $1 and site_id = $2 and status = 'published'`,
    [pageId, siteId]
  );
  return (res.rows[0] as RefreshCandidate) ?? null;
}

/* ----------------------------- Notifications ----------------------------- */

export async function getTenantNotifyPrefs(
  email: string
): Promise<{ notifyPublishes: boolean } | null> {
  if (!storeConfigured()) return null;
  const res = await sql(`select notify_publishes from tenants where email = $1`, [
    email.toLowerCase(),
  ]);
  const row = res.rows[0];
  return row ? { notifyPublishes: Boolean(row.notify_publishes) } : null;
}

export async function setTenantNotifyPrefs(email: string, notifyPublishes: boolean): Promise<void> {
  if (!storeConfigured()) return;
  await sql(`update tenants set notify_publishes = $2 where email = $1`, [
    email.toLowerCase(),
    notifyPublishes,
  ]);
}

/**
 * Whether a notice of this kind already went to this tenant recently.
 *
 * Some notices are recomputed from state on every heartbeat rather than
 * fired by a one-shot event — the trial-ending warning is derived from
 * the trial date each run, which is what makes it recoverable if a single
 * send fails. That same property would mail it every day of the warning
 * window without this check.
 */
export async function notificationSentWithin(
  email: string,
  kind: string,
  hours: number
): Promise<boolean> {
  if (!storeConfigured()) return false;
  try {
    const res = await sql(
      `select 1 from notifications
       where tenant_email = $1 and kind = $2
         and created_at > now() - make_interval(hours => $3::int)
       limit 1`,
      [email.toLowerCase(), kind, Math.max(1, Math.round(hours))]
    );
    return res.rowCount ? res.rowCount > 0 : false;
  } catch {
    // Unknown means "not sent": a duplicate notice is a smaller failure
    // than a suppressed one.
    return false;
  }
}

/** Records what was sent and whether it actually left — never just that it was attempted. */
export async function recordNotification(
  email: string,
  kind: string,
  delivered: boolean,
  error?: string | null
): Promise<void> {
  if (!storeConfigured()) return;
  await sql(
    `insert into notifications (tenant_email, kind, delivered, error) values ($1, $2, $3, $4)`,
    [email.toLowerCase(), kind, delivered, error ?? null]
  );
}

/** The tenant email that owns a site — the address customer notices go to. */
export async function getSiteOwnerEmail(siteId: string): Promise<string | null> {
  if (!storeConfigured()) return null;
  const res = await sql(
    `select t.email from sites s join tenants t on t.id = s.tenant_id where s.id = $1`,
    [siteId]
  );
  return (res.rows[0]?.email as string) ?? null;
}

/** The tenant behind a Stripe customer id, for billing notices. */
export async function getTenantEmailByCustomer(customerId: string): Promise<string | null> {
  if (!storeConfigured()) return null;
  const res = await sql(`select email from tenants where stripe_customer_id = $1`, [customerId]);
  return (res.rows[0]?.email as string) ?? null;
}

/** The WordPress page id for a stored page, so a rewrite updates in place. */
export async function wpPageIdFor(pageId: string): Promise<number | null> {
  if (!storeConfigured()) return null;
  const res = await sql(`select wp_page_id from pages where id = $1`, [pageId]);
  return (res.rows[0]?.wp_page_id as number) ?? null;
}

/* ------------------------------ Rate limits ------------------------------ */

/**
 * Counts one request against a fixed window, atomically.
 *
 * A single upsert does the whole job: insert the key, or — if the stored
 * window has expired — reset it, otherwise increment. Doing this as a
 * read-then-write would race under exactly the concurrency it exists to
 * defend against, letting a burst through while every instance reads the
 * same pre-increment count.
 *
 * Fails open. A store that cannot be reached returns "allowed" rather
 * than locking every caller out, because these endpoints include the
 * support form and a database outage is when people most need to write in.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; retryAfterSeconds: number; degraded?: true }> {
  if (!storeConfigured()) return { allowed: true, retryAfterSeconds: 0, degraded: true };
  try {
    const res = await sql(
      `insert into rate_limits (key, count, window_start)
       values ($1, 1, now())
       on conflict (key) do update set
         count = case
                   when rate_limits.window_start < now() - make_interval(secs => $3::int)
                   then 1
                   else rate_limits.count + 1
                 end,
         window_start = case
                          when rate_limits.window_start < now() - make_interval(secs => $3::int)
                          then now()
                          else rate_limits.window_start
                        end
       returning
         -- The verdict is decided in SQL, in the same statement that does
         -- the increment. Returning the raw count and comparing it in JS
         -- also works, but it left $2 unreferenced, and Postgres rejects a
         -- parameter whose type it cannot infer — "could not determine
         -- data type of parameter $2". Every call threw, the catch below
         -- failed open, and the limiter allowed 40 of 40 requests against
         -- a limit of 5 while looking perfectly healthy.
         count <= $2::int as allowed,
         greatest(0, ceil(extract(epoch from (window_start + make_interval(secs => $3::int)) - now())))::int as retry_after`,
      [key, Math.max(1, Math.round(limit)), Math.max(1, Math.round(windowSeconds))]
    );
    const row = res.rows[0];
    return {
      allowed: Boolean(row?.allowed),
      retryAfterSeconds: row?.retry_after ?? windowSeconds,
    };
  } catch (e) {
    // Fail open, but never quietly. An unreachable store must not lock
    // people out of the support form during an outage — and a limiter
    // that is failing open is indistinguishable from one that is working
    // unless it says so, which is exactly how the bug above survived.
    console.error(
      `[rate-limit] failing open for ${key}: ${e instanceof Error ? e.message : "unknown error"}`
    );
    return { allowed: true, retryAfterSeconds: 0, degraded: true };
  }
}

/**
 * Drops expired counters. Called from the cron so the table cannot grow
 * without bound on a busy deployment — one row per client per bucket
 * would otherwise accumulate for the life of the database.
 */
export async function pruneRateLimits(): Promise<number> {
  if (!storeConfigured()) return 0;
  try {
    const res = await sql(`delete from rate_limits where window_start < now() - interval '1 day'`);
    return res.rowCount ?? 0;
  } catch {
    return 0;
  }
}

/**
 * A tenant's entitlement, resolved from stored plan state.
 *
 * The one read every on-demand action uses. Returns null when there is no
 * store — a keyless local deployment stays fully usable, since there is no
 * billing to enforce there.
 */
export async function entitlementForEmail(email: string): Promise<Entitlement | null> {
  if (!storeConfigured()) return null;
  const res = await sql(
    `select plan_status, plan_status_since from tenants where email = $1`,
    [email.toLowerCase()]
  );
  const row = res.rows[0];
  if (!row) return entitlementFor("inactive", null);
  return entitlementFor(row.plan_status as string, row.plan_status_since as Date);
}

/** Tenants with a Stripe customer, for reconciling drift against Stripe. */
export async function listBillableTenants(
  limit = 200
): Promise<{ email: string; stripeCustomerId: string; planStatus: string }[]> {
  if (!storeConfigured()) return [];
  const res = await sql(
    `select email, stripe_customer_id, plan_status from tenants
     where stripe_customer_id is not null
     order by plan_status_since asc nulls first
     limit $1`,
    [limit]
  );
  return res.rows.map((r) => ({
    email: r.email as string,
    stripeCustomerId: r.stripe_customer_id as string,
    planStatus: r.plan_status as string,
  }));
}

/* -------------------------------- Seats ---------------------------------- */

/**
 * How many websites a tenant is paying for, and how many they have used.
 *
 * site_allowance is stored rather than derived from Stripe on every read:
 * onboarding needs it before it can provision, and blocking that on a
 * third-party API call would make signing up fail whenever Stripe is slow.
 * The webhook and the reconciliation keep it current, and Stripe remains
 * the authority whenever the two disagree.
 */
export async function siteAllowanceFor(
  email: string
): Promise<{ allowance: number; used: number }> {
  if (!storeConfigured()) return { allowance: 99, used: 0 };
  const res = await sql(
    `select coalesce(t.site_allowance, 1) as allowance,
            (select count(*)::int from sites s where s.tenant_id = t.id) as used
     from tenants t where t.email = $1`,
    [email.toLowerCase()]
  );
  const row = res.rows[0];
  if (!row) return { allowance: 1, used: 0 };
  return { allowance: Number(row.allowance), used: Number(row.used) };
}

export async function setSiteAllowance(email: string, allowance: number): Promise<void> {
  if (!storeConfigured()) return;
  await sql(`update tenants set site_allowance = $2 where email = $1`, [
    email.toLowerCase(),
    Math.max(1, Math.floor(allowance) || 1),
  ]);
}

export async function setSiteAllowanceByCustomer(
  stripeCustomerId: string,
  allowance: number
): Promise<void> {
  if (!storeConfigured()) return;
  await sql(`update tenants set site_allowance = $2 where stripe_customer_id = $1`, [
    stripeCustomerId,
    Math.max(1, Math.floor(allowance) || 1),
  ]);
}

/**
 * Erase an account and everything belonging to it.
 *
 * The privacy policy promises this and the terms say it can be done from
 * the dashboard, so it has to be real rather than a support ticket. It is
 * also the one operation in the product with no undo, which is why it
 * reports what it removed instead of returning void: "we deleted your
 * account" is a claim, and the caller should be able to show the counts
 * behind it.
 *
 * Most tables hang off tenants or sites with `on delete cascade`, so
 * deleting the tenant row takes sites, connections, runs, keywords,
 * keyword_history, competitors and pages with it. Two tables do NOT:
 * notifications and support_messages key off the email as plain text
 * rather than a foreign key, so a cascade leaves rows behind that still
 * name the person. Those are deleted explicitly — a "deleted" account
 * that leaves the email address in two tables has not been deleted.
 *
 * Published pages on the customer's own website are deliberately NOT
 * touched. They are the customer's property and the policy says so; a
 * deletion request is about our records, not about vandalising a site we
 * were paid to build.
 */
export type AccountDeletion = {
  tenants: number;
  sites: number;
  pages: number;
  notifications: number;
  supportMessages: number;
};

export async function deleteAccount(email: string): Promise<AccountDeletion> {
  if (!storeConfigured()) {
    return { tenants: 0, sites: 0, pages: 0, notifications: 0, supportMessages: 0 };
  }
  const key = email.trim().toLowerCase();

  // Counted before the delete: afterwards there is nothing left to count,
  // and the numbers are what the confirmation screen reports back.
  const counts = await sql(
    `select
       (select count(*) from sites s join tenants t on t.id = s.tenant_id where lower(t.email) = $1) as sites,
       (select count(*) from pages p
          join sites s on s.id = p.site_id
          join tenants t on t.id = s.tenant_id
         where lower(t.email) = $1) as pages`,
    [key]
  );

  const notifications = await sql(`delete from notifications where lower(tenant_email) = $1`, [key]);
  const support = await sql(
    `delete from support_messages where lower(tenant_email) = $1 or lower(email) = $1`,
    [key]
  );
  // Rate-limit counters are keyed by an opaque string that embeds the
  // identifier, so they are cleared by prefix rather than by equality.
  await sql(`delete from rate_limits where key like $1`, [`%${key}%`]);

  const tenant = await sql(`delete from tenants where lower(email) = $1`, [key]);

  return {
    tenants: tenant.rowCount ?? 0,
    sites: Number(counts.rows[0]?.sites ?? 0),
    pages: Number(counts.rows[0]?.pages ?? 0),
    notifications: notifications.rowCount ?? 0,
    supportMessages: support.rowCount ?? 0,
  };
}

/**
 * Drop the stored credentials for one connected service.
 *
 * The privacy policy tells customers they can disconnect Google, GitHub
 * or Search Console from the dashboard and that doing so revokes our
 * stored token. Google's OAuth reviewers check that claim, and it was not
 * true until this existed.
 *
 * Scoped through the tenant join so an id from another account clears
 * nothing, and returns whether a row actually changed so the caller can
 * distinguish "disconnected" from "there was nothing connected".
 */
export type ConnectedService = "wordpress" | "github" | "gsc";

export async function disconnectService(
  email: string,
  siteId: string,
  service: ConnectedService
): Promise<boolean> {
  if (!storeConfigured()) return false;
  const columns: Record<ConnectedService, string> = {
    wordpress: "wp_user = null, wp_app_password = null",
    github: "github_token = null, github_repo = null, github_branch = null",
    gsc: "gsc_refresh_token = null",
  };
  const res = await sql(
    `update connections c
        set ${columns[service]}, updated_at = now()
      from sites s
      join tenants t on t.id = s.tenant_id
     where c.site_id = s.id
       and s.id = $2
       and lower(t.email) = $1`,
    [email.trim().toLowerCase(), siteId]
  );
  return (res.rowCount ?? 0) > 0;
}

/** The stored Google refresh token, so it can be revoked at Google too. */
export async function getGscRefreshToken(email: string, siteId: string): Promise<string | null> {
  if (!storeConfigured()) return null;
  const res = await sql(
    `select c.gsc_refresh_token from connections c
      join sites s on s.id = c.site_id
      join tenants t on t.id = s.tenant_id
     where s.id = $2 and lower(t.email) = $1`,
    [email.trim().toLowerCase(), siteId]
  );
  return (res.rows[0]?.gsc_refresh_token as string | null) ?? null;
}
