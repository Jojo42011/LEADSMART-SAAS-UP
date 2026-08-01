"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAgentPages } from "@/lib/agent-pages";

/**
 * The Analytics tab: real Google Search Console data — clicks,
 * impressions, CTR and average position — as a premium, minimal set of
 * charts. Accounts without Search Console connected get a one-click
 * connect card that starts the OAuth flow right here.
 *
 * Charts are hand-built SVG: single series each (so no legends — the
 * title names the series), 2px lines with a 10% area wash, hairline solid
 * gridlines, an end marker with a surface ring, and a crosshair tooltip.
 * Series hues (validated for CVD separation and contrast on this surface):
 * clicks #e12d39, impressions #2260dd, position #0d9488.
 */

type DayPoint = { date: string; clicks: number; impressions: number; ctr: number; position: number };
type Totals = { clicks: number; impressions: number; ctr: number; position: number };
type TopQuery = { query: string; clicks: number; impressions: number; ctr: number; position: number };

type AnalyticsPayload = {
  ok: boolean;
  connected: boolean;
  googleReady: boolean;
  engine?: boolean;
  property?: string | null;
  properties?: string[];
  range?: number;
  windowStart?: string;
  windowEnd?: string;
  series?: DayPoint[];
  totals?: Totals;
  prevTotals?: Totals;
  topQueries?: TopQuery[];
  error?: string;
};

const HUES = { clicks: "#e12d39", impressions: "#2260dd", position: "#0d9488" } as const;

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Clean 1/2/5-step axis ticks from zero up to at least max. */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/* ------------------------------ Time series ----------------------------- */

