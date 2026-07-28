import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { createCheckoutSession, stripeConfigured } from "@/lib/stripe";

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
  if (!stripeConfigured()) {
    return NextResponse.json({ configured: false });
  }

  let quantity = 1;
  try {
    const body = (await req.json()) as { sites?: number };
    if (body.sites) quantity = body.sites;
  } catch {
    // default quantity
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
