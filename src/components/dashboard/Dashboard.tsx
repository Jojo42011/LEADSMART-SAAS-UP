"use client";

import { useEffect, useMemo, useState } from "react";
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
import { GEO_TACTICS } from "@/lib/geo";
import { loadIntel, type Intel } from "@/lib/intel";

type Tab = "Overview" | "Content" | "Keywords" | "Competitors" | "Settings";

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
    label: "Content",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 8h6M9 12h6M9 16h4" strokeLinecap="round" />
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
  Rewriting: "bg-ink text-white",
  Held: "bg-ink text-white",
  Tracking: "bg-ink/[0.06] text-ink/70",
};

const threatStyles: Record<string, string> = {
  High: "bg-ink text-white",
  Moderate: "bg-accent/10 text-accent",
  Low: "bg-ink/[0.06] text-muted",
};

const gapTypeStyles: Record<string, string> = {
  Core: "bg-accent/10 text-accent",
  Differentiator: "bg-ink/[0.08] text-ink/80",
  Commodity: "bg-ink/[0.04] text-muted",
  Opportunity: "bg-ink text-white",
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
  return <div className={`min-w-0 rounded-2xl border border-line bg-white ${className}`}>{children}</div>;
}

function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <Card className="p-10 text-center">
      <p className="text-[14.5px] font-medium">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted">{sub}</p>
    </Card>
  );
}

