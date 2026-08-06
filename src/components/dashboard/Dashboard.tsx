"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Wordmark } from "@/components/ui/Wordmark";
import { Field } from "@/components/onboarding/fields";
import {
  useOnboarding,
  type OnboardingData,
  type Cadence,
  type PublishMode,
} from "@/lib/onboarding";
import { buildPlan, type PageDraft } from "@/lib/plan";
import { PRICE_PER_SITE } from "@/lib/pricing";
import { site } from "@/lib/site";
import { SiteSwitcher } from "./SiteSwitcher";
import { Connections } from "./Connections";
import { SiteRebuild } from "./SiteRebuild";
import { Citations } from "./Citations";
import { GEO_TACTICS, CORE_LOCAL_CITATIONS } from "@/lib/geo";
import { loadIntel, type Intel } from "@/lib/intel";
import { applySettings, type ApplyResult, type ApplyStage } from "@/lib/apply-settings";
import { refreshAndSaveResearch } from "@/lib/research-client";
import { useAgentPages, allPages, type AgentPage, type Entitlement } from "@/lib/agent-pages";
import { useSearchSnapshot } from "@/lib/search-snapshot";
import { Billing } from "./Billing";
import { Strategy } from "./Strategy";
import { ContactForm } from "../support/ContactForm";
import { ThemeToggle } from "../ui/ThemeToggle";
import { useNow } from "@/lib/use-now";
import { Analytics } from "./Analytics";

// Billing is a Tab but not a navItem: it is entered through the Plan card
// (and the mobile switcher), not the section list.
type Tab = "Overview" | "Strategy" | "Content" | "Analytics" | "Keywords" | "Competitors" | "Citations" | "Settings" | "Billing" | "Support";

const navItems: { label: Tab; icon: React.ReactNode }[] = [
  {
    label: "Overview",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    label: "Strategy",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 3v6m0 6v6" strokeLinecap="round" />
        <circle cx="12" cy="12" r="3" />
        <path d="M5 7h3M16 17h3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Content",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 8h6M9 12h6M9 16h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Analytics",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Keywords",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="m4 17 5-5 3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 7h5v5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Competitors",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Citations",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 21s-7-4.5-7-10a7 7 0 0 1 14 0c0 5.5-7 10-7 10Z" />
        <circle cx="12" cy="11" r="2.5" />
      </svg>
    ),
  },
  {
    label: "Settings",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1m0-14.2-2.1 2.1m-10 10-2.1 2.1" strokeLinecap="round" />
      </svg>
    ),
  },
];

const statusStyles: Record<string, string> = {
  Drafting: "bg-accent/10 text-accent",
  Queued: "bg-ink/[0.06] text-ink/70",
  Researching: "bg-ink/[0.04] text-muted",
  Rewriting: "bg-ink text-on-ink",
  Held: "bg-ink text-on-ink",
  Tracking: "bg-ink/[0.06] text-ink/70",
  // Reconciled statuses when the engine is connected: real page states
  // replace the simulated preview labels.
  Published: "bg-accent/10 text-accent",
  Planned: "bg-ink/[0.06] text-ink/70",
  "In review": "bg-ink/[0.04] text-muted",
  // Engine-side statuses from the pages table.
  published: "bg-accent/10 text-accent",
  approved: "bg-ink/[0.06] text-ink/70",
  pending: "bg-ink/[0.04] text-muted",
  held: "bg-ink text-on-ink",
  failed: "bg-ink text-on-ink",
};

const threatStyles: Record<string, string> = {
  High: "bg-ink text-on-ink",
  Moderate: "bg-accent/10 text-accent",
  Low: "bg-ink/[0.06] text-muted",
};

