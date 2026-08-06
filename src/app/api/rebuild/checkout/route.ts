import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { createRebuildCheckoutSession, stripeConfigured } from "@/lib/stripe";
import { storeConfigured, getRebuildForEmail, markRebuildPaid } from "@/lib/engine/store";

/**
 * Pays for a rebuild: a one-time Stripe Checkout for REBUILD_PRICE.
 *
 * Requires an existing preview — paying for a document that does not
 * exist yet would mean charging first and showing later, the exact
 * inversion the feature was scoped against. Without a Stripe key the
 * demo flow marks the rebuild paid directly, mirroring the subscription
 * checkout's demo mode: the identity is real, only the payment is
 * simulated.
 */
export async function POST(req: NextRequest) {
  if (!storeConfigured()) {
    return NextResponse.json({ ok: false, error: "engine not connected" }, { status: 503 });
  }
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  const body = (await req.json().catch(() => ({}))) as { siteId?: string };
  const siteId = (body.siteId || "").trim();

  const row = siteId ? await getRebuildForEmail(siteId, auth.user.email) : null;
  if (!row) {
    return NextResponse.json(
      { ok: false, error: "Generate and review the preview before paying — you should see what you're buying." },
      { status: 409 }
    );
  }
  if (row.status !== "preview") {
    return NextResponse.json({ ok: true, alreadyPaid: true, status: row.status });
  }

  if (!stripeConfigured()) {
    await markRebuildPaid(siteId);
    return NextResponse.json({ ok: true, demoActivated: true, status: "paid" });
  }

  const result = await createRebuildCheckoutSession({
    origin: req.nextUrl.origin,
    email: auth.user.email,
    siteId,
  });
  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, url: result.url });
}
