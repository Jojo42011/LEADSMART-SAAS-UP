import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { storeConfigured, provisionSite, resetSitePlanning } from "@/lib/engine/store";
import type { OnboardingData } from "@/lib/onboarding";

/**
 * The bridge between onboarding and the autonomous engine. The wizard's
 * launch step POSTs the completed onboarding (plus the ingest brand
 * snapshot) here; this creates or updates the tenant, site and publishing
 * connection rows that the daily cron picks up. Identity comes from the
 * signed-in session; a GitHub OAuth publish token comes from the httpOnly
 * gh_token cookie so it never transits the client.
 *
 * Keyless deployments (no DATABASE_URL) return stored:false and the app
 * keeps working from localStorage, same as before the backend existed.
 */

type Body = {
  onboarding?: OnboardingData;
  brand?: Record<string, unknown>;
  /**
   * Set when the owner changed the market profile in Settings. Clears the
   * keyword pool and unpublished drafts so the next cycle re-researches
   * from the new answers instead of continuing on the old ones.
   */
  replan?: boolean;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  const data = body.onboarding;
  if (!data?.website?.url || !data.website.platform) {
    return NextResponse.json({ ok: false, error: "onboarding data with website required" }, { status: 400 });
  }

  if (!storeConfigured()) {
    return NextResponse.json({
      ok: true,
      stored: false,
      note: "No DATABASE_URL set; running in local demo mode. Set it and apply db/schema.sql to activate the autonomous engine.",
    });
  }

  const user = readSession(req);
  if (!user) {
    return NextResponse.json(
      { ok: false, stored: false, error: "not signed in", note: "Sign in (Google or GitHub) so the agent knows whose site this is." },
      { status: 401 }
    );
  }

  // Prefer the OAuth token from the httpOnly cookie over anything the
  // client typed; fall back to a manually entered token.
  const ghCookieToken = req.cookies.get("gh_token")?.value;
  const githubToken = data.publishing.githubOauth
    ? ghCookieToken || data.publishing.githubToken
    : data.publishing.githubToken || ghCookieToken;

  const avgRaw = Number((data.market.avgSaleValue || "").replace(/[^0-9.]/g, ""));

  try {
    const result = await provisionSite({
      email: user.email,
      name: user.name,
      site: {
        url: data.website.url.replace(/\/$/, ""),
        platform: data.website.platform,
        cadence: data.launch.cadence,
        publishMode: data.launch.mode,
        businessName: data.business.name,
        phone: data.business.phone,
        address: data.business.address,
        city: data.business.city,
        region: data.business.region,
        serviceArea: data.business.serviceArea,
        industry: data.market.industry,
        services: data.market.services,
        targetLocations: data.market.locations,
        seedCompetitors: data.market.competitors,
        avgSaleValue: avgRaw > 0 ? avgRaw : null,
        brand: body.brand ?? {},
      },
      connection: {
        wpUser: data.publishing.wpUser || undefined,
        wpAppPassword: data.publishing.wpAppPassword || undefined,
        githubRepo: data.publishing.githubRepo || undefined,
        githubToken: githubToken || undefined,
        githubBranch: data.publishing.githubBranch || undefined,
        // Set when Search Console was connected during onboarding, before
        // this site row existed. Already encrypted by the GSC callback;
        // encryptSecret's already-encrypted guard prevents double-wrapping.
        gscRefreshToken: req.cookies.get("gsc_token")?.value || undefined,
      },
    });
    if (!result) {
      return NextResponse.json({ ok: true, stored: false, note: "store unconfigured" });
    }
    // A profile change makes the existing plan obsolete: the cycle only
    // researches when the keyword pool is thin, so without this the agent
    // would keep working from the answers given at onboarding.
    const reset = body.replan ? await resetSitePlanning(result.siteId) : null;

    return NextResponse.json({
      ok: true,
      stored: true,
      siteId: result.siteId,
      replanned: Boolean(body.replan),
      cleared: reset,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, stored: false, error: e instanceof Error ? e.message : "provisioning failed" },
      { status: 500 }
    );
  }
}