export function Dashboard() {
  const [data, update] = useOnboarding();
  const [tab, setTab] = useState<Tab>("Overview");
  const [intel, setIntel] = useState<Intel>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage, same pattern as useOnboarding
    setIntel(loadIntel());
  }, []);

  const plan = useMemo(() => buildPlan(data), [data]);

  const siteName = data.business.name || "Your site";
  const siteUrl = data.website.url?.replace(/^https?:\/\//, "") || "";

  return (
    <div className="flex min-h-screen bg-paper-warm">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white px-5 py-7 md:flex">
        <div className="px-2">
          <Wordmark href="/dashboard" />
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
        </nav>
        <div className="mt-auto rounded-xl border border-line p-4">
          <p className="label-mono text-muted/70">Plan</p>
          <p className="mt-1 text-[13.5px] font-medium">Active</p>
          <p className="mt-0.5 text-[12px] text-muted">$49 per website, monthly</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[16px] font-medium tracking-tight">{siteName}</h1>
            {siteUrl && <p className="truncate text-[12.5px] text-muted">{siteUrl}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* Mobile tab switcher */}
            <select
              value={tab}
              aria-label="Dashboard section"
              onChange={(e) => setTab(e.target.value as Tab)}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[13px] md:hidden"
            >
              {navItems.map((item) => (
                <option key={item.label}>{item.label}</option>
              ))}
            </select>
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line px-3 py-1.5 sm:px-3.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent animate-livepulse" />
              <span className="label-mono hidden text-muted sm:inline">Agent active</span>
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-4 py-10 sm:px-6">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.21, 0.47, 0.32, 0.98] }}
          >
            {tab === "Overview" && <Overview plan={plan} goTo={setTab} />}
            {tab === "Content" && <Content plan={plan} />}
            {tab === "Keywords" && (
              <div className="grid gap-5">
                <LiveResearch intel={intel} mode="keywords" />
                <Keywords plan={plan} />
              </div>
            )}
            {tab === "Competitors" && (
              <div className="grid gap-5">
                <LiveResearch intel={intel} mode="competitors" />
                <Competitors plan={plan} goTo={setTab} />
              </div>
            )}
            {tab === "Settings" && <Settings data={data} update={update} />}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------- Overview ------------------------------- */

function PillarBar({ label, value, delay = 0 }: { label: string; value: number; delay?: number }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-24 shrink-0 text-[12.5px] text-muted">{label}</span>
      <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
        <motion.div
          className="h-full rounded-full bg-accent"
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.9, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
        />
      </div>
      <span className="w-8 shrink-0 text-right font-mono text-[11.5px] text-muted">{value}</span>
    </div>
  );
}

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

  const setupTasks = [
    { label: "Workspace created", done: true },
    { label: "Brand and design ingest", done: true },
    { label: "Keyword gap analysis", done: hasPlan },
    { label: "90 day roadmap built", done: hasPlan },
  ];

  const kpis = [
    {
      label: "Pages in queue",
      value: String(plan.pages.length),
      note: hasPlan ? "First page within 24 hours" : "Add services in Settings to start the queue",
    },
    { label: "Keywords tracked", value: String(plan.keywords.length), note: "Prioritized by business potential" },
    {
      label: "Traffic value (est.)",
      value: plan.trafficValue > 0 ? `$${plan.trafficValue.toLocaleString()}/mo` : "—",
      note: "What these clicks would cost in ads, at month-6 pace",
    },
    plan.projection
      ? {
          label: "Projected monthly revenue",
          value: `$${plan.projection.monthlyValue.toLocaleString()}`,
          note: `~${plan.projection.leads} leads/mo, ${Math.round(plan.projection.closeRate * 100)}% closing at $${plan.projection.avgSaleValue.toLocaleString()} each, month 6 pace`,
        }
      : {
          label: "Projected monthly value",
          value: "—",
          note: "Add your average sale value in Settings to project revenue",
        },
  ];

  return (
    <>
      {/* Plan-ready banner */}
      <div className="overflow-hidden rounded-2xl border border-line-dark bg-ink p-7 text-white sm:p-9">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="label-mono text-accent">{hasPlan ? "Setup complete" : "Almost there"}</span>
            <h2 className="font-display mt-3 text-3xl tracking-tight sm:text-4xl">
              {hasPlan ? "Your 90 day roadmap is ready." : "Tell the agent about your market."}
            </h2>
            <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-white/55">
              {hasPlan ? (
                <>
                  The agent mapped {plan.keywords.length} keywords across your
                  services and locations and queued the first {plan.pages.length}{" "}
                  pages. The roadmap rebuilds itself from live results every cycle.
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
                  <span className="h-4 w-4 shrink-0 rounded-full border border-white/25" />
                )}
                <span className={t.done ? "text-white" : "text-white/45"}>{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="p-6">
            <p className="label-mono text-muted/70">{kpi.label}</p>
            <p className="font-display mt-2 text-[27px] leading-tight tracking-tight sm:text-3xl">{kpi.value}</p>
            <p className="mt-1.5 text-[12.5px] text-muted">{kpi.note}</p>
          </Card>
        ))}
      </div>

      {/* Ascent Score + roadmap */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[14.5px] font-medium">Ascent Score</h2>
              <p className="mt-1 text-[12.5px] text-muted">
                Site health across pillars, coverage and AI readiness
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-4xl leading-none tracking-tight">
                {plan.ascentScore.value || "—"}
              </p>
              <p className="label-mono mt-1 text-accent">
                {plan.ascentScore.delta > 0 ? `▲ +${plan.ascentScore.delta} this cycle` : "Pending"}
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-3.5">
            <PillarBar label="Substance" value={plan.pillars.substance} />
            <PillarBar label="Signal" value={plan.pillars.signal} delay={0.08} />
            <PillarBar label="Structure" value={plan.pillars.structure} delay={0.16} />
            <PillarBar label="AI retrieval" value={plan.retrievability} delay={0.24} />
          </div>
          <p className="mt-5 border-t border-line pt-4 text-[12px] leading-relaxed text-muted">
            Substance is depth and originality. Signal is links and trust.
            Structure is the technical layer. AI retrieval is how citable your
            pages are in AI answers. The agent works on whatever raises this
            score most.
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[14.5px] font-medium">90 day roadmap</h2>
            <span className="label-mono text-muted/60">Rebuilds every cycle</span>
          </div>
          {plan.roadmap.length === 0 && (
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              The roadmap is built from your keyword map. Add services and
              locations in Settings and it will fill in here.
            </p>
          )}
          <div className="mt-4 grid gap-3">
            {plan.roadmap.map((r, i) => (
              <div key={r.period} className="min-w-0 rounded-xl border border-line p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="label-mono text-accent">{r.period}</span>
                  <span className="text-[12px] text-muted">{r.pages} pages</span>
                </div>
                <p className="mt-1.5 text-[13.5px] font-medium">{r.focus}</p>
                {r.samples.length > 0 && (
                  <p className="mt-1 truncate text-[12px] text-muted">
                    {i === 0 ? "Starting with: " : "e.g. "}
                    {r.samples.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Cycle digest + AI visibility */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[14.5px] font-medium">This cycle</h2>
            <span className="label-mono text-muted/60">Written by your agent</span>
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink/80">{plan.digest.summary}</p>
          <div className="mt-4 grid gap-2 border-t border-line pt-4">
            {plan.digest.actions.map((a) => (
              <div key={a} className="flex items-start gap-2.5 text-[13px] text-muted">
                <svg viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m3.5 8.5 3 3L12.5 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {a}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[14.5px] font-medium">AI visibility</h2>
            <span className="label-mono text-muted/60">Retrievability {plan.retrievability || "—"}/100</span>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
            Every page is structured so AI answer engines can cite it: direct
            answers first, entity-rich language, machine-readable structure.
            Citations are tracked here once your first pages are live.
          </p>
          <div className="mt-4 grid gap-2 border-t border-line pt-4">
            {/* Copilot belongs here: robots.ts already allows Bingbot
                specifically because Copilot cites from the Bing index. */}
            {["Google AI Mode", "Google AI Overviews", "ChatGPT", "Perplexity", "Gemini", "Microsoft Copilot"].map((engine) => (
              <div key={engine} className="flex items-center justify-between text-[13px]">
                <span className="text-ink/80">{engine}</span>
                <span className="inline-flex items-center gap-2 text-[11.5px] text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent animate-livepulse" />
                  Monitoring
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Queue preview */}
      <Card className="mt-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[14.5px] font-medium">Content queue</h2>
          <button onClick={() => goTo("Content")} className="label-mono text-muted/60 transition-colors hover:text-ink">
            View all &rarr;
          </button>
        </div>
        <div className="mt-5 grid gap-3">
          {plan.pages.slice(0, 3).map((page) => (
            <QueueRow key={page.keyword} page={page} />
          ))}
        </div>
        {plan.pages.length === 0 && (
          <p className="mt-2 text-center text-[12.5px] text-muted/70">
            Add services and locations in Settings to build your queue.
          </p>
        )}
      </Card>
    </>
  );
}

function QueueRow({ page, detailed = false }: { page: PageDraft; detailed?: boolean }) {
  const [openSchema, setOpenSchema] = useState<string | null>(null);
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
            {page.veto.triggered && (
              <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 text-[10px] font-normal text-white">
                Held: critical check
                {/* The reason was previously title-only, unreachable by keyboard. */}
                {page.veto.reason && <span className="sr-only">. {page.veto.reason}</span>}
              </span>
            )}
          </p>
          <p className="truncate text-[12px] text-muted">
            {page.keyword} &middot; {page.note}
          </p>
        </div>
        <span
          className={`hidden shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] sm:inline-flex ${
            page.infoGain < 0.5 ? "bg-ink text-white" : "bg-ink/[0.04] text-muted"
          }`}
          title="Information gain vs. current top-ranking pages. Must clear 0.50 to publish."
        >
          <span className="sr-only">Information gain </span>
          <span aria-hidden="true">IG </span>
          {page.infoGain.toFixed(2)}
          <span className="sr-only"> of a required 0.50 minimum</span>
        </span>
        <span
          className="hidden shrink-0 rounded-full bg-ink/[0.04] px-2.5 py-1 font-mono text-[11px] text-muted sm:inline-flex"
          title="Weighted GEO score: tactics weighted by their real measured impact on AI-answer visibility, minus penalties for keyword stuffing, thin content, excessive CTAs, or low fact density."
        >
          GEO {page.geo.score}/100
        </span>
        <StatusPill status={page.status} />
      </div>
      {detailed && (
        <>
          <div className="mt-3.5 grid gap-2 border-t border-line pt-3.5 sm:grid-cols-2 lg:grid-cols-4">
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
                  page.geo.tactics[t.key] ? "bg-ink/[0.06] text-ink/70" : "bg-ink/[0.03] text-muted/40 line-through"
                }`}
              >
                <span className="sr-only">{page.geo.tactics[t.key] ? "Satisfied: " : "Not satisfied: "}</span>
                {t.label}
              </span>
            ))}
            {page.geo.negativeSignals
              .filter((n) => n.triggered)
              .map((n) => (
                <span key={n.key} className="rounded-full bg-ink px-2.5 py-1 text-[11px] text-white">
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
                    openSchema === s ? "bg-ink text-white" : "bg-ink/[0.04] text-muted hover:bg-ink/[0.08]"
                  }`}
                >
                  {s}
                  <span className="sr-only"> schema, show generated JSON-LD</span>
                </button>
              ))}
            </span>
          </div>
          {openSchema && page.schemaJsonLd[openSchema] && (
            <div className="mt-3 overflow-x-auto rounded-lg bg-ink p-4">
              <pre className="font-mono text-[11px] leading-relaxed text-white/80">
                {JSON.stringify(page.schemaJsonLd[openSchema], null, 2)}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* -------------------------------- Content ------------------------------- */

function Content({ plan }: { plan: ReturnType<typeof buildPlan> }) {
  if (plan.pages.length === 0)
    return (
      <EmptyState
        title="No pages queued yet"
        sub="Add your services and locations in Settings and the agent will build a page queue from them."
      />
    );

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[14.5px] font-medium">Content queue</h2>
        <span className="label-mono text-muted/60">{plan.pages.length} pages this cycle</span>
      </div>
      <p className="mt-1 text-[12.5px] text-muted">
        Every page carries its Ascent Method pillar scores, an information
        gain check, a weighted GEO score for AI answer engines, real schema
        markup, and a freshness clock. Under 75 overall, 0.50 IG, or a failed
        critical check, it never publishes. Spoke pages (location-specific)
        always go out before the hub page they link back to.
      </p>
      <div className="mt-5 grid gap-3">
        {plan.pages.map((page) => (
          <QueueRow key={page.keyword} page={page} detailed />
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------- Keywords ------------------------------- */

function Keywords({ plan }: { plan: ReturnType<typeof buildPlan> }) {
  if (plan.keywords.length === 0)
    return (
      <EmptyState
        title="No keywords tracked yet"
        sub="Add your services and locations in Settings and the agent will map the keywords worth ranking for."
      />
    );

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-6">
        <h2 className="text-[14.5px] font-medium">Tracked keywords</h2>
        <span className="label-mono text-muted/60">{plan.keywords.length} keywords</span>
      </div>
      <p className="mt-1 px-6 text-[12.5px] text-muted">
        Ordered by business potential: how likely a searcher is to become a
        customer, not just how many people search. Off site opportunity flags
        where a Reddit, Quora, or Wikipedia presence would help this keyword
        get cited by AI answer engines, based on where each engine draws its
        citations from.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-y border-line text-muted">
              <th className="px-6 py-3 font-medium">Keyword</th>
              <th className="px-4 py-3 font-medium">Potential</th>
              <th className="px-4 py-3 font-medium">Intent</th>
              <th className="px-4 py-3 font-medium">Est. volume</th>
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
                <td className="px-4 py-3.5 text-muted">{k.volume.toLocaleString()}/mo</td>
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
}: {
  plan: ReturnType<typeof buildPlan>;
  goTo: (t: Tab) => void;
}) {
  if (plan.competitors.length === 0)
    return (
      <Card className="p-10 text-center">
        <p className="text-[14.5px] font-medium">No competitors added yet</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted">
          List the competitors you want the agent to study and it will map
          their keyword coverage against yours.
        </p>
        <button
          onClick={() => goTo("Settings")}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-accent"
        >
          Add competitors in Settings &rarr;
        </button>
      </Card>
    );

  const totalGaps = plan.competitors.reduce((s, c) => s + c.gapCount, 0);

  return (
    <>
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[14.5px] font-medium">Keyword gap analysis</h2>
            <p className="mt-1 text-[12.5px] text-muted">
              Every gap is classified: <span className="font-medium text-ink/80">Core</span> (all
              top competitors cover it, add now), <span className="font-medium text-ink/80">Differentiator</span> (some
              do, and outrank you), <span className="font-medium text-ink/80">Commodity</span> (everyone
              covers it shallowly — a sentence is enough), or <span className="font-medium text-ink/80">Opportunity</span> (nobody
              owns this angle yet — a real chance to lead). Gap findings feed
              the queue automatically: Core and Opportunity keywords get a
              priority boost on the Keywords tab, and Core gaps jump straight
              into the page queue. Competitors are ranked by threat so you know
              which to answer first. Overlap and referring-domain figures are
              estimates derived from your keyword set — connect Search Console
              for measured data.
            </p>
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
            <p className="mt-1.5 text-[12.5px] text-muted">{c.threat.reason}</p>
            <div className="mt-5">
              {c.overlap !== null && (
                <>
                  <div className="flex items-center justify-between text-[12px] text-muted">
                    <span title="Estimated from your keyword set until Search Console data is connected.">
                      Keyword overlap <span className="text-muted/50">(est.)</span>
                    </span>
                    <span className="font-medium text-ink">{c.overlap}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${c.overlap}%` }} />
                  </div>
                </>
              )}
              <p className="mt-2 text-[11.5px] text-muted/70">
                {c.referringDomains} referring domains (est.)
              </p>
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
              {c.leadCount > 0 && (
                <div className="mt-4 border-t border-line pt-3.5">
                  <p className="text-[12px] text-muted">
                    <span className="font-medium text-ink">{c.leadCount} keyword{c.leadCount > 1 ? "s" : ""}</span>{" "}
                    where you lead &middot; they have no mapped coverage
                  </p>
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
                </div>
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
}: {
  data: OnboardingData;
  update: (patch: Partial<OnboardingData>) => void;
}) {
  const [saved, setSaved] = useState(false);
  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
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
            label="City"
            value={data.business.city}
            onChange={(e) => update({ business: { ...data.business, city: e.target.value } })}
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
            hint="Names or domains, comma separated. Their coverage is mapped against yours for the gap analysis."
            value={data.market.competitors}
            onChange={(e) => update({ market: { ...data.market, competitors: e.target.value } })}
          />
          <Field
            label="Average sale value"
            hint="What a typical customer is worth in dollars. Powers the revenue projection on your overview."
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
              className="mt-2 w-full rounded-xl border border-line bg-white px-4 py-3 text-[14.5px] text-ink outline-none transition-all focus:border-ink focus:ring-4 focus:ring-ink/[0.06]"
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
              className="mt-2 w-full rounded-xl border border-line bg-white px-4 py-3 text-[14.5px] text-ink outline-none transition-all focus:border-ink focus:ring-4 focus:ring-ink/[0.06]"
            >
              <option value="autopilot">Autopilot &mdash; publish automatically</option>
              <option value="review">Review &mdash; approve before publishing</option>
            </select>
          </label>
        </div>
      </Card>

      <div className="flex items-center gap-4">
        <button
          onClick={flash}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-[14px] font-medium text-white transition-colors hover:bg-accent"
        >
          Save changes
        </button>
        {/* role=status announces the confirmation; opacity alone left screen
            reader users with no feedback that the save happened. */}
        <span
          role="status"
          aria-live="polite"
          className={`text-[13px] text-muted transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}
        >
          {saved ? "Saved — changes apply everywhere" : ""}
        </span>
      </div>
    </div>
  );
}

/* ---------------------------- Live research ---------------------------- */

/**
 * Findings from the agent's real first research cycle, captured during
 * onboarding. Shown above the planning views so live market data always
 * outranks simulation.
 */
function LiveResearch({ intel, mode }: { intel: Intel; mode: "keywords" | "competitors" }) {
  const research = intel.research;
  if (!research) return null;

  if (mode === "competitors" && research.competitors.length > 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-[14.5px] font-medium">
            Live research findings
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-livepulse" />
          </p>
          <span className="label-mono text-muted/60">
            {research.source === "live" ? "From live search" : "First pass"}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] text-muted">{research.summary}</p>
        <div className="mt-4 grid gap-2.5">
          {research.competitors.slice(0, 6).map((c) => (
            <div key={c.domain} className="rounded-xl border border-line p-4">
              <p className="font-mono text-[12.5px] font-medium">{c.domain}</p>
              <p className="mt-1 text-[12.5px] text-muted">
                <span className="font-medium text-ink/70">Ranks because </span>
                {c.strength}
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted">
                <span className="font-medium text-accent">Your opening </span>
                {c.weakness}
              </p>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (mode === "keywords" && research.keywords.length > 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-[14.5px] font-medium">
            Live keyword targets
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-livepulse" />
          </p>
          <span className="label-mono text-muted/60">
            {research.keywords.length} found {research.source === "live" ? "via live search" : "from your profile"}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {research.keywords.slice(0, 18).map((k) => (
            <span
              key={k.keyword}
              title={k.reason}
              className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[12px]"
            >
              {k.keyword}
              <span className={`font-mono text-[10.5px] ${k.opportunity >= 70 ? "text-accent" : "text-muted/60"}`}>
                {k.opportunity}
              </span>
            </span>
          ))}
        </div>
      </Card>
    );
  }

  return null;
}