const gapTypeStyles: Record<string, string> = {
  Core: "bg-accent/10 text-accent",
  Differentiator: "bg-ink/[0.08] text-ink/80",
  Commodity: "bg-ink/[0.04] text-muted",
  Opportunity: "bg-ink text-on-ink",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-[11.5px] font-medium ${
        statusStyles[status] ?? "bg-ink/[0.06] text-ink/70"
      }`}
    >
      {status}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  // min-w-0 stops grid/flex blowout: without it, a card with unbreakable
  // content (long labels, mono numbers) can force its grid track wider than
  // the viewport, since grid items default to min-width: auto.
  return <div className={`min-w-0 rounded-2xl border border-line bg-paper ${className}`}>{children}</div>;
}

function EmptyState({
  title,
  sub,
  action,
}: {
  title: string;
  sub: string;
  /** Optional call-to-action rendered under the copy (e.g. a research button). */
  action?: React.ReactNode;
}) {
  return (
    <Card className="p-10 text-center">
      <p className="text-[14.5px] font-medium">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{sub}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </Card>
  );
}

/**
 * The free preview's state, stated plainly at the top of every tab.
 *
 * Two different messages, and conflating them would be the whole mistake:
 * while pages remain this is a progress note on work that is actually
 * happening, and it stays quiet. Once the allowance is spent the agent has
 * genuinely stopped, and saying so loudly is honest — a dashboard that
 * keeps looking busy after the engine is off is the thing that makes
 * someone feel cheated later.
 *
 * Nothing is rendered for a paying customer, and nothing is rendered
 * before the entitlement has loaded: a banner that flashes "0 of 3 free
 * pages" at a subscriber on every refresh is worse than no banner.
 */
function FreePreviewBanner({
  entitlement,
  onUpgrade,
}: {
  entitlement: Entitlement | null;
  onUpgrade: () => void;
}) {
  if (!entitlement?.free) return null;
  if (entitlement.state !== "free" && entitlement.state !== "free_limit") return null;
  const { used, limit } = entitlement.free;
  const spent = entitlement.state === "free_limit";

  return (
    <div
      className={`mb-6 rounded-2xl border p-5 sm:p-6 ${
        spent ? "border-line-dark bg-fill-strong text-on-ink" : "border-line bg-paper"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={`label-mono ${spent ? "text-accent" : "text-muted"}`}>
            {spent ? "Free preview finished" : "Free preview"}
          </p>
          <p className="mt-2 text-[15px] font-medium">
            {spent
              ? `You've used all ${limit} free pages.`
              : `${used} of ${limit} free pages used.`}
          </p>
          <p
            className={`mt-1.5 max-w-lg text-[13px] leading-relaxed ${
              spent ? "text-on-ink/75" : "text-muted"
            }`}
          >
            {spent
              ? "The agent has stopped writing. Everything it already published stays on your site — start a plan and it picks up where it left off."
              : "The agent is researching, writing and publishing to your real site. No card needed until the free pages run out."}
          </p>
        </div>
        <button
          onClick={onUpgrade}
          className={`shrink-0 rounded-full px-5 py-2.5 text-[13.5px] font-medium transition-colors ${
            spent
              ? "bg-paper text-ink hover:bg-accent hover:text-on-ink"
              : "bg-ink text-on-ink hover:bg-accent"
          }`}
        >
          {spent ? `Start a plan — $${PRICE_PER_SITE}/mo` : "See plans"}
        </button>
      </div>
      {/* Progress is shown as well as stated: three segments, one per page,
          so "how much is left" is readable without parsing the sentence. */}
      <div className="mt-4 flex gap-1.5" aria-hidden="true">
        {Array.from({ length: limit }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${
              i < used ? "bg-accent" : spent ? "bg-on-ink/20" : "bg-ink/[0.08]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function Dashboard() {
  const [data, update] = useOnboarding();
  const [tab, setTab] = useState<Tab>("Overview");
  const [intel, setIntel] = useState<Intel>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage, same pattern as useOnboarding
    setIntel(loadIntel());
    // Returning from the Search Console connect flow lands on the tab the
    // user was connecting for, with the callback params tidied away.
    const params = new URLSearchParams(window.location.search);
    if (params.get("gsc")) {
      setTab("Analytics");
      window.history.replaceState({}, "", "/dashboard");
    }
    // Returning from the rebuild's Stripe checkout: land on the panel the
    // purchase belongs to, with the params tidied away.
    if (params.get("rebuild")) {
      setTab("Settings");
      window.history.replaceState({}, "", "/dashboard");
    }
  }, []);

  // Competitors the research cycle discovered feed the plan, so the tab is
  // populated whether or not the owner happened to type any names in.
  const discovered = useMemo(
    () => (intel.research?.competitors ?? []).map((c) => c.domain).filter(Boolean),
    [intel.research]
  );
  // Keyword targets the research cycle discovered, folded into the same
  // scored keyword universe as the service/location and wishlist terms.
  const discoveredKeywords = useMemo(
    () => (intel.research?.keywords ?? []).map((k) => k.keyword).filter(Boolean),
    [intel.research]
  );
  /** What live research said about each competitor, keyed by domain. */
  const researchNotes = useMemo(() => {
    const map: Record<string, { strength: string; weakness: string }> = {};
    for (const c of intel.research?.competitors ?? []) {
      if (c.domain) map[c.domain.toLowerCase()] = { strength: c.strength, weakness: c.weakness };
    }
    return map;
  }, [intel.research]);
  const plan = useMemo(
    () => buildPlan(data, discovered, discoveredKeywords),
    [data, discovered, discoveredKeywords]
  );
  // Both tabs' research buttons write to the intel cache; this pulls the
  // fresh snapshot back so the plan recomputes — the same refresh the
  // Settings "Save changes" flow uses via onApplied.
  const refreshIntel = () => setIntel(loadIntel());

  // The header names whichever site the switcher is pointed at. The local
  // onboarding buffer only ever holds one site, so on a multi-site account
  // it is the wrong answer for every site but the last one set up — the
  // server row is the authority once the engine knows about the site.
  const { allSites, activeSite, selectSite, entitlement } = useAgentPages();
  const siteName = activeSite?.businessName || data.business.name || "Your site";
  const siteUrl =
    (activeSite?.url || data.website.url || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <div className="flex min-h-screen bg-paper-warm">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-paper px-5 py-7 md:flex">
        <div className="px-2">
          <Wordmark href="/" />
        </div>
        <nav aria-label="Dashboard sections" className="mt-10 flex flex-col gap-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={() => setTab(item.label)}
              // Without this the current section is conveyed by background
              // colour alone, which assistive tech cannot perceive.
              aria-current={tab === item.label ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13.5px] transition-colors ${
                tab === item.label
                  ? "bg-paper-warm font-medium text-ink"
                  : "text-muted hover:bg-paper-warm hover:text-ink"
              }`}
            >
              <span aria-hidden="true" className="h-4.5 w-4.5 [&>svg]:h-full [&>svg]:w-full">{item.icon}</span>
              {item.label}
            </button>
          ))}
          {/* No Home entry: the wordmark above is the way back to the
              public site, which is where people already look for it. Two
              controls doing the same job made the nav read as a list of
              sections with one item that wasn't one. */}
          {/* A tab, not a link to /support. Sending a signed-in owner to a
              standalone page stripped every other tab from the screen, and
              the only way back was the public site — which for anyone whose
              session had lapsed meant signing in again just to return to
              their dashboard. The public page still exists for people who
              are not signed in. */}
          <button
            onClick={() => setTab("Support")}
            aria-current={tab === "Support" ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13.5px] transition-colors ${
              tab === "Support"
                ? "bg-paper-warm font-medium text-ink"
                : "text-muted hover:bg-paper-warm hover:text-ink"
            }`}
          >
            <span aria-hidden="true" className="h-4.5 w-4.5 [&>svg]:h-full [&>svg]:w-full">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path
                  d="M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            Support
          </button>
        </nav>
        <button
          type="button"
          onClick={() => setTab("Billing")}
          aria-current={tab === "Billing" ? "page" : undefined}
          className={`mt-auto rounded-xl border p-4 text-left transition-colors ${
            tab === "Billing" ? "border-ink/40 bg-paper-warm" : "border-line hover:border-ink/40 hover:bg-paper-warm"
          }`}
        >
          <p className="label-mono text-muted">Plan</p>
          <p className="mt-1 text-[13.5px] font-medium">Active</p>
          {/* The rate rather than a total: this card sits in the shell and
              does not know how many websites the tenant has, so a total
              stated here would be wrong for anyone running more than one.
              The Billing tab shows the real total. */}
          <p className="mt-0.5 text-[12px] text-muted">${PRICE_PER_SITE} per website, monthly</p>
          <p className="mt-2 text-[12px] font-medium text-accent">Manage billing &rarr;</p>
        </button>
      </aside>

      {/* Main */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[16px] font-medium tracking-tight">{siteName}</h1>
              <SiteSwitcher
                sites={allSites}
                activeSiteId={activeSite?.siteId ?? null}
                onSelect={selectSite}
              />
            </div>
            {siteUrl && <p className="truncate text-[12.5px] text-muted">{siteUrl}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <AgentSwitch onManageBilling={() => setTab("Billing")} />
            {/* Mobile tab switcher */}
            <select
              value={tab}
              aria-label="Dashboard section"
              onChange={(e) => {
                // Support is a page, not a tab, so it navigates rather
                // than switching sections.
                setTab(e.target.value as Tab);
              }}
              className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[13px] md:hidden"
            >
              {navItems.map((item) => (
                <option key={item.label}>{item.label}</option>
              ))}
              <option value="Billing">Billing</option>
              <option value="Support">Support</option>
            </select>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-4 py-10 sm:px-6">
          <FreePreviewBanner entitlement={entitlement} onUpgrade={() => setTab("Billing")} />
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.21, 0.47, 0.32, 0.98] }}
          >
            {tab === "Overview" && <Overview plan={plan} goTo={setTab} />}
            {tab === "Strategy" && <Strategy plan={plan} data={data} goTo={setTab} />}
            {tab === "Content" && <Content plan={plan} />}
            {tab === "Analytics" && <Analytics />}
            {/* The "Live keyword targets" chip panel used to stack above
                this — a second keyword list over the real one, the same
                shape the Competitors tab had before its research panel was
                merged away. The table below is the authoritative view. */}
            {tab === "Keywords" && (
              <Keywords plan={plan} data={data} onResearched={refreshIntel} />
            )}
            {/* The Live-research panel used to sit above these cards
                listing the same competitors a second time — the research
                findings and the analysed cards were two renderings of one
                set of domains, on one screen. The research sentences now
                ride on the card they describe. */}
            {tab === "Competitors" && (
              <Competitors
                plan={plan}
                goTo={setTab}
                notes={researchNotes}
                data={data}
                onResearched={refreshIntel}
              />
            )}
            {tab === "Citations" && <Citations data={data} />}
            {tab === "Billing" && <Billing />}
            {tab === "Support" && <SupportPanel />}
            {tab === "Settings" && (
              <div className="grid gap-5">
                <Settings data={data} update={update} onApplied={() => setIntel(loadIntel())} />
                <SiteRebuild />
                {/* Below the settings form rather than beside it: these are
                    the destructive controls, and they should be somewhere
                    you arrive at deliberately. */}
                <Connections />
              </div>
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------- Overview ------------------------------- */

function Overview({
  plan,
  goTo,
}: {
  plan: ReturnType<typeof buildPlan>;
  goTo: (t: Tab) => void;
}) {
  // With no keywords there is no analysis, no roadmap, and no first page —
  // the banner and checklist must not claim work that never happened.
  const hasPlan = plan.keywords.length > 0;
  const search = useSearchSnapshot();
  // Real published pages, from the engine's rows. Null when no engine is
  // connected, so "no pages yet" and "we cannot tell" stay distinguishable.
  const { engine, sites } = useAgentPages();
  const pagesLive = engine
    ? sites.reduce((n, s) => n + s.pages.filter((p) => p.status === "published").length, 0)
    : null;
  // Same reconciliation the Content tab does: once the engine is
  // connected, a keyword with a real written page must show that page's
  // real status, not the hash-derived preview label ("Drafting",
  // "Rewriting"...) that never changes no matter what actually happened.
  const realByKeyword = useMemo(
    () => new Map(allPages(sites).map((p) => [p.keyword.trim().toLowerCase(), p])),
    [sites]
  );
  const queuePreview = plan.pages.filter(
    (p) => !engine || !realByKeyword.has(p.keyword.trim().toLowerCase())
  );

  const setupTasks = [
    { label: "Workspace created", done: true },
    { label: "Brand and design ingest", done: true },
    { label: "Keyword gap analysis", done: hasPlan },
    { label: "Content queue built", done: hasPlan },
  ];

  // Four cards, one from each of the categories a useful SEO report is
  // built from — outcome, traffic, visibility, and what happens next.
  //
  // Chosen against one test: does the number help the owner answer "is
  // this working, and what is coming?" That rules out what this row used
  // to carry. "Traffic value (est.)" and "Projected monthly revenue" were
  // modelled, not measured — the revenue figure multiplied assumed
  // traffic by an assumed close rate at an assumed sale value — and a
  // number nothing in the product can verify is not a report, it is an
  // argument for buying aimed at somebody who already has.
  //
  // Everything below is measured. Pages live and the queue come from the
  // engine's own rows; clicks and average position come from Search
  // Console. When Search Console is not connected those two say so and
  // link to it, which is a truthful empty state and a useful prompt —
  // better than a plausible estimate standing in for a measurement.
  const kpis = [
    {
      label: "Pages live",
      value: search.loading && pagesLive === null ? "—" : String(pagesLive ?? 0),
      note:
        pagesLive === null
          ? "Connect the engine to publish"
          : pagesLive === 0
            ? "First page within 24 hours"
            : "Published to your site by the agent",
    },
    {
      label: "Clicks, 28 days",
      value: search.connected && search.clicks !== null ? search.clicks.toLocaleString() : "—",
      note: search.connected
        ? search.clicksDelta ?? "From Google Search"
        : "Connect Search Console to measure",
      onClick: search.connected ? undefined : () => goTo("Analytics"),
    },
    {
      label: "Average position",
      value: search.connected && search.position !== null ? search.position.toFixed(1) : "—",
      note: search.connected
        ? search.positionDelta ?? "Closer to 1 is better"
        : "Connect Search Console to measure",
      onClick: search.connected ? undefined : () => goTo("Analytics"),
    },
    {
      label: "In the queue",
      value: String(queuePreview.length),
      note: hasPlan ? "Next pages the agent will write" : "Add services in Settings to start the queue",
    },
  ];

  return (
    <>
      {/* Plan-ready banner */}
      <div className="overflow-hidden rounded-2xl border border-line-dark bg-fill-strong p-7 text-on-ink sm:p-9">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="label-mono text-accent">{hasPlan ? "Setup complete" : "Almost there"}</span>
            <h2 className="font-display mt-3 text-3xl tracking-tight sm:text-4xl">
              {hasPlan ? "Your content plan is ready." : "Tell the agent about your market."}
            </h2>
            <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-on-ink/75">
              {hasPlan ? (
                <>
                  The agent mapped {plan.keywords.length} keywords across your
                  services and locations and queued the first {plan.pages.length}{" "}
                  pages. The plan rebuilds itself from live results every cycle.
                </>
              ) : (
                <>
                  Add your services and locations in Settings and the agent will
                  map your keywords, run the gap analysis, and build your 90 day
                  roadmap.
                </>
              )}
            </p>
          </div>
          <div className="w-full max-w-[240px] shrink-0">
            {setupTasks.map((t) => (
              <div key={t.label} className="flex items-center gap-3 py-1.5 text-[13px]">
                {t.done ? (
                  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m3.5 8.5 3 3L12.5 5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className="h-4 w-4 shrink-0 rounded-full border border-on-ink/25" />
                )}
                <span className={t.done ? "text-on-ink" : "text-on-ink/75"}>{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const body = (
            <>
              <p className="label-mono text-muted">{kpi.label}</p>
              <p className="font-display mt-2 text-[27px] leading-tight tracking-tight sm:text-3xl">{kpi.value}</p>
              <p className="mt-1.5 text-[12.5px] text-muted">
                {kpi.note}
                {/* A card that says "connect Search Console" and cannot be
                    clicked is a dead end. Where there is an action, the
                    whole card is the button. */}
                {kpi.onClick && <span className="ml-1 text-accent">&rarr;</span>}
              </p>
            </>
          );
          return kpi.onClick ? (
            <button
              key={kpi.label}
              onClick={kpi.onClick}
              className="rounded-2xl border border-line bg-paper p-6 text-left transition-colors hover:border-ink/40"
            >
              {body}
            </button>
          ) : (
            <Card key={kpi.label} className="p-6">
              {body}
            </Card>
          );
        })}
      </div>

      {/* Queue preview */}
      <Card className="mt-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[14.5px] font-medium">Content queue</h2>
          <button onClick={() => goTo("Content")} className="label-mono text-muted transition-colors hover:text-ink">
            View all &rarr;
          </button>
        </div>
        <div className="mt-5 grid gap-3">
          {queuePreview.slice(0, 3).map((page) => (
            <QueueRow
              key={page.keyword}
              page={page}
              override={
                engine
                  ? { status: "Planned", note: "Queued for a future cycle.", suppressVeto: true }
                  : undefined
              }
            />
          ))}
        </div>
        {plan.pages.length === 0 && (
          <p className="mt-2 text-center text-[12.5px] text-muted">
            Add services and locations in Settings to build your queue.
          </p>
        )}
        {plan.pages.length > 0 && queuePreview.length === 0 && (
          <p className="mt-2 text-center text-[12.5px] text-muted">
            The agent has written every keyword currently mapped — see Content for what&apos;s live.
          </p>
        )}
      </Card>
    </>
  );
}

function QueueRow({
  page,
  detailed = false,
  override,
  actions,
}: {
  page: PageDraft;
  detailed?: boolean;
  /** Real engine state for this keyword, replacing the simulated status. */
  override?: { status: string; note: string; suppressVeto?: boolean };
  /** Owner controls (publish now / remove), rendered at the card's foot. */
  actions?: React.ReactNode;
}) {
  const [openSchema, setOpenSchema] = useState<string | null>(null);
  const status = override?.status ?? page.status;
  const note = override?.note ?? page.note;
  return (
    <div className="min-w-0 rounded-xl border border-line p-4">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-paper-warm">
          <span className="sr-only">Grade {page.grade}, audit score {page.audit} of 100.</span>
          <span aria-hidden="true" className="text-[13px] font-medium leading-none">{page.grade}</span>
          <span aria-hidden="true" className="mt-0.5 font-mono text-[9.5px] leading-none text-muted">{page.audit}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-[13.5px] font-medium">
            {page.title}
            <span className="shrink-0 rounded-full bg-ink/[0.04] px-2 py-0.5 text-[10px] font-normal uppercase tracking-wide text-muted">
              {page.role}
            </span>
            {page.veto.triggered && !override?.suppressVeto && (
              <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 text-[10px] font-normal text-on-ink">
                Held: critical check
                {/* The reason was previously title-only, unreachable by keyboard. */}
                {page.veto.reason && <span className="sr-only">. {page.veto.reason}</span>}
              </span>
            )}
          </p>
          <p className="truncate text-[12px] text-muted">
            {page.keyword} &middot; {note}
          </p>
        </div>
        {/* Only the score that changes what happens next stays on the
            closed card: information gain below 0.50 is why a page does not
            publish. Everything else moved into Details — a card carrying
            four bars, ten chips and three schema toggles at rest is not
            more informative, it is just harder to read. */}
        {page.infoGain < 0.5 && (
          <span
            className="hidden shrink-0 rounded-full bg-ink px-2.5 py-1 font-mono text-[11px] text-on-ink sm:inline-flex"
            title="Information gain vs. the pages currently ranking. Must clear 0.50 to publish."
          >
            <span className="sr-only">Information gain </span>
            <span aria-hidden="true">IG </span>
            {page.infoGain.toFixed(2)}
            <span className="sr-only"> of a required 0.50 minimum — below the publish gate</span>
          </span>
        )}
        <StatusPill status={status} />
      </div>
      {detailed && (
        <details className="group">
          <summary className="mt-3 cursor-pointer list-none border-t border-line pt-3 text-[12px] text-muted transition-colors hover:text-ink">
            <span className="label-mono">
              Details
              <span className="ml-1.5 inline-block transition-transform group-open:rotate-90">&rsaquo;</span>
            </span>
            <span className="ml-2.5 font-normal normal-case tracking-normal">
              Scores, AI tactics, schema
            </span>
          </summary>
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-3.5">
            <span
              className="rounded-full bg-ink/[0.04] px-2.5 py-1 font-mono text-[11px] text-muted"
              title="Information gain vs. the pages currently ranking. Must clear 0.50 to publish."
            >
              IG {page.infoGain.toFixed(2)}
            </span>
            <span
              className="rounded-full bg-ink/[0.04] px-2.5 py-1 font-mono text-[11px] text-muted"
              title="Weighted GEO score: tactics weighted by measured impact on AI-answer visibility, minus penalties."
            >
              GEO {page.geo.score}/100
            </span>
          </div>
          <div className="mt-3.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["Substance", page.pillars.substance],
                ["Signal", page.pillars.signal],
                ["Structure", page.pillars.structure],
                ["AI retrieval", page.retrievability],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex items-center gap-2.5">
                <span className="w-[74px] shrink-0 text-[11.5px] text-muted">{label}</span>
                <div className="h-[4px] flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${value}%` }} />
                </div>
                <span className="w-6 shrink-0 text-right font-mono text-[10.5px] text-muted">{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-3.5">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                page.freshness.status === "Fresh" || page.freshness.status === "New"
                  ? "bg-accent/10 text-accent"
                  : page.freshness.status === "Aging"
                    ? "bg-ink/[0.06] text-ink/70"
                    : "bg-ink/[0.06] text-muted"
              }`}
              title={
                page.freshness.ageDays === null
                  ? "Not published yet, so it has no age. Once live, the agent refreshes it at 90 days — content under 90 days is roughly 3x more likely to be cited by AI answer engines."
                  : `${page.freshness.ageDays} days since last write. Content under 90 days is roughly 3x more likely to be cited by AI answer engines.`
              }
            >
              {page.freshness.ageDays === null
                ? "New · refresh at 90d"
                : `${page.freshness.status} · ${page.freshness.ageDays}d`}
            </span>
            {GEO_TACTICS.map((t) => (
              <span
                key={t.key}
                title={`${t.description} ${page.geo.tactics[t.key] ? "(satisfied)" : "(not satisfied)"}`}
                className={`rounded-full px-2.5 py-1 text-[11px] ${
                  page.geo.tactics[t.key] ? "bg-ink/[0.06] text-ink/70" : "bg-ink/[0.03] text-muted line-through"
                }`}
              >
                <span className="sr-only">{page.geo.tactics[t.key] ? "Satisfied: " : "Not satisfied: "}</span>
                {t.label}
              </span>
            ))}
            {page.geo.negativeSignals
              .filter((n) => n.triggered)
              .map((n) => (
                <span key={n.key} className="rounded-full bg-ink px-2.5 py-1 text-[11px] text-on-ink">
                  &minus; {n.label}
                </span>
              ))}
          </div>
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3.5">
            <span className="text-[12px] text-muted">
              <span className="label-mono mr-1.5 text-accent">Next fix (Group {page.priorityFix.group})</span>
              {page.priorityFix.label}
            </span>
            <span className="flex flex-wrap gap-1.5">
              {page.schemaTypes.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setOpenSchema(openSchema === s ? null : s)}
                  aria-expanded={openSchema === s}
                  className={`rounded-full px-2.5 py-1 font-mono text-[10.5px] transition-colors ${
                    openSchema === s ? "bg-ink text-on-ink" : "bg-ink/[0.04] text-muted hover:bg-ink/[0.08]"
                  }`}
                >
                  {s}
                  <span className="sr-only"> schema, show generated JSON-LD</span>
                </button>
              ))}
            </span>
          </div>
          {openSchema && page.schemaJsonLd[openSchema] && (
            <div className="mt-3 overflow-x-auto rounded-lg bg-fill-strong p-4">
              <pre className="font-mono text-[11px] leading-relaxed text-on-ink/80">
                {JSON.stringify(page.schemaJsonLd[openSchema], null, 2)}
              </pre>
            </div>
          )}
        </details>
      )}
      {actions}
    </div>
  );
}

/* -------------------------------- Content ------------------------------- */

/** Real pages the engine wrote, with a link to each published one. */
function AgentPages() {
  const { loading, refreshing, engine, sites, error, refresh } = useAgentPages();
  const [generating, setGenerating] = useState(false);
  const [genNote, setGenNote] = useState<string | null>(null);

  // Generate-on-demand: one full cycle (research → write → audit →
  // publish), started by the owner instead of the schedule. Can take up
  // to five minutes — quality over speed, and the route budgets 300s —
  // so the button holds its busy state the whole time; a silent long
  // request reads as a dead button.
  const generateNow = async () => {
    if (generating) return;
    setGenerating(true);
    setGenNote(null);
    try {
      const res = await fetch("/api/agent/run", { method: "POST" });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        result?: { keyword?: string; auditScore?: number; status?: string; skipped?: string; error?: string };
      };
      if (!res.ok || !json.ok) {
        setGenNote(json.error || "The cycle could not start. Try again in a moment.");
      } else if (json.result?.skipped) {
        setGenNote(`Nothing to do: ${json.result.skipped}.`);
      } else if (json.result?.keyword) {
        setGenNote(
          `Wrote "${json.result.keyword}" — scored ${json.result.auditScore}, ${json.result.status}.`
        );
      } else {
        setGenNote(json.result?.error || "The cycle finished without producing a page.");
      }
    } catch {
      setGenNote("Lost the connection while the agent was working — hit Refresh in a minute to see the result.");
    }
    setGenerating(false);
    refresh();
  };
  if (loading) {
    return (
      <Card className="p-6">
        <p className="text-[13px] text-muted">Checking what the agent has written…</p>
      </Card>
    );
  }
  if (error) {
    return (
      <Card className="p-6">
        <h2 className="text-[14.5px] font-medium">Published pages</h2>
        <p className="mt-2 text-[13px] text-muted">Could not read the agent&apos;s pages: {error}</p>
      </Card>
    );
  }
  if (!engine) {
    // Being explicit beats a queue that looks live but is a simulation.
    return (
      <Card className="p-6">
        <h2 className="text-[14.5px] font-medium">Agent not connected</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          The autonomous engine needs a database. Until{" "}
          <code className="rounded bg-paper-warm px-1 py-0.5 text-[12px]">DATABASE_URL</code> is set,
          nothing below is being written to your site — the queue underneath is a preview of the plan
          the agent would work through, not work in progress.
        </p>
      </Card>
    );
  }

  const pages = allPages(sites);
  const published = pages.filter((p) => p.status === "published");
  const lastRun = sites.flatMap((s) => s.runs)[0];

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[14.5px] font-medium">Pages the agent has written</h2>
        <div className="flex items-center gap-2">
          {/* Reloads the list. Deliberately not called "Refresh": that word
              now names the agent action that rewrites a live page, and two
              buttons reading "Refresh" on one screen with entirely
              different consequences is a trap. */}
          <button
            onClick={refresh}
            disabled={refreshing}
            className="rounded-full border border-line px-3 py-1 text-[12px] text-muted transition-colors hover:border-ink/40 hover:text-ink disabled:opacity-60"
          >
            {refreshing ? "Reloading…" : "Reload"}
          </button>
          <button
            onClick={generateNow}
            disabled={generating}
            className="rounded-full bg-ink px-3.5 py-1 text-[12px] font-medium text-on-ink transition-colors hover:bg-accent disabled:opacity-60"
          >
            {generating ? "Writing… (up to 5 min)" : "Generate a page now"}
          </button>
        </div>
      </div>
      {genNote && (
        <p role="status" className="mt-2 rounded-lg bg-paper-warm px-3 py-2 text-[12.5px] text-ink">
          {genNote}
        </p>
      )}
      {pages.length === 0 ? (
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          The agent hasn&apos;t written a page yet.{" "}
          {lastRun
            ? `Last cycle: ${lastRun.status}${lastRun.summary ? ` — ${lastRun.summary}` : ""}.`
            : "No cycle has run yet — it runs on your cadence, or you can trigger one manually."}
        </p>
      ) : (
        <>
          <p className="mt-1 text-[12.5px] text-muted">
            {published.length} published, {pages.length - published.length} held or in progress.
            Published pages link straight to where they went live.
          </p>
          <div className="mt-5 grid gap-2.5">
            {pages.map((page) => (
              <AgentPageRow key={page.id} page={page} onDeleted={refresh} />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function AgentPageRow({
  page,
  onDeleted,
}: {
  page: AgentPage & { siteUrl: string };
  onDeleted: () => void;
}) {
  const isLive = page.status === "published" && Boolean(page.live_url);
  const reachable = page.live_status?.startsWith("live:");
  // Approved (or awaiting review) but not live: the work is done and paid
  // for, one step from shipping. The button runs the same engine function
  // the cycle runs, so it cannot behave differently from autopilot.
  const canPublish = (page.status === "approved" || page.status === "pending") && !page.live_url;
  const now = useNow();

  // Freshness, from the last time the page actually changed. The same
  // 150-day threshold the agent schedules refreshes on, so the badge and
  // the agent's behaviour cannot tell different stories.
  const changedAt = page.refreshed_at || page.published_at;
  const staleDays = changedAt
    ? Math.floor((now - new Date(changedAt).getTime()) / 86_400_000)
    : null;
  const freshness =
    staleDays === null
      ? null
      : staleDays <= 90
        ? { label: "Fresh", due: false }
        : staleDays <= 150
          ? { label: "Aging", due: false }
          : { label: "Refresh due", due: true };
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const doRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshNote(null);
    try {
      const res = await fetch(`/api/pages/refresh?id=${encodeURIComponent(page.id)}`, { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string; result?: { skipped?: string } };
      if (json.result?.skipped) {
        // A declined refresh is a real outcome, not a failure: the live
        // page was kept because the rewrite was not better.
        setRefreshNote(json.result.skipped);
      } else if (!res.ok || !json.ok) {
        setRefreshNote(json.error || "The refresh did not go through.");
      } else {
        onDeleted();
        return;
      }
    } catch {
      setRefreshNote("Could not reach the server.");
    }
    setRefreshing(false);
  };
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const doPublish = async () => {
    if (publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/pages/publish?id=${encodeURIComponent(page.id)}`, { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setPublishError(json.error || "Publish failed.");
        setPublishing(false);
        return;
      }
    } catch {
      setPublishError("Could not reach the server.");
      setPublishing(false);
      return;
    }
    onDeleted(); // shared refresh: pulls the new published state
  };
  // Two-step delete: the first click arms, the second commits. A single
  // click that removes a live page from the customer's site is too easy
  // to hit by accident.
  const [armed, setArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [liveWarning, setLiveWarning] = useState<string | null>(null);
  const doDelete = async () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/pages?id=${encodeURIComponent(page.id)}`, { method: "DELETE" });
      const json = (await res.json()) as { liveRemoved?: boolean | null; liveRemovalError?: string | null };
      // Removed from the product but still serving to visitors is the one
      // outcome the owner must never be left unaware of, so it is reported
      // rather than folded into a silent refresh.
      if (json.liveRemoved === false) {
        setLiveWarning(
          json.liveRemovalError ||
            "The page was removed here, but could not be removed from your live site."
        );
        setDeleting(false);
        return;
      }
    } catch {
      // refresh shows the truth either way
    }
    onDeleted();
  };
  return (
    <div className="relative min-w-0 rounded-xl border border-line p-4">
      <button
        onClick={doDelete}
        disabled={deleting}
        aria-label={armed ? `Confirm deleting ${page.title}` : `Delete ${page.title}`}
        title={armed ? "Click again to permanently delete this page" : "Delete this page"}
        className={`absolute right-2.5 top-2.5 z-10 inline-flex h-6 items-center justify-center rounded-full text-[11px] transition-colors ${
          armed
            ? "bg-ink px-2.5 font-medium text-on-ink"
            : "w-6 text-muted hover:bg-ink/[0.06] hover:text-ink"
        } disabled:opacity-50`}
      >
        {deleting ? "…" : armed ? "Delete?" : "✕"}
      </button>
      <div className="flex flex-wrap items-center gap-3 pr-8">
        <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-paper-warm">
          <span className="sr-only">Audit score {page.audit_score} of 100.</span>
          <span aria-hidden="true" className="text-[12px] font-medium leading-none">{page.audit_grade || "—"}</span>
          <span aria-hidden="true" className="mt-0.5 font-mono text-[9px] leading-none text-muted">{page.audit_score}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium">{page.title}</span>
          <span className="block truncate text-[12px] text-muted">
            {page.keyword}
            {page.word_count > 0 ? ` · ${page.word_count} words` : ""}
            {page.held_reason ? ` · ${page.held_reason}` : ""}
          </span>
        </span>
        <StatusPill status={page.status} />
      </div>
      {isLive && freshness && (
        <p className="mt-2 text-[11.5px] text-muted">
          <span className={freshness.due ? "text-ink" : ""}>{freshness.label}</span>
          {" \u00b7 "}
          {page.refresh_count > 0
            ? `refreshed ${staleDays}d ago (${page.refresh_count}\u00d7)`
            : `published ${staleDays}d ago`}
        </p>
      )}
      {liveWarning && (
        <p className="mt-3 rounded-lg border border-line bg-paper-warm p-3 text-[12px] leading-relaxed text-ink/80">
          <span className="font-medium">Removed here, still live.</span> {liveWarning}{" "}
          Ascent is no longer tracking this page, so it will not be cleaned up later —
          delete it on your site directly, or it keeps serving to visitors and search
          engines.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <a
          href={`/api/pages/preview?id=${page.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12.5px] font-medium text-ink transition-colors hover:border-ink/40 hover:bg-paper-warm"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
            <circle cx="12" cy="12" r="2.8" />
          </svg>
          Preview page
        </a>
        {canPublish && (
          <button
            onClick={doPublish}
            disabled={publishing}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-[12.5px] font-medium text-on-ink transition-colors hover:bg-accent disabled:opacity-60"
          >
            {publishing ? "Publishing…" : page.status === "pending" ? "Approve & publish" : "Publish now"}
          </button>
        )}
        {isLive && (
          <button
            onClick={doRefresh}
            disabled={refreshing}
            title="Rewrite this page with current research and republish it to the same URL"
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12.5px] font-medium text-ink transition-colors hover:border-ink/40 hover:bg-paper-warm disabled:opacity-60"
          >
            {refreshing ? "Refreshing\u2026" : "Refresh"}
          </button>
        )}
        {isLive && (
          <a
            href={page.live_url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink underline decoration-line underline-offset-2 hover:text-accent"
          >
            View the live page
            <span aria-hidden="true">&rarr;</span>
          </a>
        )}
      </div>
      {refreshNote && (
        <p className="mt-2 text-[12px] leading-relaxed text-muted">{refreshNote}</p>
      )}
      {publishError && (
        <p className="mt-2 text-[12px] leading-relaxed text-muted">{publishError}</p>
      )}
      {isLive && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="sr-only">Live page details.</span>
          <span className="truncate font-mono text-[11.5px] text-muted">{page.live_url}</span>
          {page.live_status && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                reachable ? "bg-accent/10 text-accent" : "bg-ink text-on-ink"
              }`}
              title="Result of fetching the published URL to confirm it is really there."
            >
              {reachable ? "verified live" : page.live_status}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Content({ plan }: { plan: ReturnType<typeof buildPlan> }) {
  return (
    <div className="grid gap-4">
      <AgentPages />
      {plan.pages.length > 0 && <PlannedQueue plan={plan} />}
    </div>
  );
}

/**
 * The simulated preview statuses ("Drafting", "Rewriting", "Writing now")
 * are computed from a hash and never change — beside real engine output
 * they read as work that is stuck. When the engine is connected, each
 * planned row is reconciled against what the agent actually wrote: a
 * keyword with a real page shows that page's real status, everything else
 * says "Planned", which is the truth.
 */
const DISMISSED_KEY = "queue.dismissed.v1";

function loadDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function PlannedQueue({ plan }: { plan: ReturnType<typeof buildPlan> }) {
  const { engine, sites, refresh } = useAgentPages();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [writingTerm, setWritingTerm] = useState<string | null>(null);
  const [queueNote, setQueueNote] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage
    setDismissed(loadDismissed());
  }, []);

  const real = new Map(
    allPages(sites).map((p) => [p.keyword.trim().toLowerCase(), p])
  );

  // Write this exact card's page now, jumping the queue order.
  const generateKeyword = async (keyword: string) => {
    if (writingTerm) return;
    setWritingTerm(keyword);
    setQueueNote(null);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        result?: { auditScore?: number; status?: string; skipped?: string };
      };
      if (!res.ok || !json.ok) setQueueNote(json.error || "Could not start the cycle.");
      else if (json.result?.skipped) setQueueNote(`Nothing written: ${json.result.skipped}.`);
      else setQueueNote(`"${keyword}" — scored ${json.result?.auditScore}, ${json.result?.status}.`);
    } catch {
      setQueueNote("Lost the connection while writing — Refresh above in a minute to see the result.");
    }
    setWritingTerm(null);
    refresh();
  };

  // Remove a planned card: locally always (plan-preview terms only exist
  // client-side), and server-side too when the engine tracks the keyword.
  const removeKeyword = async (keyword: string) => {
    const next = new Set(dismissed);
    next.add(keyword.trim().toLowerCase());
    setDismissed(next);
    try {
      window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
    } catch {
      // storage unavailable; the server delete below still applies
    }
    void fetch(`/api/agent/keyword?term=${encodeURIComponent(keyword)}`, { method: "DELETE" }).catch(
      () => {}
    );
  };

  // When the engine is connected, a keyword with a real page is already
  // shown in "Pages the agent has written" above — listing it here again,
  // with a note pointing back up to that card, was the same duplication
  // the Competitors tab had. So the planned queue drops to what it is for:
  // the work still ahead. In preview mode (no engine) nothing has been
  // written, so the whole plan is legitimately upcoming.
  const visiblePages = plan.pages.filter((p) => {
    const key = p.keyword.trim().toLowerCase();
    if (dismissed.has(key)) return false;
    if (engine && real.has(key)) return false;
    return true;
  });

  const overrideFor = (): { status: string; note: string; suppressVeto?: boolean } | undefined => {
    if (!engine) return undefined;
    // Only planned keywords reach here now — written ones are filtered out
    // above and shown in the card of real pages.
    return {
      status: "Planned",
      note: "Queued for a future cycle — press Generate a page now above, or let the schedule pick it up.",
      suppressVeto: true,
    };
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[14.5px] font-medium">{engine ? "Up next" : "Planned queue"}</h2>
        <span className="label-mono text-muted">
          {visiblePages.length} {visiblePages.length === 1 ? "page" : "pages"}
          {engine ? " ahead" : " this cycle"}
        </span>
      </div>
      {/* One line. The paragraph this replaced explained the pillar
          scores, the information-gain gate, the GEO score, schema and the
          freshness clock before the reader had seen a single card — an
          explanation of machinery nobody had asked about yet. What they
          need here is what the list is; the scoring explains itself inside
          Details, next to the numbers it describes. */}
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
        {engine ? (
          <>
            What the agent writes next, in order. Anything below the quality
            gate is rewritten rather than published.
          </>
        ) : (
          <>
            The plan, not live progress — the order the agent intends to work
            in.
          </>
        )}
      </p>
      {queueNote && (
        <p role="status" className="mt-3 rounded-lg bg-paper-warm px-3 py-2 text-[12.5px] text-ink">
          {queueNote}
        </p>
      )}
      <div className="mt-5 grid gap-3">
        {visiblePages.map((page) => {
          const hasRealPage = engine && real.has(page.keyword.trim().toLowerCase());
          return (
            <QueueRow
              key={page.keyword}
              page={page}
              detailed
              override={overrideFor()}
              actions={
                engine && !hasRealPage ? (
                  <span className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <button
                      onClick={() => generateKeyword(page.keyword)}
                      disabled={writingTerm !== null}
                      className="rounded-full bg-ink px-3.5 py-1 text-[12px] font-medium text-on-ink transition-colors hover:bg-accent disabled:opacity-60"
                    >
                      {writingTerm === page.keyword ? "Writing… (up to 5 min)" : "Publish now"}
                    </button>
                    <button
                      onClick={() => removeKeyword(page.keyword)}
                      disabled={writingTerm === page.keyword}
                      className="rounded-full border border-line px-3 py-1 text-[12px] text-muted transition-colors hover:border-ink/40 hover:text-ink disabled:opacity-50"
                    >
                      Remove from plan
                    </button>
                  </span>
                ) : undefined
              }
            />
          );
        })}
        {visiblePages.length === 0 && (
          <p className="text-center text-[12.5px] text-muted">
            {engine
              ? "The agent has worked through every planned page. It will plan more from live results next cycle."
              : "Every planned page has been removed. Add services or locations in Settings to plan more."}
          </p>
        )}
      </div>
    </Card>
  );
}

/* --------------------------- Research actions --------------------------- */

/**
 * The on-demand live-research action shared by the Competitors ("find
 * competitors") and Keywords ("generate keywords") buttons.
 *
 * One Google-grounded research call returns competitors AND keyword targets
 * together, so both buttons run the same operation and differ only in which
 * half of the result their tab is built to show. Keeping the trigger in one
 * hook means the two entry points cannot drift in how they fetch, cache, or
 * report — the same reason the fetch itself lives in research-client.ts.
 */
function useResearchAction(data: OnboardingData, onResearched: () => void) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // The search needs something to look for. Industry or services is enough;
  // with neither there is nothing to ground the query on.
  const canResearch =
    data.market.industry.trim() !== "" || data.market.services.trim() !== "";

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const research = await refreshAndSaveResearch(data);
    setBusy(false);
    if (!research) {
      setMessage("Couldn't reach the research engine. Try again in a moment.");
      return;
    }
    onResearched();
    // On a live pass the refreshed table is the feedback, so stay quiet.
    // When the deployment has no Google-grounded engine the call still
    // returns useful targets expanded from the owner's own answers — say
    // so rather than letting it read as a live market search that wasn't.
    setMessage(
      research.source === "live"
        ? null
        : "Live Google search isn't configured here — expanded from your own answers instead."
    );
  };

  return { run, busy, message, canResearch };
}

function ResearchButton({
  label,
  busyLabel,
  action,
}: {
  label: string;
  busyLabel: string;
  action: ReturnType<typeof useResearchAction>;
}) {
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        onClick={action.run}
        disabled={action.busy || !action.canResearch}
        title={
          action.canResearch
            ? "Searches Google for your market and folds the findings into the plan"
            : "Add your industry or services in Settings first — the search needs something to look for."
        }
        className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-on-ink transition-colors hover:bg-accent disabled:opacity-60"
      >
        {action.busy && (
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-on-ink/30 border-t-white"
          />
        )}
        {action.busy ? busyLabel : label}
      </button>
      {/* role=status so the outcome is announced, not conveyed by a
          transient colour change alone. */}
      <span role="status" aria-live="polite" className="max-w-xs text-[11.5px] leading-snug text-muted">
        {action.busy ? "Searching Google…" : action.message ?? ""}
      </span>
    </div>
  );
}

/* ------------------------------- Keywords ------------------------------- */

function Keywords({
  plan,
  data,
  onResearched,
}: {
  plan: ReturnType<typeof buildPlan>;
  data: OnboardingData;
  onResearched: () => void;
}) {
  const research = useResearchAction(data, onResearched);

  if (plan.keywords.length === 0)
    return (
      <EmptyState
        title="No keywords tracked yet"
        sub="Add your services and locations in Settings and the agent maps the keywords worth ranking for — or search Google for them now."
        action={<ResearchButton label="Generate keywords" busyLabel="Generating…" action={research} />}
      />
    );

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-6">
        <div>
          <h2 className="text-[14.5px] font-medium">Tracked keywords</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            Ordered by business potential — how likely a searcher is to become a
            customer, not how many people search.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <span className="label-mono text-muted">{plan.keywords.length} keywords</span>
          {/* Generate keywords: a live Google-grounded pass whose targets
              fold into the table below on the same scored footing. */}
          <ResearchButton label="Generate keywords" busyLabel="Generating…" action={research} />
        </div>
      </div>
      {/* The off-site guidance is real and worth having, but it was two
          dense paragraphs above a table nobody had read yet. It sits behind
          a disclosure now: available when the column raises the question,
          absent when it does not. */}
      <details className="group px-6">
        <summary className="mt-2 cursor-pointer list-none text-[12px] text-muted transition-colors hover:text-ink">
          <span className="label-mono">
            About the off-site column
            <span className="ml-1.5 inline-block transition-transform group-open:rotate-90">&rsaquo;</span>
          </span>
        </summary>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          It flags which off-site surface would most help this keyword get
          cited by AI answer engines. For local intent that is the curated
          &quot;best of&quot; roundups already ranking for the phrase, since
          those are what engines quote when recommending a local business;
          elsewhere it follows where each engine actually draws citations
          from.
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Independent of any keyword, being complete and accurate on{" "}
          <span className="text-ink/80">{CORE_LOCAL_CITATIONS.join(", ")}</span>{" "}
          feeds local AI recommendations more than presence on many small
          directories. That is a one-time setup task on your own profiles,
          not something the agent publishes.
        </p>
      </details>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-y border-line text-muted">
              <th className="px-6 py-3 font-medium">Keyword</th>
              <th className="px-4 py-3 font-medium">Potential</th>
              <th className="px-4 py-3 font-medium">Intent</th>
              <th className="px-4 py-3 font-medium">Difficulty</th>
              <th className="px-4 py-3 font-medium">Off site opportunity</th>
              <th className="px-6 py-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {plan.keywords.map((k) => (
              <tr key={k.term} className="border-b border-line last:border-0">
                <td className="px-6 py-3.5 font-medium">
                  <span className="inline-flex items-center gap-2">
                    {k.term}
                    {k.wishlisted && (
                      <span
                        className="rounded-full bg-accent/10 px-2 py-0.5 text-[10.5px] font-medium text-accent"
                        title="You asked for this keyword. The agent prioritizes it."
                      >
                        Wishlist
                      </span>
                    )}
                    {k.gapType && k.gapType !== "Commodity" && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${gapTypeStyles[k.gapType]}`}
                        title="Flagged by competitor gap analysis — the gap finding raised this keyword's queue priority."
                      >
                        {k.gapType} gap
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="h-[4px] w-14 overflow-hidden rounded-full bg-ink/[0.06]">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${k.potential}%` }} />
                    </div>
                    <span className="font-mono text-[11.5px] text-muted">{k.potential}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-muted">{k.intent}</td>
                <td className="px-4 py-3.5 text-muted">{k.difficulty}</td>
                <td className="px-4 py-3.5">
                  <span
                    className="inline-flex items-center gap-1.5 text-muted"
                    title={k.citationPlatform.reason}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink/20" />
                    {k.citationPlatform.platform}
                  </span>
                </td>
                <td className="px-6 py-3.5 text-right">
                  <StatusPill status={k.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------ Competitors ----------------------------- */

function Competitors({
  plan,
  goTo,
  notes = {},
  data,
  onResearched,
}: {
  plan: ReturnType<typeof buildPlan>;
  goTo: (t: Tab) => void;
  /** Live-research strength/weakness per domain, when research has run. */
  notes?: Record<string, { strength: string; weakness: string }>;
  data: OnboardingData;
  onResearched: () => void;
}) {
  const research = useResearchAction(data, onResearched);

  if (plan.competitors.length === 0)
    return (
      <Card className="p-10 text-center">
        <p className="text-[14.5px] font-medium">No competitors mapped yet</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">
          Search Google for the sites ranking in your market now, or let the
          agent find them on its first research cycle. Either way it needs
          your services and locations set in Settings first.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <ResearchButton label="Find competitors" busyLabel="Searching…" action={research} />
          <button
            onClick={() => goTo("Settings")}
            className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-[13px] font-medium text-ink transition-colors hover:border-ink/40 hover:bg-paper-warm"
          >
            Open Settings &rarr;
          </button>
        </div>
      </Card>
    );

  const totalGaps = plan.competitors.reduce((s, c) => s + c.gapCount, 0);

  return (
    <>
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[14.5px] font-medium">Keyword gap analysis</h2>
              {/* Find competitors: re-runs the same Google-grounded search
                  the agent uses, so the owner can refresh the set on demand
                  rather than wait for the next cycle. */}
              <ResearchButton label="Find competitors" busyLabel="Searching…" action={research} />
            </div>
            {/* Was a ten-line paragraph defining four gap types, explaining
                how findings feed the queue and caveating the estimates —
                all before the reader had seen a single competitor. The
                badges carry their own definitions on hover; the rest is
                here for whoever wants it. */}
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              Keywords your competitors cover and you do not. The agent
              queues these itself — nothing here needs acting on.
            </p>
            <details className="group">
              <summary className="mt-2 cursor-pointer list-none text-[12px] text-muted transition-colors hover:text-ink">
                <span className="label-mono">
                  How gaps are classified
                  <span className="ml-1.5 inline-block transition-transform group-open:rotate-90">&rsaquo;</span>
                </span>
              </summary>
              <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted">
                <span className="font-medium text-ink/80">Core</span> — all top
                competitors cover it, add now.{" "}
                <span className="font-medium text-ink/80">Differentiator</span> —
                some do, and outrank you.{" "}
                <span className="font-medium text-ink/80">Commodity</span> —
                everyone covers it shallowly, a sentence is enough.{" "}
                <span className="font-medium text-ink/80">Opportunity</span> —
                nobody owns this angle yet.
              </p>
              <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted">
                Core and Opportunity keywords get a priority boost in the
                queue, and Core gaps jump straight into it. Overlap is
                estimated from your keyword set until Search Console data is
                connected.
              </p>
            </details>
          </div>
          <div className="text-right">
            <p className="font-display text-4xl leading-none tracking-tight">{totalGaps}</p>
            <p className="label-mono mt-1 text-accent">Open gaps</p>
          </div>
        </div>
      </Card>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {plan.competitors.map((c) => (
          <Card key={c.name} className="p-6">
            <div className="flex items-start justify-between gap-4">
              <p className="min-w-0 truncate text-[14.5px] font-medium">{c.name}</p>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${threatStyles[c.threat.level]}`}
                title={c.threat.reason}
              >
                {c.threat.level} threat
              </span>
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{c.threat.reason}</p>
            {/* From live search rather than derived from the keyword set —
                the genuinely researched things on the card, not estimates. */}
            {notes[c.name.toLowerCase()]?.strength && (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                <span className="font-medium text-ink/80">Why they rank </span>
                {notes[c.name.toLowerCase()].strength}
              </p>
            )}
            {notes[c.name.toLowerCase()]?.weakness && (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                <span className="font-medium text-accent">Your opening </span>
                {notes[c.name.toLowerCase()].weakness}
              </p>
            )}
            <div className="mt-5">
              {c.overlap !== null && (
                <>
                  <div className="flex items-center justify-between text-[12px] text-muted">
                    <span title="Estimated from your keyword set until Search Console data is connected.">
                      Keyword overlap <span className="text-muted">(est.)</span>
                    </span>
                    <span className="font-medium text-ink">{c.overlap}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${c.overlap}%` }} />
                  </div>
                </>
              )}

            </div>
            <div className="mt-5 border-t border-line pt-4">
              {c.gapItems.length > 0 ? (
                <p className="text-[12px] text-muted">
                  <span className="font-medium text-ink">{c.gapCount} gap{c.gapCount > 1 ? "s" : ""}</span>{" "}
                  found &middot;{" "}
                  {c.gapCount > c.gapItems.length
                    ? `top ${c.gapItems.length} classified below`
                    : "classified below"}
                </p>
              ) : (
                <p className="text-[12px] text-muted">
                  {plan.keywords.length === 0
                    ? "No gaps mapped yet — add services and locations in Settings so the agent has keywords to compare coverage against."
                    : "No coverage gaps found against your keyword set — monitor only."}
                </p>
              )}
              {c.gapItems.length > 0 && (
                <div className="mt-2.5 grid gap-2">
                  {c.gapItems.map((g) => (
                    <div key={g.keyword} className="flex items-start gap-2.5">
                      <span
                        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${gapTypeStyles[g.type]}`}
                        title={g.action}
                      >
                        {g.type}
                      </span>
                      <span className="text-[12px] text-ink/70">{g.keyword}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Reassuring, not actionable — the gaps above are the work.
                  Kept, because a card that only lists deficits misreads a
                  competitive position, but folded away. */}
              {c.leadCount > 0 && (
                <details className="group mt-4 border-t border-line pt-3.5">
                  <summary className="cursor-pointer list-none text-[12px] text-muted transition-colors hover:text-ink">
                    <span className="font-medium text-ink">{c.leadCount} keyword{c.leadCount > 1 ? "s" : ""}</span>{" "}
                    where you lead
                    <span className="ml-1.5 inline-block transition-transform group-open:rotate-90">&rsaquo;</span>
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.leadItems.map((term) => (
                      <span
                        key={term}
                        className="rounded-full bg-ink/[0.04] px-2 py-0.5 text-[11px] text-muted"
                      >
                        {term}
                      </span>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

/* -------------------------------- Settings ------------------------------ */

function Settings({
  data,
  update,
  onApplied,
}: {
  data: OnboardingData;
  update: (patch: Partial<OnboardingData>) => void;
  onApplied: () => void;
}) {
  const [stage, setStage] = useState<ApplyStage | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  // Saving is no longer a confirmation message over nothing: it refreshes
  // the research snapshot and tells the engine to re-plan, so the answers
  // on this screen are the answers the agent works from.
  const save = async () => {
    if (stage && stage !== "done" && stage !== "error") return;
    setResult(null);
    try {
      const applied = await applySettings(data, setStage);
      setResult(applied);
      onApplied();
    } catch {
      setStage("error");
      setResult({
        ok: false,
        replanned: false,
        stored: null,
        researchRefreshed: false,
        message: "Could not apply the changes. Please try again.",
      });
    }
    setTimeout(() => setStage(null), 4000);
  };

  const busy = stage !== null && stage !== "done" && stage !== "error";
  const stageLabel: Record<ApplyStage, string> = {
    saving: "Saving",
    clearing: "Clearing the old plan",
    researching: "Researching your market",
    syncing: "Updating the agent",
    done: "Done",
    error: "Failed",
  };

  return (
    <div className="grid gap-6">
      <Card className="p-6 sm:p-8">
        <h2 className="text-[14.5px] font-medium">Business</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field
            label="Business name"
            value={data.business.name}
            onChange={(e) => update({ business: { ...data.business, name: e.target.value } })}
          />
          <Field
            label="Website URL"
            value={data.website.url}
            onChange={(e) => update({ website: { ...data.website, url: e.target.value } })}
          />
          <Field
            label="Phone"
            optional
            hint="Shown on every page and included in your business schema markup."
            value={data.business.phone}
            onChange={(e) => update({ business: { ...data.business, phone: e.target.value } })}
          />
          <Field
            label="Street address"
            optional
            value={data.business.address}
            onChange={(e) => update({ business: { ...data.business, address: e.target.value } })}
          />
          <Field
            label="City"
            value={data.business.city}
            onChange={(e) => update({ business: { ...data.business, city: e.target.value } })}
          />
          <Field
            label="State or region"
            optional
            value={data.business.region}
            onChange={(e) => update({ business: { ...data.business, region: e.target.value } })}
          />
          <Field
            label="Service area"
            optional
            value={data.business.serviceArea}
            onChange={(e) => update({ business: { ...data.business, serviceArea: e.target.value } })}
          />
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <h2 className="text-[14.5px] font-medium">Market</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          The agent builds keywords and the content queue from these. Comma separated.
        </p>
        <div className="mt-5 grid gap-5">
          <Field
            label="Industry"
            hint="e.g. Custom pool construction"
            value={data.market.industry}
            onChange={(e) => update({ market: { ...data.market, industry: e.target.value } })}
          />
          <Field
            label="Services"
            hint="e.g. pool remodeling, pool installation"
            value={data.market.services}
            onChange={(e) => update({ market: { ...data.market, services: e.target.value } })}
          />
          <Field
            label="Target locations"
            hint="e.g. Scottsdale, Paradise Valley, Tempe"
            value={data.market.locations}
            onChange={(e) => update({ market: { ...data.market, locations: e.target.value } })}
          />
          <Field
            label="Competitors"
            optional
            hint="Optional. The agent discovers competitors from live search each cycle; anything you add here is watched as well as what it finds."
            value={data.market.competitors}
            onChange={(e) => update({ market: { ...data.market, competitors: e.target.value } })}
          />
          <Field
            label="Average sale value"
            optional
            hint="What a typical customer is worth in dollars. Turns rankings into revenue projections on your dashboard."
            placeholder="4500"
            inputMode="numeric"
            value={data.market.avgSaleValue}
            onChange={(e) => update({ market: { ...data.market, avgSaleValue: e.target.value } })}
          />
          <Field
            label="Keyword wishlist"
            hint="Keywords you want to win, comma separated. The agent seeds its queue with these first."
            placeholder="pool remodeling scottsdale, best pool builder"
            value={data.market.wishlist}
            onChange={(e) => update({ market: { ...data.market, wishlist: e.target.value } })}
          />
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <h2 className="text-[14.5px] font-medium">Publishing</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="text-[13px] font-medium text-ink">Cadence</span>
            <select
              value={data.launch.cadence}
              onChange={(e) =>
                update({ launch: { ...data.launch, cadence: e.target.value as Cadence } })
              }
              className="mt-2 w-full rounded-xl border border-line bg-paper px-4 py-3 text-[14.5px] text-ink outline-none transition-all focus:border-ink focus:ring-4 focus:ring-ink/[0.06]"
            >
              <option value="daily">Daily</option>
              <option value="every3days">Every 3 days</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[13px] font-medium text-ink">Publish mode</span>
            <select
              value={data.launch.mode}
              onChange={(e) =>
                update({ launch: { ...data.launch, mode: e.target.value as PublishMode } })
              }
              className="mt-2 w-full rounded-xl border border-line bg-paper px-4 py-3 text-[14.5px] text-ink outline-none transition-all focus:border-ink focus:ring-4 focus:ring-ink/[0.06]"
            >
              <option value="autopilot">Autopilot &mdash; publish automatically</option>
              <option value="review">Review &mdash; approve before publishing</option>
            </select>
          </label>
        </div>
      </Card>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-[14px] font-medium text-on-ink transition-colors hover:bg-accent disabled:opacity-60"
          >
            {busy && (
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-on-ink/30 border-t-white"
              />
            )}
            {busy ? stageLabel[stage] : "Save changes"}
          </button>
          {/* role=status announces progress and the outcome; a colour or
              opacity change alone tells assistive tech nothing. */}
          <span role="status" aria-live="polite" className="text-[13px] text-muted">
            {busy ? `${stageLabel[stage]}…` : result ? result.message : ""}
          </span>
        </div>
        {result?.replanned && (
          <p className="text-[12.5px] leading-relaxed text-muted">
            Changing your market answers resets the plan: the keyword pool and
            any unpublished drafts were cleared so the agent researches your
            new profile from scratch. Pages already published to your site are
            never removed.
            {result.cleared
              ? ` Cleared ${result.cleared.keywords} keywords and ${result.cleared.drafts} draft${
                  result.cleared.drafts === 1 ? "" : "s"
                }.`
              : ""}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The master switch for autonomous production, in the dashboard header
 * where it is reachable from every tab.
 *
 * State lives in the database (sites.active), not in this component, so a
 * paused agent stays paused across reloads, other devices, and the cron —
 * which reads the same column. The label states the current state rather
 * than the action ("Agent running" / "Agent paused") with the verb on the
 * button, because a control that only says "Stop" leaves you guessing
 * whether you already pressed it.
 */
function AgentSwitch({ onManageBilling }: { onManageBilling: () => void }) {
  const { engine, sites, entitlement, refresh } = useAgentPages();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // With no engine (or no site yet) there is nothing to stop, so the switch
  // would be a button that controls nothing. Show the plain indicator instead
  // — one status element in the header either way, never two that disagree.
  if (!engine || sites.length === 0) {
    return (
      <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line px-3 py-1.5 sm:px-3.5">
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent animate-livepulse" />
        <span className="label-mono hidden text-muted sm:inline">Preview</span>
      </span>
    );
  }
  const paused = sites.every((s) => !s.active);

  // Billing outranks the switch. An owner whose agent stopped for a failed
  // payment needs to see that, not a Resume button that will not work —
  // "paused" and "suspended" look identical from the outside, and only one
  // of them is fixed by pressing anything here.
  if (entitlement && !entitlement.allowed) {
    // Running out the free preview is not a billing failure, and telling
    // someone to "fix billing" when they have never given us a card reads
    // as an error they caused. It is the good outcome: the agent worked,
    // they watched it, and now there is something to buy.
    const spent = entitlement.state === "free_limit";
    return (
      <span className="flex items-center gap-2">
        <span className="hidden items-center gap-1.5 text-[12.5px] text-ink sm:inline-flex" title={entitlement.reason}>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ink" />
          {spent
            ? `${entitlement.free?.used ?? 0} of ${entitlement.free?.limit ?? 0} free pages used`
            : "Agent stopped"}
        </span>
        <button
          onClick={onManageBilling}
          title={entitlement.reason}
          className="rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-medium text-on-ink transition-colors hover:bg-accent"
        >
          {spent ? "Upgrade" : "Fix billing"}
        </button>
      </span>
    );
  }

  // Still inside the free preview: show what is left, beside the running
  // indicator rather than in place of it — the agent genuinely is working.
  if (entitlement?.state === "free" && entitlement.free) {
    const { used, limit } = entitlement.free;
    return (
      <span className="flex items-center gap-2">
        <span className="hidden items-center gap-1.5 text-[12.5px] text-ink sm:inline-flex" title={entitlement.reason}>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent animate-livepulse" />
          {used} of {limit} free pages used
        </span>
        <button
          onClick={onManageBilling}
          title={entitlement.reason}
          className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:border-ink/40 hover:bg-paper-warm"
        >
          Upgrade
        </button>
      </span>
    );
  }

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !paused }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) setError(json.error || "Could not change the agent state.");
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(false);
    refresh();
  };

  return (
    <span className="flex items-center gap-2">
      <span
        className={`hidden items-center gap-1.5 text-[12.5px] sm:inline-flex ${
          paused ? "text-muted" : "text-ink"
        }`}
        title={error ?? undefined}
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${paused ? "bg-muted/50" : "bg-accent animate-livepulse"}`}
        />
        {paused ? "Agent paused" : "Agent running"}
      </span>
      <button
        onClick={toggle}
        disabled={busy}
        aria-pressed={paused}
        title={
          paused
            ? "Resume automatic page production"
            : "Stop the agent from producing new pages until you resume it"
        }
        className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors disabled:opacity-60 ${
          paused
            ? "bg-ink text-on-ink hover:bg-accent"
            : "border border-line text-ink hover:border-ink/40 hover:bg-paper-warm"
        }`}
      >
        {busy ? "…" : paused ? "Resume agent" : "Stop agent"}
      </button>
    </span>
  );
}

/**
 * Support, inside the dashboard.
 *
 * Reuses the same ContactForm the public /support page renders, so there
 * is one contact form in the product rather than two that drift. The
 * public page stays for people who cannot sign in — which is exactly who
 * needs it most — while a signed-in owner never has to leave their
 * dashboard, and never has to sign back in to return to it.
 */
function SupportPanel() {
  const answers = [
    {
      q: "A page the agent published looks wrong",
      a: "Paste the page URL in your message. Every page carries its audit score and the run that produced it, so we can trace exactly what was generated and why it passed the gate.",
    },
    {
      q: "The agent has stopped producing pages",
      a: "Check the agent switch at the top of this page first — if it reads Paused, resume it. The Analytics tab shows the last cycle and when the next one is due.",
    },
    {
      q: "Billing, plan changes, or cancelling",
      a: "The Plan card in the sidebar opens billing, where you can change your card, cancel, or resume. Write in if anything there does not do what you expect.",
    },
  ];
  return (
    <div className="grid gap-5">
      <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <h2 className="text-[15px] font-medium">Talk to us</h2>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
          Questions about your account, your agent, or a page it published — send them
          here and they reach a person, usually within one business day.
        </p>
        <div className="mt-5">
          {/* Was a hardcoded literal — the public /support page and the
              legal pages all read the configurable site.supportEmail, so
              the dashboard's own Support tab was the one surface that
              would keep mailing the old address if that env var ever
              changed. */}
          <ContactForm inbox={site.supportEmail} />
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <h2 className="text-[15px] font-medium">Before you write in</h2>
        <ul className="mt-4 grid gap-3">
          {answers.map((item) => (
            <li key={item.q} className="rounded-xl border border-line p-3.5">
              <p className="text-[13.5px] font-medium">{item.q}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink/70">{item.a}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
