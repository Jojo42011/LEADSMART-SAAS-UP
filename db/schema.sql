-- Ascent multi tenant schema. Postgres (Neon / Supabase / RDS).
-- Apply with: psql $DATABASE_URL -f db/schema.sql
-- Every operational table is keyed by site_id; sites belong to tenants.

create table if not exists tenants (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  name          text,
  -- scrypt$salt$hash for email accounts; null for SSO-only tenants.
  password_hash text,
  plan_status   text not null default 'inactive',   -- inactive | active | past_due | canceled
  stripe_customer_id text,
  created_at    timestamptz not null default now()
);

-- Existing deployments: add the column without recreating the table.
alter table tenants add column if not exists password_hash text;

create table if not exists sites (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  url           text not null,
  -- Bare hostname (lowercased, no scheme/port, no leading "www."). The
  -- free-page allowance is charged against this rather than against the
  -- tenant, so a second signup on the same website inherits the pages the
  -- first one published. See siteHost() and FREE_PAGE_LIMIT.
  host          text not null default '',
  platform      text not null,                       -- wordpress | github | ftp
  cadence       text not null default 'daily',       -- daily | every3days | weekly
  publish_mode  text not null default 'autopilot',   -- autopilot | review
  active        boolean not null default true,
  -- Business profile (NAP single source of truth, from onboarding)
  business_name text not null default '',
  phone         text not null default '',
  address       text not null default '',
  city          text not null default '',
  region        text not null default '',
  service_area  text not null default '',
  industry      text not null default '',
  services      text not null default '',
  target_locations text not null default '',
  seed_competitors text not null default '',
  avg_sale_value   numeric,
  -- Brand snapshot from ingest (colors, fonts, title, nav, voice)
  brand         jsonb not null default '{}'::jsonb,
  last_run_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists sites_tenant_idx on sites(tenant_id);
create index if not exists sites_due_idx on sites(active, last_run_at);
-- The free-page allowance is looked up by host on every entitlement read
-- and inside the scheduler's due-sites query.
create index if not exists sites_host_idx on sites(host);

-- Publishing credentials, one row per site. Encrypt values with a KMS or
-- pgcrypto before insert; the app treats them as opaque.
create table if not exists connections (
  site_id       uuid primary key references sites(id) on delete cascade,
  wp_user       text,
  wp_app_password text,
  github_repo   text,
  github_token  text,
  github_branch text,
  gsc_refresh_token text,
  -- FTP/SFTP publishing, for hosts that are neither WordPress nor a
  -- GitHub-deployed repo. ftp_password is encrypted at rest like every
  -- other credential in this table.
  ftp_host      text,
  ftp_port      int,
  ftp_user      text,
  ftp_password  text,
  ftp_protocol  text,                                -- ftps | ftp | sftp
  ftp_root      text,                                -- e.g. public_html
  updated_at    timestamptz not null default now()
);

-- One row per agent cycle. status=running enforces single flight per site.
create table if not exists runs (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  status        text not null default 'running',     -- running | done | failed | timeout
  phase         text not null default 'start',
  keywords_found int not null default 0,
  pages_generated int not null default 0,
  published     int not null default 0,
  summary       text,
  error         text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index if not exists runs_site_idx on runs(site_id, started_at desc);
-- Single flight: at most one running cycle per site.
create unique index if not exists runs_single_flight on runs(site_id) where status = 'running';

create table if not exists keywords (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  term          text not null,
  intent        text not null default 'local',
  difficulty    text not null default 'low',
  opportunity   int not null default 50,
  reason        text not null default '',
  covered_by    uuid,                                -- pages.id once a page targets it
  position      numeric,                             -- latest real GSC position
  created_at    timestamptz not null default now(),
  unique (site_id, term)
);
create index if not exists keywords_site_idx on keywords(site_id, opportunity desc);

create table if not exists keyword_history (
  id            uuid primary key default gen_random_uuid(),
  keyword_id    uuid not null references keywords(id) on delete cascade,
  position      numeric,
  impressions   int,
  clicks        int,
  captured_at   timestamptz not null default now()
);
create index if not exists keyword_history_idx on keyword_history(keyword_id, captured_at desc);

create table if not exists competitors (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  domain        text not null,
  strength      text not null default '',
  weakness      text not null default '',
  created_at    timestamptz not null default now(),
  unique (site_id, domain)
);

create table if not exists pages (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  keyword       text not null,
  page_type     text not null default 'location',    -- location | service | article
  slug          text not null,
  folder        text not null default 'locations',
  title         text not null,
  meta_title    text not null default '',
  meta_description text not null default '',
  -- Retained after publish, not cleared. An earlier comment here claimed
  -- github pages were cleared once committed; nothing ever did that, and
  -- it turns out nothing should: the information-gain gate compares a new
  -- page against its siblings' stored HTML, the refresh path does the
  -- same, and the internal-link backfill rewrites it. Dropping it to save
  -- ~16 KB a page would quietly weaken the duplicate-content check and
  -- break forward linking, to reclaim ~0.6 GB a year against an 8 GB plan.
  html          text,
  word_count    int not null default 0,
  audit_score   int not null default 0,
  audit_grade   text not null default '',
  audit_report  jsonb not null default '{}'::jsonb,
  status        text not null default 'pending',     -- pending | approved | held | published | failed
  held_reason   text,
  live_url      text,
  live_status   text,                                -- live:200 | error:404 | unreachable
  wp_page_id    int,
  github_sha    text,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (site_id, slug)
);
create index if not exists pages_site_idx on pages(site_id, created_at desc);
create index if not exists pages_status_idx on pages(site_id, status);

-- ---------------------------------------------------------------------------
-- Self-repair for tables created by an earlier or partial setup.
--
-- "create table if not exists" skips a table that already exists, so a
-- tenants table born without the uuid default keeps rejecting inserts with
-- "null value in column id" no matter how many times this file is re-run.
-- These alters are idempotent and bring an existing installation up to the
-- definitions above without touching data.
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;
alter table tenants          alter column id set default gen_random_uuid();
alter table sites            alter column id set default gen_random_uuid();
alter table runs             alter column id set default gen_random_uuid();
alter table keywords         alter column id set default gen_random_uuid();
alter table keyword_history  alter column id set default gen_random_uuid();
alter table competitors      alter column id set default gen_random_uuid();
alter table pages            alter column id set default gen_random_uuid();

-- ---------------------------------------------------------------------------
-- Support enquiries.
--
-- Every message is written here before delivery is attempted, so a mail
-- transport that is misconfigured, rate limited, or simply not set up yet
-- loses nobody's message — it can be read out of the table and answered by
-- hand. delivered/delivery_error record what actually happened to the send,
-- not what we hoped happened.
-- ---------------------------------------------------------------------------
create table if not exists support_messages (
  id             uuid primary key default gen_random_uuid(),
  name           text,
  email          text not null,
  subject        text,
  message        text not null,
  /** Set when the sender was signed in; null for the public contact form. */
  tenant_email   text,
  delivered      boolean not null default false,
  delivery_error text,
  created_at     timestamptz not null default now()
);
create index if not exists support_messages_created_idx on support_messages(created_at desc);
alter table support_messages alter column id set default gen_random_uuid();

-- ---------------------------------------------------------------------------
-- Refresh tracking.
--
-- Freshness is a top-three controllable AI-citation factor (~83% of citations
-- come from pages updated within 12 months), and the agent scores it — but
-- until refresh cycles existed nothing ever acted on it, because every cycle
-- picked a NEW keyword and no code path returned to a published page.
--
-- refreshed_at is kept separate from published_at on purpose: published_at is
-- when the page first went live and belongs in the sitemap's record, while
-- refreshed_at drives the staleness queue. Overwriting one with the other
-- would destroy the ability to tell "this page is old" from "this page has
-- been maintained".
-- ---------------------------------------------------------------------------
alter table pages add column if not exists refreshed_at timestamptz;
alter table pages add column if not exists refresh_count int not null default 0;
create index if not exists pages_refresh_idx
  on pages(site_id, coalesce(refreshed_at, published_at));

-- ---------------------------------------------------------------------------
-- Customer notifications.
--
-- notify_publishes is the one notice an owner can switch off: welcome and
-- payment-failure mail is transactional (it concerns their account and their
-- money), while a per-page notice is a preference. Sent notices are recorded
-- delivered-or-not for the same reason support enquiries are — "we emailed
-- them" and "the email arrived" are different claims.
-- ---------------------------------------------------------------------------
alter table tenants add column if not exists notify_publishes boolean not null default true;

create table if not exists notifications (
  id            uuid primary key default gen_random_uuid(),
  tenant_email  text not null,
  kind          text not null,                      -- welcome | page_published | payment_failed
  delivered     boolean not null default false,
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists notifications_tenant_idx on notifications(tenant_email, created_at desc);
alter table notifications alter column id set default gen_random_uuid();

-- ---------------------------------------------------------------------------
-- Capacity work.
--
-- runs_running_idx: recoverStuckRuns filters on status alone and runs at the
-- top of every cycle. Without this it is a full scan of a table that grows
-- roughly 36,000 rows a year at a hundred customers. Partial, so it only
-- indexes the few rows in flight at any moment.
--
-- rate_limits: shared counters for unauthenticated endpoints. In-memory
-- counters are worthless on serverless — each instance keeps its own, so the
-- effective limit rises with load, which is backwards.
-- ---------------------------------------------------------------------------
create index if not exists runs_running_idx on runs(started_at) where status = 'running';

create table if not exists rate_limits (
  key          text primary key,
  count        int not null default 0,
  window_start timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Billing entitlement.
--
-- plan_status_since records when plan_status last CHANGED, which is what the
-- grace window for a failed payment is measured from. It must not be
-- restamped by the repeated past_due webhooks Stripe sends during dunning:
-- doing so rolls the window forward on every retry and it never expires, so a
-- customer whose card keeps failing would keep the agent indefinitely. The
-- writers in store.ts stamp it only on a genuine transition, and
-- test/entitlement.live.test.ts asserts that property against real Postgres.
--
-- plan_status now uses Stripe's own vocabulary (trialing, active, past_due,
-- unpaid, canceled, incomplete, incomplete_expired, paused) plus 'inactive'
-- for tenants who never subscribed. Entitlement is decided in exactly one
-- place, src/lib/engine/entitlement.ts, which supplies both the TypeScript
-- predicate and the SQL fragment the scheduler uses.
-- ---------------------------------------------------------------------------
alter table tenants add column if not exists plan_status_since timestamptz default now();