function TimeSeriesChart({
  title,
  sub,
  points,
  color,
  fmt,
  invert = false,
  compactWidth = false,
}: {
  title: string;
  sub?: string;
  points: { date: string; value: number }[];
  color: string;
  fmt: (n: number) => string;
  /** For average position: lower is better, so the axis runs best-at-top. */
  invert?: boolean;
  /** For half-width slots: a narrower viewBox keeps axis text near native size. */
  compactWidth?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = compactWidth ? 420 : 640;
  const H = 190;
  const PAD = { top: 14, right: 46, bottom: 24, left: 40 };
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;

  const { ticks, lo, hi } = useMemo(() => {
    const values = points.map((p) => p.value);
    if (invert) {
      // Position axis: pad around the observed range, integers, best on top.
      const min = Math.max(1, Math.floor(Math.min(...values, 99)) - 1);
      const max = Math.ceil(Math.max(...values, 1)) + 1;
      const t = niceTicks(max - min, 3).map((v) => v + min).filter((v) => v <= max);
      return { ticks: t.length >= 2 ? t : [min, max], lo: min, hi: max };
    }
    const t = niceTicks(Math.max(...values, 1));
    return { ticks: t, lo: 0, hi: t[t.length - 1] };
  }, [points, invert]);

  const x = (i: number) => PAD.left + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => {
    const t = (v - lo) / (hi - lo || 1);
    return PAD.top + (invert ? t * ih : (1 - t) * ih);
  };

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const baselineY = invert ? PAD.top : PAD.top + ih;
  const areaPath = `${linePath} L${x(points.length - 1).toFixed(1)},${baselineY} L${x(0).toFixed(1)},${baselineY} Z`;

  const last = points[points.length - 1];
  const xTickIdx = useMemo(() => {
    const n = points.length;
    if (n <= 4) return points.map((_, i) => i);
    return [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1];
  }, [points]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / iw) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  const hovered = hover !== null ? points[hover] : null;

  return (
    <div className="min-w-0 rounded-2xl border border-line bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[13.5px] font-medium text-ink">{title}</h3>
          {sub && <p className="mt-0.5 text-[11.5px] text-muted">{sub}</p>}
        </div>
        {last && <span className="font-mono text-[12px] text-muted">{fmt(last.value)} latest</span>}
      </div>
      <div ref={wrapRef} className="relative mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-none select-none"
          role="img"
          aria-label={`${title}: ${points.length} days, latest ${last ? fmt(last.value) : "no data"}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {/* Gridlines: hairline, solid, recessive */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#ececea" strokeWidth="1" />
              <text x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#9a9a94" fontFamily="ui-monospace, monospace">
                {compact(t)}
              </text>
            </g>
          ))}
          {/* X ticks */}
          {xTickIdx.map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#9a9a94" fontFamily="ui-monospace, monospace">
              {fmtDate(points[i].date)}
            </text>
          ))}
          {/* Area wash + line */}
          <path d={areaPath} fill={color} opacity="0.1" />
          <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {/* Crosshair */}
          {hovered && hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="#c9c9c4" strokeWidth="1" />
              <circle cx={x(hover)} cy={y(hovered.value)} r="5" fill={color} stroke="#ffffff" strokeWidth="2" />
            </g>
          )}
          {/* End marker with surface ring + selective end label */}
          {last && hover === null && (
            <g>
              <circle cx={x(points.length - 1)} cy={y(last.value)} r="4.5" fill={color} stroke="#ffffff" strokeWidth="2" />
              <text
                x={x(points.length - 1) + 8}
                y={y(last.value) + 3.5}
                fontSize="11"
                fontWeight="600"
                fill="#0a0a0a"
                fontFamily="ui-monospace, monospace"
              >
                {fmt(last.value)}
              </text>
            </g>
          )}
        </svg>
        {hovered && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-line bg-white px-3 py-1.5 shadow-lg shadow-black/[0.06]"
            style={{
              left: `${((x(hover as number) / W) * 100).toFixed(2)}%`,
              top: 0,
            }}
          >
            <p className="whitespace-nowrap text-[11px] text-muted">{fmtDate(hovered.date)}</p>
            <p className="whitespace-nowrap text-[12.5px] font-semibold text-ink">{fmt(hovered.value)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- Stat tile ------------------------------ */

function StatTile({
  label,
  value,
  delta,
  deltaGood,
  spark,
  hue,
  fmtSpark,
}: {
  label: string;
  value: string;
  /** Signed human delta vs the previous window, e.g. "+312" or "−0.4". */
  delta: string | null;
  deltaGood: boolean | null;
  spark: number[];
  hue: string;
  fmtSpark?: (n: number) => string;
}) {
  const w = 84;
  const h = 26;
  const min = Math.min(...spark);
  const max = Math.max(...spark);
  const pts = spark
    .map((v, i) => {
      const px = spark.length <= 1 ? w / 2 : (i / (spark.length - 1)) * w;
      const py = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");
  const lastPt = pts.split(" ").pop()?.split(",").map(Number) ?? [0, 0];
  void fmtSpark;

  return (
    <div className="min-w-0 rounded-2xl border border-line bg-white p-5">
      <p className="text-[12px] text-muted">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <span className="text-[26px] font-semibold leading-none tracking-tight text-ink">{value}</span>
        {spark.length > 1 && (
          <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true" className="shrink-0">
            <polyline points={pts} fill="none" stroke="#d9d9d4" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={lastPt[0]} cy={lastPt[1]} r="3" fill={hue} stroke="#ffffff" strokeWidth="1.5" />
          </svg>
        )}
      </div>
      {delta !== null && (
        <p className="mt-2 text-[11.5px]" style={{ color: deltaGood === null ? "#6f6f6a" : deltaGood ? "#0d7a6d" : "#c22532" }}>
          {delta} vs previous period
        </p>
      )}
    </div>
  );
}

/* ------------------------------ Connect card ----------------------------- */

function ConnectCard({ googleReady, error }: { googleReady: boolean; error?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-8 sm:p-10">
      <div className="mx-auto max-w-md text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-paper-warm">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-ink" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="m4 17 5-5 3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15 7h5v5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="font-display mt-5 text-[22px] tracking-tight">See what your site is really doing</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Connect Google Search Console and this tab fills with your actual
          impressions, clicks, click-through rate and ranking position —
          straight from Google, updated daily.
        </p>
        {error && (
          <p className="mt-4 rounded-xl border border-accent/30 bg-accent-dim px-4 py-3 text-[12.5px] leading-relaxed text-ink">
            {error}
          </p>
        )}
        {googleReady ? (
          <a
            href="/api/connect/gsc/start?flow=dashboard"
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[14.5px] font-medium text-white transition-colors hover:bg-accent"
          >
            Connect Search Console
            <span aria-hidden="true">&rarr;</span>
          </a>
        ) : (
          <p className="mt-6 text-[12.5px] text-muted">
            Google sign-in keys aren&apos;t configured on this deployment yet, so
            the connection can&apos;t start. Add GOOGLE_CLIENT_ID and
            GOOGLE_CLIENT_SECRET to enable it.
          </p>
        )}
        <p className="mt-4 text-[11.5px] text-muted/70">
          Read-only access. Ascent can see your search data, never change your site&apos;s settings.
        </p>
      </div>
    </div>
  );
}

/* --------------------------------- The tab ------------------------------- */

export function Analytics() {
  const [range, setRange] = useState<28 | 90>(28);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  // Starts true and is only toggled from async fetch callbacks and the
  // range buttons, never synchronously inside the effect.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/analytics?range=${range}`)
      .then((r) => r.json())
      .then((j: AnalyticsPayload) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {
        if (!cancelled) setData({ ok: false, connected: false, googleReady: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-6">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="text-[13px] text-muted">Loading Search Console data</p>
      </div>
    );
  }
  if (!data) return null;

  // The calendar is drawn from the agent's own rows, not from Search Console,
  // so it stays visible while Google is unconnected or erroring — otherwise
  // the publishing record disappears for a reason that has nothing to do with
  // publishing.
  if (!data.connected || data.error || !data.series) {
    return (
      <div className="grid gap-5">
        <PublishingCalendar />
        <ConnectCard
          googleReady={data.googleReady}
          error={data.connected ? data.error || "No data returned." : data.error}
        />
      </div>
    );
  }

  const { series, totals, prevTotals, topQueries } = data;
  const hasData = series.length > 0 && (totals?.impressions ?? 0) > 0;

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const pos = (n: number) => n.toFixed(1);

  const deltaOf = (cur: number, prev: number, fmt: (n: number) => string, downIsGood = false) => {
    if (prev <= 0) return { text: null as string | null, good: null as boolean | null };
    const d = cur - prev;
    if (Math.abs(d) < 1e-9) return { text: "±0", good: null };
    const sign = d > 0 ? "+" : "−";
    const good = downIsGood ? d < 0 : d > 0;
    return { text: `${sign}${fmt(Math.abs(d))}`, good };
  };

  const dClicks = deltaOf(totals!.clicks, prevTotals!.clicks, (n) => compact(Math.round(n)));
  const dImpr = deltaOf(totals!.impressions, prevTotals!.impressions, (n) => compact(Math.round(n)));
  const dCtr = deltaOf(totals!.ctr, prevTotals!.ctr, (n) => `${(n * 100).toFixed(1)} pts`);
  const dPos = deltaOf(totals!.position, prevTotals!.position, (n) => n.toFixed(1), true);

  return (
    <div className="grid gap-5">
      <PublishingCalendar />
      {/* Filter row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-medium">Search performance</h2>
          <p className="mt-0.5 text-[12px] text-muted">
            {data.property} · {data.windowStart} to {data.windowEnd}{" — "}Google&apos;s data lags about two days
          </p>
        </div>
        <div className="flex rounded-full border border-line bg-white p-1" role="group" aria-label="Date range">
          {([28, 90] as const).map((r) => (
            <button
              key={r}
              onClick={() => {
                setRange(r);
                setLoading(true);
              }}
              aria-pressed={range === r}
              className={`rounded-full px-4 py-1.5 text-[12.5px] font-medium transition-colors ${
                range === r ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="rounded-2xl border border-line bg-white p-10 text-center">
          <p className="text-[14.5px] font-medium">Connected — no impressions in this window yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">
            Search Console is linked to {data.property}. New sites and new pages
            usually take a couple of weeks to accumulate search data; the agent
            keeps publishing while this fills in.
          </p>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label="Clicks"
              value={compact(totals!.clicks)}
              delta={dClicks.text}
              deltaGood={dClicks.good}
              spark={series.slice(-12).map((p) => p.clicks)}
              hue={HUES.clicks}
            />
            <StatTile
              label="Impressions"
              value={compact(totals!.impressions)}
              delta={dImpr.text}
              deltaGood={dImpr.good}
              spark={series.slice(-12).map((p) => p.impressions)}
              hue={HUES.impressions}
            />
            <StatTile
              label="Click-through rate"
              value={pct(totals!.ctr)}
              delta={dCtr.text}
              deltaGood={dCtr.good}
              spark={series.slice(-12).map((p) => p.ctr)}
              hue={HUES.clicks}
            />
            <StatTile
              label="Average position"
              value={pos(totals!.position)}
              delta={dPos.text}
              deltaGood={dPos.good}
              spark={series.slice(-12).map((p) => -p.position)}
              hue={HUES.position}
            />
          </div>

          {/* Charts — one series per chart, one axis per chart */}
          <TimeSeriesChart
            title="Clicks from Google Search"
            sub="Daily clicks on your results"
            points={series.map((p) => ({ date: p.date, value: p.clicks }))}
            color={HUES.clicks}
            fmt={(n) => compact(Math.round(n))}
          />
          <div className="grid gap-5 lg:grid-cols-2">
            <TimeSeriesChart
              title="Impressions"
              sub="How often your site appeared in results"
              points={series.map((p) => ({ date: p.date, value: p.impressions }))}
              color={HUES.impressions}
              fmt={(n) => compact(Math.round(n))}
              compactWidth
            />
            <TimeSeriesChart
              title="Average position"
              sub="Closer to 1 is better — up means improving"
              points={series.map((p) => ({ date: p.date, value: p.position }))}
              color={HUES.position}
              fmt={(n) => n.toFixed(1)}
              invert
              compactWidth
            />
          </div>

          {/* Top queries */}
          {topQueries && topQueries.length > 0 && (
            <div className="min-w-0 overflow-hidden rounded-2xl border border-line bg-white">
              <div className="border-b border-line px-5 py-4">
                <h3 className="text-[13.5px] font-medium">Top queries</h3>
                <p className="mt-0.5 text-[11.5px] text-muted">What people searched when they found you</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                      <th className="px-5 py-2.5 font-medium">Query</th>
                      <th className="px-4 py-2.5 text-right font-medium">Clicks</th>
                      <th className="px-4 py-2.5 text-right font-medium">Impressions</th>
                      <th className="px-4 py-2.5 text-right font-medium">CTR</th>
                      <th className="px-5 py-2.5 text-right font-medium">Position</th>
                    </tr>
                  </thead>
                  <tbody className="[font-variant-numeric:tabular-nums]">
                    {topQueries.map((q) => (
                      <tr key={q.query} className="border-b border-line/60 last:border-0">
                        <td className="max-w-[280px] truncate px-5 py-2.5 font-medium text-ink">{q.query}</td>
                        <td className="px-4 py-2.5 text-right">{q.clicks.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right">{q.impressions.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right">{pct(q.ctr)}</td>
                        <td className="px-5 py-2.5 text-right">{q.position.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * A month of publishing at a glance: which days the agent shipped a page,
 * which days it held one, and when the next cycle is due.
 *
 * Built from the engine's own rows rather than a schedule model, so it
 * shows what actually happened. Upcoming days are projected from the
 * site's cadence and marked as projections, never mixed in with real
 * history — a calendar that draws planned work in the same ink as
 * finished work is the kind of thing that quietly misleads an owner about
 * what their site contains.
 */
function PublishingCalendar() {
  const { engine, sites } = useAgentPages();
  const [monthOffset, setMonthOffset] = useState(0);

  if (!engine || sites.length === 0) return null;

  const site = sites[0];
  const pages = sites.flatMap((s) => s.pages);

  const now = new Date();
  const view = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = view.getFullYear();
  const month = view.getMonth();
  const monthLabel = view.toLocaleString("en-US", { month: "long", year: "numeric" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const todayKey = new Date().toDateString();

  // Group real pages by the day they were published (or created, for the
  // ones still held — those days still represent agent activity).
  const byDay = new Map<number, { published: number; held: number; titles: string[] }>();
  for (const p of pages) {
    const stamp = p.published_at || p.created_at;
    if (!stamp) continue;
    const d = new Date(stamp);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const day = d.getDate();
    const cell = byDay.get(day) || { published: 0, held: 0, titles: [] };
    if (p.status === "published") cell.published += 1;
    else cell.held += 1;
    if (cell.titles.length < 4) cell.titles.push(p.title);
    byDay.set(day, cell);
  }

  // Projected cycles: from the last run, stepping by cadence, while the
  // agent is actually running. A paused agent has no next cycle to show.
  const stepDays = site.cadence === "weekly" ? 7 : site.cadence === "every3days" ? 3 : 1;
  const upcoming = new Set<number>();
  if (site.active) {
    const start = site.lastRunAt ? new Date(site.lastRunAt) : new Date();
    for (let i = 1; i <= 40; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i * stepDays);
      if (d < new Date()) continue;
      if (d.getFullYear() === year && d.getMonth() === month) upcoming.add(d.getDate());
    }
  }

  const publishedTotal = [...byDay.values()].reduce((a, c) => a + c.published, 0);
  const heldTotal = [...byDay.values()].reduce((a, c) => a + c.held, 0);

  return (
    <div className="rounded-2xl border border-line bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-medium">Publishing calendar</h2>
          <p className="mt-0.5 text-[12px] text-muted">
            {publishedTotal} published, {heldTotal} held in {monthLabel} ·{" "}
            {site.active ? `Publishing ${site.cadence === "every3days" ? "every 3 days" : site.cadence}` : "Agent paused"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonthOffset((m) => m - 1)}
            aria-label="Previous month"
            className="rounded-lg border border-line px-2.5 py-1 text-[13px] text-muted hover:border-ink/40 hover:text-ink"
          >
            ‹
          </button>
          <button
            onClick={() => setMonthOffset(0)}
            className="rounded-lg border border-line px-3 py-1 text-[12.5px] text-muted hover:border-ink/40 hover:text-ink"
          >
            Today
          </button>
          <button
            onClick={() => setMonthOffset((m) => m + 1)}
            aria-label="Next month"
            className="rounded-lg border border-line px-2.5 py-1 text-[13px] text-muted hover:border-ink/40 hover:text-ink"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={`${d}${i}`} className="pb-1 text-center text-[11px] font-medium text-muted/70">
            {d}
          </div>
        ))}
        {Array.from({ length: firstWeekday }, (_, i) => (
          <div key={`pad${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const cell = byDay.get(day);
          const isToday = new Date(year, month, day).toDateString() === todayKey;
          const projected = upcoming.has(day) && !cell;
          const label = cell
            ? `${day}: ${cell.published} published, ${cell.held} held — ${cell.titles.join("; ")}`
            : projected
              ? `${day}: cycle projected`
              : `${day}`;
          return (
            <div
              key={day}
              title={label}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-[12px] ${
                cell
                  ? "border-accent/40 bg-accent/[0.08] font-medium text-ink"
                  : projected
                    ? "border-dashed border-line text-muted/70"
                    : "border-line text-muted/60"
              } ${isToday ? "ring-2 ring-ink/70" : ""}`}
            >
              <span>{day}</span>
              {cell && (
                <span className="mt-0.5 flex gap-0.5">
                  {Array.from({ length: Math.min(cell.published, 3) }, (_, k) => (
                    <span key={`p${k}`} className="h-1 w-1 rounded-full bg-accent" />
                  ))}
                  {Array.from({ length: Math.min(cell.held, 3) }, (_, k) => (
                    <span key={`h${k}`} className="h-1 w-1 rounded-full bg-ink/30" />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-line pt-3 text-[11.5px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Published
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-ink/30" /> Held below the quality gate
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded border border-dashed border-line" /> Projected cycle
        </span>
      </div>
    </div>
  );
}
