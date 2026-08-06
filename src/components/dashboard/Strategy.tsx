"use client";

import type { OnboardingData } from "@/lib/onboarding";
import type { buildPlan } from "@/lib/plan";
import { useAgentPages, allPages } from "@/lib/agent-pages";
import { useSearchSnapshot } from "@/lib/search-snapshot";

/**
 * What the agent is trying to do, what it found, what it has done, and
 * what came of it — in that order, on one screen.
 *
 * The rest of the dashboard answers "what is the state of X" a tab at a
 * time: keywords here, competitors there, pages somewhere else. That is
 * the shape of a tool. Someone who has handed their marketing to an agent
 * is asking a different question — the one they would ask a person they
 * hired — and it runs objective, plan, progress, results. This tab is
 * that question answered in that order, assembled from the same data the
 * other tabs already show rather than from a second set of numbers.
 *
 * The hard rule here is that "Completed" and "Results" report only work
 * the engine really did. Everything the local preview computes is a plan,
 * never an achievement: a page the agent intends to write must never
 * appear in a list headed by a date, because that is the difference
 * between a report and a story about a report.
 */

type Plan = ReturnType<typeof buildPlan>;

/* ------------------------------ time buckets ----------------------------- */

const DAY = 86_400_000;

/** Whole days between then and now; negative values clamp to 0. */
function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / DAY));
}

const BUCKETS: { label: string; max: number }[] = [
  { label: "This week", max: 7 },
  { label: "Last week", max: 14 },
  { label: "Earlier this month", max: 31 },
  { label: "Before that", max: Infinity },
];

function bucketFor(days: number): string {
  return (BUCKETS.find((b) => days < b.max) ?? BUCKETS[BUCKETS.length - 1]).label;
}

function whenLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/* --------------------------------- shell --------------------------------- */

