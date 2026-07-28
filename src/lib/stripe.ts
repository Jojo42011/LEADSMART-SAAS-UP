import { createHmac, timingSafeEqual } from "crypto";

/**
 * Server side Stripe wrapper over the REST API — no SDK, matching the
 * dependency-free style of the rest of the server code. Configured with
 * STRIPE_SECRET_KEY; the checkout degrades to demo mode without it.
 *
 * Pricing: uses STRIPE_PRICE_ID when set (a recurring Price you created in
 * the Stripe dashboard). Otherwise it creates the $49/month price inline via
 * price_data, so checkout works the moment the secret key exists.
 */

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

const UNIT_AMOUNT_CENTS = 4900; // $49 per website per month

export async function createCheckoutSession(input: {
  origin: string;
  quantity: number;
  email?: string;
}): Promise<{ url: string } | { error: string }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { error: "not_configured" };

  const qty = Math.min(20, Math.max(1, Math.floor(input.quantity) || 1));
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("success_url", `${input.origin}/checkout?paid=1&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${input.origin}/checkout?canceled=1`);
  params.set("line_items[0][quantity]", String(qty));
  if (input.email) params.set("customer_email", input.email);
  params.set("metadata[sites]", String(qty));
  if (input.email) params.set("metadata[email]", input.email);

  const priceId = process.env.STRIPE_PRICE_ID;
  if (priceId) {
    params.set("line_items[0][price]", priceId);
  } else {
    params.set("line_items[0][price_data][currency]", "usd");
    params.set("line_items[0][price_data][unit_amount]", String(UNIT_AMOUNT_CENTS));
    params.set("line_items[0][price_data][recurring][interval]", "month");
    params.set("line_items[0][price_data][product_data][name]", "Ascent — autonomous SEO agent, per website");
  }

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json()) as { url?: string; error?: { message?: string } };
    if (!res.ok || !json.url) {
      return { error: json.error?.message || `stripe error ${res.status}` };
    }
    return { url: json.url };
  } catch {
    return { error: "stripe unreachable" };
  }
}

/**
 * Verifies a Stripe webhook signature (Stripe-Signature: t=...,v1=...).
 * v1 is HMAC-SHA256 of `${t}.${rawBody}` with the endpoint's signing
 * secret. Tolerance guards against replay of old events.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  toleranceSeconds = 300
): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const parts = new Map<string, string[]>();
  for (const piece of signatureHeader.split(",")) {
    const [k, v] = piece.split("=", 2);
    if (!k || !v) continue;
    const list = parts.get(k.trim()) ?? [];
    list.push(v.trim());
    parts.set(k.trim(), list);
  }
  const t = parts.get("t")?.[0];
  const sigs = parts.get("v1") ?? [];
  if (!t || sigs.length === 0) return false;

  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected);
  return sigs.some((s) => {
    const buf = Buffer.from(s);
    return buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf);
  });
}
