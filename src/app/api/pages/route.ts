import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { storeConfigured, listSitesForEmail, listPages, listRuns } from "@/lib/engine/store";

/**
 * What the agent has actually written, for the signed-in owner.
 *
 * The dashboard's content queue was rendered entirely from the local
 * deterministic preview, so a page could sit at "Drafting" forever while
 * nothing was being written — the status was computed from a hash of the
 * keyword, not from the engine. This is the real thing: rows the cycle
 * inserted, with the live URL to open a published page and the audit score
 * it shipped on.
 *
 * Scoped by the session's email through the tenant join, so one account can
 * never read another's pages.
 */
export async function GET(req: NextRequest) {
  // Checked before auth on purpose: with no store there are no pages and no
  // tenants, so the reply carries nobody's data. Requiring a session first
  // made a demo deployment — where the dashboard is reachable precisely
  // because no sign-in exists — report "authentication required" instead of
  // the truthful "the engine isn't connected".
  if (!storeConfigured()) {
    return NextResponse.json({
      ok: true,
      engine: false,
      sites: [],
      note: "No DATABASE_URL set, so the autonomous engine is not running. The dashboard is showing a local preview of the plan.",
    });
  }

  const auth = requireSession(req);
  if (auth.response) return auth.response;

  try {
    const sites = await listSitesForEmail(auth.user.email);
    const detailed = await Promise.all(
      sites.map(async (site) => ({
        siteId: site.id,
        url: site.url,
        platform: site.platform,
        cadence: site.cadence,
        publishMode: site.publish_mode,
        lastRunAt: site.last_run_at,
        pages: await listPages(site.id),
        runs: await listRuns(site.id, 5),
      }))
    );
    return NextResponse.json({ ok: true, engine: true, sites: detailed });
  } catch (e) {
    return NextResponse.json(
      { ok: false, engine: true, error: e instanceof Error ? e.message : "could not read pages" },
      { status: 500 }
    );
  }
}
