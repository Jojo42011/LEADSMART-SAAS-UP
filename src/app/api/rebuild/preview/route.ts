import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { storeConfigured, getRebuildForEmail } from "@/lib/engine/store";

/**
 * Serves the rebuilt homepage exactly as it would publish, for the
 * approve-before-pay iframe. Ownership through the tenant join, same as
 * the page preview: a siteId from another account is a 404, not someone
 * else's homepage.
 */
export async function GET(req: NextRequest) {
  if (!storeConfigured()) {
    return NextResponse.json({ ok: false, error: "engine not connected" }, { status: 404 });
  }
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  const siteId = req.nextUrl.searchParams.get("siteId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) {
    return NextResponse.json({ ok: false, error: "invalid site id" }, { status: 400 });
  }

  const row = await getRebuildForEmail(siteId, auth.user.email);
  if (!row) return NextResponse.json({ ok: false, error: "no rebuild for this site" }, { status: 404 });

  return new NextResponse(row.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Never indexed: this is a preview on our domain of a page whose
      // real home is the customer's — letting it rank would be duplicate
      // content pointed at the wrong site.
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "private, no-store",
    },
  });
}
