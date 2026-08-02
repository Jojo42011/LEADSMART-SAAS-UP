import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getTenantBillingByEmail, setTenantPlanByEmail, storeConfigured } from "@/lib/engine/store";
import {
  stripeConfigured,
  getSubscriptionForCustomer,
  setCancelAtPeriodEnd,
  createPortalSession,
  setSubscriptionSites,
} from "@/lib/stripe";
import { siteAllowanceFor, setSiteAllowance } from "@/lib/engine/store";
import { quoteFor, describeQuote, bundleUpsell } from "@/lib/pricing";

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
    const seats = await siteAllowanceFor(auth.user.email);
    return NextResponse.json({
      ...base,
      mode: tenant?.stripeCustomerId ? "stripe" : "demo",
      subscription: null,
      seats,
      quote: quoteFor(seats.allowance),
      quoteLabel: describeQuote(quoteFor(seats.allowance)),
      upsell: bundleUpsell(seats.allowance),
    });
  }

  const sub = await getSubscriptionForCustomer(tenant.stripeCustomerId);
  if (sub && "error" in sub) {
    return NextResponse.json({ ...base, mode: "stripe", subscription: null, error: sub.error });
  }
  const seats = await siteAllowanceFor(auth.user.email);
  return NextResponse.json({
    ...base,
    mode: "stripe",
    subscription: sub,
    seats,
    quote: quoteFor(seats.allowance),
    quoteLabel: describeQuote(quoteFor(seats.allowance)),
    upsell: bundleUpsell(seats.allowance),
  });
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
    if (action === "addSite" || action === "removeSite") {
      // Seats move in demo mode too, so the add-a-website flow can be
      // exercised end to end before Stripe is connected — otherwise the
      // first time it runs would be against a paying customer.
      const seats = await siteAllowanceFor(auth.user.email);
      const target = action === "addSite" ? seats.allowance + 1 : seats.allowance - 1;
      if (target < 1 || target < seats.used) {
        return NextResponse.json(
          { ok: false, error: `You have ${seats.used} websites connected. Remove one from Settings first.` },
          { status: 409 }
        );
      }
      await setSiteAllowance(auth.user.email, target);
      return NextResponse.json({
        ok: true,
        mode: "demo",
        seats: { allowance: target, used: seats.used },
        quote: quoteFor(target),
        quoteLabel: describeQuote(quoteFor(target)),
      });
    }
    return NextResponse.json(
      { ok: false, error: "Payment methods and invoices need Stripe, which is not set up on this deployment." },
      { status: 409 }
    );
  }

  if (action === "addSite" || action === "removeSite") {
    const seats = await siteAllowanceFor(auth.user.email);
    const target = action === "addSite" ? seats.allowance + 1 : seats.allowance - 1;

    if (target < 1) {
      return NextResponse.json(
        { ok: false, error: "A subscription covers at least one website. Cancel it instead to stop entirely." },
        { status: 409 }
      );
    }
    // Removing a seat must not silently orphan a site the agent is still
    // publishing to. The owner deletes the site first; the bill follows
    // the sites, never the other way round.
    if (target < seats.used) {
      return NextResponse.json(
        {
          ok: false,
          error: `You have ${seats.used} websites connected. Remove one from Settings before reducing the plan.`,
        },
        { status: 409 }
      );
    }

    const sub = await getSubscriptionForCustomer(tenant.stripeCustomerId);
    if (!sub || "error" in sub) {
      return NextResponse.json(
        { ok: false, error: sub && "error" in sub ? sub.error : "No subscription found for this account." },
        { status: 404 }
      );
    }
    const res = await setSubscriptionSites(sub.subscriptionId, target);
    if ("error" in res) return NextResponse.json({ ok: false, error: res.error }, { status: 502 });

    // Stripe accepted the change, so the local allowance follows now
    // rather than waiting for the webhook — the owner is about to use the
    // seat they just bought, and being told they have not paid for it
    // would be absurd.
    await setSiteAllowance(auth.user.email, target);
    return NextResponse.json({
      ok: true,
      seats: { allowance: target, used: seats.used },
      quote: quoteFor(target),
      quoteLabel: describeQuote(quoteFor(target)),
    });
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
