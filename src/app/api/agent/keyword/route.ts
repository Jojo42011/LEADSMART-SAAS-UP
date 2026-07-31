import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { storeConfigured, listSitesForEmail, deleteKeywordOwned } from "@/lib/engine/store";

/**
 * Removes a keyword the owner dismissed from the planned queue, so the
 * engine stops planning a page for it. Only uncovered keywords can be
 * removed — a keyword with a live page is deleted through its page.
 */
export async function DELETE(req: NextRequest) {
  if (!storeConfigured()) {
    return NextResponse.json({ ok: false, error: "engine not connected" }, { status: 503 });
  }
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  const term = req.nextUrl.searchParams.get("term");
  if (!term) return NextResponse.json({ ok: false, error: "term required" }, { status: 400 });

  const sites = await listSitesForEmail(auth.user.email);
  let removed = false;
  for (const site of sites) {
    if (await deleteKeywordOwned(site.id, term, auth.user.email)) removed = true;
  }
  // ok even when the engine never had this term: the dashboard also keeps
  // a local dismissal list for plan-preview keywords that only exist
  // client-side.
  return NextResponse.json({ ok: true, removed });
}
