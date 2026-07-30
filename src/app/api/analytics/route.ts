import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { storeConfigured, listSitesForEmail, getConnection } from "@/lib/engine/store";
import { decryptSecret } from "@/lib/secrets";

/**
 * Real Search Console data for the dashboard's Analytics tab: daily
 * clicks, impressions, CTR and average position, plus top queries.
 *
 * The refresh token stored at connect time is exchanged for a short-lived
 * access token on every request; nothing long-lived leaves the server.
 * Totals for the previous window of the same length ride along so the
 * tiles can show honest deltas. Search Console data lags ~2 days, so the
 * window ends two days ago rather than pretending today has numbers.
 */

type GscRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

type DayPoint = { date: string; clicks: number; impressions: number; ctr: number; position: number };

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function accessTokenFromRefresh(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

/** Picks the GSC property that matches the site URL; falls back to the only one. */
function matchProperty(properties: string[], siteUrl: string): string | null {
  let host = "";
  try {
    host = new URL(siteUrl).hostname.replace(/^www\./, "");
  } catch {
    host = siteUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
  const norm = (p: string) => p.replace(/^sc-domain:/, "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  const exact = properties.find((p) => norm(p) === host);
  if (exact) return exact;
  const domain = properties.find((p) => p.startsWith("sc-domain:") && (host.endsWith(norm(p)) || norm(p).endsWith(host)));
  if (domain) return domain;
  return properties.length === 1 ? properties[0] : null;
}

async function gscQuery(
  accessToken: string,
  property: string,
  body: Record<string, unknown>
): Promise<GscRow[] | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { rows?: GscRow[] };
    return json.rows ?? [];
  } catch {
    return null;
  }
}

function totalsOf(points: DayPoint[]) {
  const clicks = points.reduce((s, p) => s + p.clicks, 0);
  const impressions = points.reduce((s, p) => s + p.impressions, 0);
  const posWeighted = points.reduce((s, p) => s + p.position * p.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? posWeighted / impressions : 0,
  };
}

export async function GET(req: NextRequest) {
  const googleReady = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  if (!storeConfigured()) {
    return NextResponse.json({ ok: true, connected: false, googleReady, engine: false });
  }
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  const range = req.nextUrl.searchParams.get("range") === "90" ? 90 : 28;

  // Find the tenant's site and its stored refresh token; the cookie set at
  // connect time covers accounts whose site was provisioned afterwards.
  const sites = await listSitesForEmail(auth.user.email);
  const site = sites[0] ?? null;
  let refreshToken: string | null = null;
  if (site) {
    const conn = await getConnection(site.id);
    refreshToken = conn?.gsc_refresh_token ?? null;
  }
  if (!refreshToken) {
    refreshToken = decryptSecret(req.cookies.get("gsc_token")?.value ?? null);
  }
  if (!refreshToken) {
    return NextResponse.json({ ok: true, connected: false, googleReady, engine: true });
  }

  const accessToken = await accessTokenFromRefresh(refreshToken);
  if (!accessToken) {
    return NextResponse.json({
      ok: true,
      connected: false,
      googleReady,
      engine: true,
      error: "Search Console authorization expired. Reconnect to continue.",
    });
  }

  // Which property to read: match the site URL against the account's list.
  let properties: string[] = [];
  try {
    const listRes = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (listRes.ok) {
      const json = (await listRes.json()) as { siteEntry?: { siteUrl: string; permissionLevel: string }[] };
      properties = (json.siteEntry ?? [])
        .filter((e) => e.permissionLevel !== "siteUnverifiedUser")
        .map((e) => e.siteUrl);
    }
  } catch {
    // handled below as no property
  }

  const property = matchProperty(properties, site?.url || "");
  if (!property) {
    return NextResponse.json({
      ok: true,
      connected: true,
      googleReady,
      engine: true,
      property: null,
      properties,
      error:
        properties.length === 0
          ? "This Google account has no verified Search Console properties yet. Verify your site at search.google.com/search-console first."
          : "None of the account's Search Console properties match this site's URL.",
    });
  }

  // GSC data lags ~2 days; the window ends there. The previous window of
  // equal length feeds the deltas.
  const end = isoDaysAgo(2);
  const start = isoDaysAgo(2 + range - 1);
  const prevStart = isoDaysAgo(2 + range * 2 - 1);
  const prevEnd = isoDaysAgo(2 + range);

  const [dayRows, prevDayRows, queryRows] = await Promise.all([
    gscQuery(accessToken, property, { startDate: start, endDate: end, dimensions: ["date"], rowLimit: 500 }),
    gscQuery(accessToken, property, { startDate: prevStart, endDate: prevEnd, dimensions: ["date"], rowLimit: 500 }),
    gscQuery(accessToken, property, { startDate: start, endDate: end, dimensions: ["query"], rowLimit: 10 }),
  ]);

  if (dayRows === null) {
    return NextResponse.json({
      ok: true,
      connected: true,
      googleReady,
      engine: true,
      property,
      error: "Search Console rejected the data request. If this persists, reconnect Search Console.",
    });
  }

  const toPoint = (r: GscRow): DayPoint => ({
    date: r.keys?.[0] ?? "",
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  });
  const series = dayRows.map(toPoint).sort((a, b) => a.date.localeCompare(b.date));
  const prevSeries = (prevDayRows ?? []).map(toPoint);

  return NextResponse.json({
    ok: true,
    connected: true,
    googleReady,
    engine: true,
    property,
    siteUrl: site?.url ?? "",
    range,
    windowStart: start,
    windowEnd: end,
    series,
    totals: totalsOf(series),
    prevTotals: totalsOf(prevSeries),
    topQueries: (queryRows ?? []).map((r) => ({
      query: r.keys?.[0] ?? "",
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    })),
  });
}
