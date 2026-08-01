import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { storeConfigured, getPageWithSiteOwned } from "@/lib/engine/store";
import { publishStoredPage } from "@/lib/engine/publish-page";

// Publishing includes a live-URL verification fetch and, on GitHub,
// sitemap and index commits — comfortably inside this, but not inside
// the 10s default.
export const maxDuration = 120;

/**
 * Publishes one already-generated page on the owner's say-so.
 *
 * Exists because a page whose publish attempt fails is otherwise
 * stranded: each cycle picks a NEW keyword, so nothing in the system
 * ever returns to an approved page that missed its moment. This runs the
 * exact function the cycle runs — not a lookalike — so the button cannot
 * drift from the engine the way the connection test once did.
 *
 * Also the approval action for review-mode sites: a pending page
 * published by its owner IS approved, in the only sense that matters.
 */
export async function POST(req: NextRequest) {
  if (!storeConfigured()) {
    return NextResponse.json({ ok: false, error: "engine not connected" }, { status: 503 });
  }
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const found = await getPageWithSiteOwned(id, auth.user.email);
  if (!found) {
    return NextResponse.json({ ok: false, error: "page not found" }, { status: 404 });
  }
  const { page, site } = found;

  if (page.status === "published" && page.live_url) {
    return NextResponse.json(
      { ok: false, error: "This page is already published.", liveUrl: page.live_url },
      { status: 409 }
    );
  }
  if (page.status === "held") {
    // The gate is the product's promise. A button that overrides it
    // would make "held below the quality gate" a suggestion.
    return NextResponse.json(
      { ok: false, error: "This page is held below the quality gate. Delete it to requeue the keyword instead." },
      { status: 409 }
    );
  }
  if (!page.html) {
    return NextResponse.json(
      { ok: false, error: "This page has no stored content to publish." },
      { status: 422 }
    );
  }

  const res = await publishStoredPage(site, {
    id: page.id,
    slug: page.slug,
    folder: page.folder,
    title: page.title,
    html: page.html,
  });

  if (!res.published) {
    return NextResponse.json({ ok: false, error: res.publishError ?? "publish failed" }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    keyword: page.keyword,
    liveUrl: res.liveUrl,
    liveStatus: res.liveStatus,
  });
}
