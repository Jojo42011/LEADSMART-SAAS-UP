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
  platform      text not null,                       -- wordpress | github
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
  html          text,                                -- cleared after publish for github targets
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
