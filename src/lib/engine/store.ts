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
      ssl: process.env.DATABASE_URL?.includes("localhost") ? undefined : { rejectUnauthorized: false },
    });
  }
  return pool;
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
};

export type PageSummary = {
  id: string;
  keyword: string;
  slug: string;
  folder: string;
  title: string;
  html: string | null;
  status: string;
};

const CADENCE_HOURS: Record<string, number> = { daily: 24, every3days: 72, weekly: 168 };

/** Sites whose cadence interval has elapsed, on an active tenant plan. */
export async function getDueSites(limit = 3): Promise<SiteRow[]> {
  if (!storeConfigured()) return [];
  const res = await db().query(
    `select s.* from sites s
     join tenants t on t.id = s.tenant_id
     where s.active and t.plan_status = 'active'
       and (s.last_run_at is null
            or s.last_run_at < now() - make_interval(hours =>
              case s.cadence when 'daily' then 24 when 'every3days' then 72 else 168 end))
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
  };
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
    `select id, keyword, slug, folder, title, status, ${withHtml ? "html" : "null as html"}
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
    await db().query(
      `update sites set platform=$2, cadence=$3, publish_mode=$4, business_name=$5, phone=$6,
         address=$7, city=$8, region=$9, service_area=$10, industry=$11, services=$12,
         target_locations=$13, seed_competitors=$14, avg_sale_value=$15, brand=$16
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
    `insert into connections (site_id, wp_user, wp_app_password, github_repo, github_token, github_branch, updated_at)
     values ($1,$2,$3,$4,$5,$6, now())
     on conflict (site_id) do update set
       wp_user = coalesce(nullif(excluded.wp_user, ''), connections.wp_user),
       wp_app_password = coalesce(nullif(excluded.wp_app_password, ''), connections.wp_app_password),
       github_repo = coalesce(nullif(excluded.github_repo, ''), connections.github_repo),
       github_token = coalesce(nullif(excluded.github_token, ''), connections.github_token),
       github_branch = coalesce(nullif(excluded.github_branch, ''), connections.github_branch),
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
