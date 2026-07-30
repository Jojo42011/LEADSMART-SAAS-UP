import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { storeConfigured, getPageForEmail } from "@/lib/engine/store";

/**
 * Renders a page the agent wrote, exactly as it would appear on the
 * customer's site. The engine stores the complete HTML document in the
 * pages table, so the owner can see the finished page before (or without)
 * a live site existing — held drafts and review-queue pages included.
 *
 * Ownership is enforced through the tenant join: a page id from another
 * account returns 404, not someone else's content.
 */
export async function GET(req: NextRequest) {
  if (!storeConfigured()) {
    return NextResponse.json({ ok: false, error: "engine not connected" }, { status: 404 });
  }
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  const id = req.nextUrl.searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid page id" }, { status: 400 });
  }

  const page = await getPageForEmail(id, auth.user.email);
  if (!page) return NextResponse.json({ ok: false, error: "page not found" }, { status: 404 });

  // Prefer the stored document; a page published long ago whose HTML was
  // trimmed can still be seen at its live URL.
  if (!page.html) {
    if (page.live_url) return NextResponse.redirect(page.live_url);
    return NextResponse.json({ ok: false, error: "no stored HTML for this page" }, { status: 404 });
  }

  return new NextResponse(page.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // A preview is never a public page: keep crawlers out and scripts off.
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": "script-src 'none'; frame-ancestors 'self'",
      "Cache-Control": "private, no-store",
    },
  });
}
