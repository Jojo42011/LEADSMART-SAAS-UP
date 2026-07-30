"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

  if (!data.connected) {
    return <ConnectCard googleReady={data.googleReady} error={data.error} />;
  }
  if (data.error || !data.series) {
    return <ConnectCard googleReady={data.googleReady} error={data.error || "No data returned."} />;
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