function Section({
  step,
  title,
  sub,
  children,
}: {
  step: string;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-line bg-paper p-6 sm:p-7">
      <div className="flex items-baseline gap-3">
        <span className="label-mono text-accent">{step}</span>
        <h2 className="text-[15px] font-medium tracking-tight">{title}</h2>
      </div>
      <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">{sub}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** A finding paired with the action it causes. The pairing is the point. */
function FindingRow({
  finding,
  action,
  tag,
}: {
  finding: string;
  action: string;
  tag?: string;
}) {
  return (
    <div className="grid gap-1.5 border-t border-line py-3.5 first:border-t-0 first:pt-0 sm:grid-cols-[1fr_1fr] sm:gap-6">
      <p className="min-w-0 text-[13px] leading-relaxed text-ink">
        {tag && (
          <span className="mr-2 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-muted">
            {tag}
          </span>
        )}
        {finding}
      </p>
      <p className="min-w-0 text-[12.5px] leading-relaxed text-muted">
        <span aria-hidden="true" className="mr-1.5 text-accent">&rarr;</span>
        {action}
      </p>
    </div>
  );
}

/* -------------------------------- the tab -------------------------------- */

export function Strategy({
  plan,
  data,
  goTo,
}: {
  plan: Plan;
  data: OnboardingData;
  goTo: (t: "Content" | "Keywords" | "Competitors" | "Settings" | "Analytics") => void;
}) {
  const { engine, sites, loading } = useAgentPages();
  const search = useSearchSnapshot();

  const business = data.business.name || "your business";
  const services = data.market.services.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean);
  const locations = Array.from(
    new Set(
      [...data.market.locations.split(/[,\n;]/), data.business.city]
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );

  // Everything under "Completed" and "Results" comes from here — real rows
  // the engine wrote. With no engine connected there is no history to show,
  // and the tab says that rather than dressing the plan up as progress.
  const real = allPages(sites);
  const published = real.filter((p) => p.status === "published");
  const runs = sites.flatMap((s) => s.runs);

  const hasPlan = plan.keywords.length > 0;

  /* ------------------------------ objective ------------------------------ */
  const objective = hasPlan
    ? `Make ${business} the answer people find for ${
        services.length ? services.slice(0, 3).join(", ") : "its services"
      }${locations.length ? ` in ${locations.slice(0, 3).join(", ")}` : ""} — in Google's results and in the answers AI assistants give.`
    : `Tell the agent what ${business} sells and where, and it will set the objective from that.`;

  /* -------------------------- findings → actions ------------------------- */
  // Each row is something the agent noticed paired with what it does about
  // it. A finding with no action attached is trivia, and an action with no
  // finding behind it is busywork; the two columns exist to make either
  // one visible if it ever happens.
  const findings: { finding: string; action: string; tag: string }[] = [];

  const coreGaps = plan.competitors.flatMap((c) =>
    c.gapItems.filter((g) => g.type === "Core").map((g) => ({ ...g, competitor: c.name }))
  );
  if (coreGaps.length) {
    findings.push({
      tag: "Gap",
      finding: `${coreGaps.length} keyword${coreGaps.length === 1 ? "" : "s"} every top competitor covers and this site does not — starting with "${coreGaps[0].keyword}".`,
      action: "Core gaps jump straight into the writing queue; they are the pages a competitor already ranks for and you have nothing to show.",
    });
  }

  const wishlisted = plan.keywords.filter((k) => k.wishlisted).length;
  if (wishlisted) {
    findings.push({
      tag: "Your list",
      finding: `${wishlisted} keyword${wishlisted === 1 ? "" : "s"} you asked for by name.`,
      action: "Scored higher than everything the agent found on its own, so they are written first.",
    });
  }

  const localTargets = plan.keywords.filter((k) => k.intent === "Local" || k.intent === "Near me").length;
  if (localTargets) {
    findings.push({
      tag: "Local",
      finding: `${localTargets} of ${plan.keywords.length} tracked keywords are location or "near me" searches.`,
      action: "Answered with a page per service and place, because that is what a local searcher and an AI recommendation both resolve to.",
    });
  }

  const questions = plan.keywords.filter((k) => k.intent === "Question").length;
  if (questions) {
    findings.push({
      tag: "AI search",
      finding: `${questions} question-shaped searches (cost, how to choose) that AI assistants answer directly.`,
      action: "Built answer-first, so the response sits in the opening lines where an engine can quote it whole.",
    });
  }

  const dueRefresh = published.filter((p) => {
    const d = daysAgo(p.refreshed_at || p.published_at);
    return d !== null && d > 90;
  }).length;
  if (dueRefresh) {
    findings.push({
      tag: "Freshness",
      finding: `${dueRefresh} live page${dueRefresh === 1 ? "" : "s"} past the 90-day freshness threshold.`,
      action: "Rewritten in place with current research — recent pages are substantially more likely to be cited by AI answers.",
    });
  }

  const held = plan.pages.filter((p) => p.held).length;
  if (held) {
    findings.push({
      tag: "Quality gate",
      finding: `${held} draft${held === 1 ? "" : "s"} did not clear the publish gate.`,
      action: "Held back and rewritten rather than published — a page that adds nothing new costs more than it earns.",
    });
  }

  /* ------------------------------ completed ------------------------------ */
  type Done = { when: number; title: string; detail: string };
  const done: Done[] = [];
  for (const p of published) {
    const d = daysAgo(p.published_at);
    if (d === null) continue;
    done.push({
      when: d,
      title: p.title,
      detail: `Published for "${p.keyword}" · scored ${p.audit_score}/100${
        p.refresh_count > 0 ? ` · refreshed ${p.refresh_count}×` : ""
      }`,
    });
  }
  for (const r of runs) {
    const d = daysAgo(r.finished_at || r.started_at);
    if (d === null || !r.summary) continue;
    done.push({ when: d, title: r.summary, detail: `${r.phase} cycle · ${r.status}` });
  }
  done.sort((a, b) => a.when - b.when);

  const grouped = BUCKETS.map((b) => ({
    label: b.label,
    items: done.filter((d) => bucketFor(d.when) === b.label),
  })).filter((g) => g.items.length > 0);

  /* -------------------------------- results ------------------------------- */
  const liveVerified = published.filter((p) => (p.live_status || "").startsWith("live:")).length;

  const results: { label: string; value: string; note: string; onClick?: () => void }[] = [
    {
      label: "Pages live",
      value: engine ? String(published.length) : "—",
      note: engine
        ? liveVerified === published.length && published.length > 0
          ? "all verified reachable"
          : `${liveVerified} verified reachable`
        : "connect the engine to publish",
    },
    {
      label: "Clicks, 28 days",
      value: search.connected && search.clicks !== null ? search.clicks.toLocaleString() : "—",
      note: search.connected ? search.clicksDelta ?? "from Google Search" : "connect Search Console to measure",
      onClick: search.connected ? undefined : () => goTo("Analytics"),
    },
    {
      label: "Average position",
      value: search.connected && search.position !== null ? search.position.toFixed(1) : "—",
      note: search.connected ? search.positionDelta ?? "closer to 1 is better" : "connect Search Console to measure",
      onClick: search.connected ? undefined : () => goTo("Analytics"),
    },
  ];

  return (
    <div className="grid gap-4">
      {/* 1 — Objective */}
      <Section
        step="01"
        title="The objective"
        sub="What the agent is working towards. Set from your answers in Settings, and the reason everything below is on the list."
      >
        <p className="max-w-2xl text-[15px] leading-relaxed text-ink">{objective}</p>
        {hasPlan && (
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-4">
            {[
              ["Keywords mapped", String(plan.keywords.length)],
              ["Locations", String(locations.length || 1)],
              ["Publishing", data.launch.cadence === "every3days" ? "every 3 days" : data.launch.cadence],
              ["Mode", data.launch.mode === "autopilot" ? "autopilot" : "your approval"],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="label-mono text-muted">{k}</p>
                <p className="mt-1 text-[14px] font-medium">{v}</p>
              </div>
            ))}
          </div>
        )}
        {!hasPlan && (
          <button
            onClick={() => goTo("Settings")}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-medium text-on-ink transition-colors hover:bg-accent"
          >
            Open Settings &rarr;
          </button>
        )}
      </Section>

      {/* 2 — The plan */}
      <Section
        step="02"
        title="What it found, and what it's doing about it"
        sub="Every finding is paired with the action it causes. Nothing here needs your approval — it is a description of work already scheduled."
      >
        {findings.length > 0 ? (
          <div className="grid">
            {findings.map((f) => (
              <FindingRow key={f.finding} finding={f.finding} action={f.action} tag={f.tag} />
            ))}
          </div>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted">
            Nothing identified yet. The agent finds gaps from live search on its
            first research cycle — add your services and locations in Settings if
            you have not yet.
          </p>
        )}
        {plan.competitors.length > 0 && (
          <button
            onClick={() => goTo("Competitors")}
            className="mt-4 label-mono text-muted transition-colors hover:text-ink"
          >
            See the full gap analysis &rarr;
          </button>
        )}
      </Section>

      {/* 3 — Completed */}
      <Section
        step="03"
        title="What's been done"
        sub="Work the agent actually completed, newest first. Only real published pages and finished cycles appear here — never planned work."
      >
        {!engine ? (
          <p className="text-[13px] leading-relaxed text-muted">
            No engine connected, so there is no work history to report. Everything
            above is the plan the agent would run.
          </p>
        ) : loading ? (
          <p className="text-[13px] text-muted">Reading the agent&apos;s history…</p>
        ) : grouped.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-muted">
            Nothing published yet. The first page usually lands within 24 hours of
            setup — it will appear here with the date it went live.
          </p>
        ) : (
          <div className="grid gap-6">
            {grouped.map((g) => (
              <div key={g.label}>
                <p className="label-mono text-muted">{g.label}</p>
                <div className="mt-2.5 grid gap-2.5">
                  {g.items.map((item, i) => (
                    <div key={`${item.title}-${i}`} className="flex min-w-0 gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                      />
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium leading-snug">{item.title}</p>
                        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                          {item.detail} · {whenLabel(item.when)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {published.length > 0 && (
          <button
            onClick={() => goTo("Content")}
            className="mt-5 label-mono text-muted transition-colors hover:text-ink"
          >
            See every page &rarr;
          </button>
        )}
      </Section>

      {/* 4 — Results */}
      <Section
        step="04"
        title="What came of it"
        sub="Measured, not modelled. Ranking and traffic figures come straight from Google Search Console; page counts come from the agent's own published rows."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {results.map((r) => {
            const body = (
              <>
                <p className="label-mono text-muted">{r.label}</p>
                <p className="font-display mt-2 text-[27px] leading-tight tracking-tight">{r.value}</p>
                <p className="mt-1.5 text-[12.5px] text-muted">
                  {r.note}
                  {r.onClick && <span className="ml-1 text-accent">&rarr;</span>}
                </p>
              </>
            );
            return r.onClick ? (
              <button
                key={r.label}
                onClick={r.onClick}
                className="min-w-0 rounded-xl border border-line p-5 text-left transition-colors hover:border-ink/40"
              >
                {body}
              </button>
            ) : (
              <div key={r.label} className="min-w-0 rounded-xl border border-line p-5">
                {body}
              </div>
            );
          })}
        </div>
        {/* Deliberately no projected-revenue figure here. The Overview used
            to carry one and it was removed for the same reason it stays out
            of this tab: a number multiplying assumed traffic by an assumed
            close rate is an argument, not a result, and this section is the
            one place a reader is entitled to assume everything is measured. */}
      </Section>
    </div>
  );
}
