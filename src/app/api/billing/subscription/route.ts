import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getTenantBillingByEmail, setTenantPlanByEmail, storeConfigured } from "@/lib/engine/store";
import {
  stripeConfigured,
  getSubscriptionForCustomer,
  setCancelAtPeriodEnd,
  createPortalSession,
} from "@/lib/stripe";

/**
 * The signed-in owner's subscription, and the actions on it.
 *
 * GET returns the live state — Stripe's, when Stripe is configured and
 * the tenant has a customer id; otherwise the tenant's stored plan status
 * labelled as demo. The two are never blended: trial dates and the card
 * on file change through Stripe's own surfaces, so mirroring them would
 * drift, and a billing panel that shows stale billing facts is worse
 * than one that says it cannot reach Stripe.
 *
 * POST takes {action}: "cancel" | "resume" | "portal".
 * Cancel schedules the end of the period rather than cutting service —
 * the customer paid for (or is trialing) the time, so it runs out and
 * does not renew; cancelling during a trial means never being charged.
 * The portal handles payment methods and invoices on Stripe's hosted
 * page, so card details never touch this codebase.
 */
export async function GET(req: NextRequest) {
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  const tenant = storeConfigured() ? await getTenantBillingByEmail(auth.user.email) : null;
  const base = {
    ok: true,
    stripe: stripeConfigured(),
    planStatus: tenant?.planStatus ?? "inactive",
    email: auth.user.email,
  };

  if (!stripeConfigured() || !tenant?.stripeCustomerId) {
    // Demo activation or pre-checkout: there is no Stripe subscription to
    // read, and pretending otherwise would invent trial dates.
    return NextResponse.json({ ...base, mode: tenant?.stripeCustomerId ? "stripe" : "demo", subscription: null });
  }

  const sub = await getSubscriptionForCustomer(tenant.stripeCustomerId);
  if (sub && "error" in sub) {
    return NextResponse.json({ ...base, mode: "stripe", subscription: null, error: sub.error });
  }
  return NextResponse.json({ ...base, mode: "stripe", subscription: sub });
}

export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  let action: string;
  try {
    action = ((await req.json()) as { action?: string }).action ?? "";
  } catch {
    return NextResponse.json({ ok: false, error: "action required" }, { status: 400 });
  }

  const tenant = storeConfigured() ? await getTenantBillingByEmail(auth.user.email) : null;

  // Demo mode: cancel/resume flip the stored plan status so the whole
  // product behaves consistently (the engine gates on it), and the panel
  // says plainly that no payment was involved.
  if (!stripeConfigured() || !tenant?.stripeCustomerId) {
    if (action === "cancel" || action === "resume") {
      if (!storeConfigured()) {
        return NextResponse.json({ ok: false, error: "engine not connected" }, { status: 503 });
      }
      await setTenantPlanByEmail(auth.user.email, action === "cancel" ? "canceled" : "active");
      return NextResponse.json({ ok: true, mode: "demo" });
    }
    return NextResponse.json(
      { ok: false, error: "Payment methods and invoices need Stripe, which is not set up on this deployment." },
      { status: 409 }
    );
  }

  if (action === "portal") {
    const portal = await createPortalSession({
      customerId: tenant.stripeCustomerId,
      returnUrl: `${req.nextUrl.origin}/dashboard`,
    });
    if ("error" in portal) return NextResponse.json({ ok: false, error: portal.error }, { status: 502 });
    return NextResponse.json({ ok: true, url: portal.url });
  }

  if (action === "cancel" || action === "resume") {
    const sub = await getSubscriptionForCustomer(tenant.stripeCustomerId);
    if (!sub || "error" in sub) {
      return NextResponse.json(
        { ok: false, error: sub && "error" in sub ? sub.error : "No subscription found for this account." },
        { status: 404 }
      );
    }
    const res = await setCancelAtPeriodEnd(sub.subscriptionId, action === "cancel");
    if ("error" in res) return NextResponse.json({ ok: false, error: res.error }, { status: 502 });
    // plan_status is deliberately untouched here: service runs to the end
    // of the paid period, and the webhook flips the status when Stripe
    // actually ends the subscription.
    return NextResponse.json({ ok: true, mode: "stripe" });
  }

  return NextResponse.json({ ok: false, error: `unknown action "${action}"` }, { status: 400 });
}
