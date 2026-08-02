import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { createCheckoutSession, stripeConfigured } from "@/lib/stripe";
import { setTenantPlanByEmail, setSiteAllowance, storeConfigured } from "@/lib/engine/store";

/**
 * Real subscription checkout. GET reports whether Stripe is configured so
 * the checkout page knows which mode to render; POST creates a Stripe
 * Checkout Session and returns its URL for redirect. Without a key the
 * client falls back to the demo flow, unchanged.
 */

export async function GET() {
  return NextResponse.json({ configured: stripeConfigured() });
}

export async function POST(req: NextRequest) {
  let quantity = 1;
  try {
    const body = (await req.clone().json()) as { sites?: number };
    if (body.sites) quantity = Math.max(1, Math.floor(body.sites));
  } catch {
    // default quantity
  }

  if (!stripeConfigured()) {
    // Demo checkout still has to activate the plan. The engine only serves
    // tenants with plan_status 'active', and the sole writer of that status
    // was the Stripe webhook — so on a keyless deployment every tenant
    // stayed 'inactive' forever and the cycle skipped every site while all
    // the individual health checks read green. Activation stays gated on a
    // real signed-in session; it is the payment that is simulated, not the
    // identity.
    const user = readSession(req);
    if (user && storeConfigured()) {
      try {
        await setTenantPlanByEmail(user.email, "active");
        // Demo checkout still records the seats, so the add-a-website
        // limit behaves the same way it will with Stripe connected.
        await setSiteAllowance(user.email, quantity);
      } catch {
        // The client-side demo flow proceeds regardless; onboarding's
        // provisioning surfaces database problems with a real error.
      }
    }
    return NextResponse.json({ configured: false, demoActivated: Boolean(user && storeConfigured()) });
  }

  const user = readSession(req);
  const result = await createCheckoutSession({
    origin: req.nextUrl.origin,
    quantity,
    email: user?.email,
  });

  if ("error" in result) {
    return NextResponse.json({ configured: true, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ configured: true, url: result.url });
}
