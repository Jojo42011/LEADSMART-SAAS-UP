import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { storeConfigured, listSitesForEmail, getPageWithSiteOwned } from "@/lib/engine/store";
import { refreshPageNow } from "@/lib/engine/orchestrator";
import { requireEntitlement } from "@/lib/api-entitlement";

// A refresh regenerates with the LLM, audits, and republishes — the same
// budget a full cycle gets.
export const maxDuration = 300;

/**
 * Rewrites one live page on the owner's say-so, ignoring the staleness
 * threshold.
 *
 * The scheduled refresh only touches pages past 150 days, which is right
 * for automatic maintenance and wrong for the moment an owner changes
 * their prices, adds a service, or spots something out of date. Pressing
 * the button is the judgment call; the agent does not need to agree the
 * page is old.
 *
 * The quality guard still applies: a rewrite that misses the gate or
 * loses ground does not replace what is live, and the reply says so.
 */
export async function POST(req: NextRequest) {
  if (!storeConfigured()) {
    return NextResponse.json({ ok: false, error: "engine not connected" }, { status: 503 });
  }
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  // A refresh is a full generation plus a republish — the most expensive
  // single action in the product.
  const blocked = await requireEntitlement(auth.user.email);
  if (blocked) return blocked;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const found = await getPageWithSiteOwned(id, auth.user.email);
  if (!found) return NextResponse.json({ ok: false, error: "page not found" }, { status: 404 });

  if (found.page.status !== "published" || !found.page.live_url) {
    return NextResponse.json(
      { ok: false, error: "Only a live page can be refreshed — publish it first." },
      { status: 409 }
    );
  }

  const sites = await listSitesForEmail(auth.user.email);
  const site = sites.find((s) => s.id === found.site.id) ?? found.site;
  if (!site.active) {
    return NextResponse.json(
      { ok: false, error: "The agent is paused. Resume it to refresh pages." },
      { status: 409 }
    );
  }

  try {
    const result = await refreshPageNow(site, id);
    if (!result) return NextResponse.json({ ok: false, error: "page not found" }, { status: 404 });
    return NextResponse.json({ ok: result.ok, result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "refresh failed" },
      { status: 500 }
    );
  }
}
