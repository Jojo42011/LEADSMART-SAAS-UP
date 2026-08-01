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
  // Free trial, card up front. STRIPE_TRIAL_DAYS=0 disables it. The card
  // is still collected at checkout so the trial converts by default; a
  // customer who cancels during the trial is never charged.
  const trialDays = Number(process.env.STRIPE_TRIAL_DAYS ?? 7);
  if (Number.isFinite(trialDays) && trialDays > 0) {
    params.set("subscription_data[trial_period_days]", String(Math.floor(trialDays)));
  }
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

/* ------------------------- Subscription management ------------------------ */

export type SubscriptionView = {
  /** Stripe's own status: trialing | active | past_due | canceled | ... */
  status: string;
  /** Epoch seconds; null when not in trial. */
  trialEnd: number | null;
  /** True when the subscription ends (rather than renews) at period end. */
  cancelAtPeriodEnd: boolean;
  /** Epoch seconds: when the current paid/trial period closes. */
  currentPeriodEnd: number | null;
  subscriptionId: string;
  quantity: number;
  /** Card on file, when one exists. */
  paymentMethod: { brand: string; last4: string } | null;
};

/**
 * The customer's live subscription, straight from Stripe.
 *
 * Read on demand instead of mirrored into our database: the webhook keeps
 * plan_status current for the engine's is-this-tenant-paying gate, but
 * trial dates, cancel-at-period-end and the card on file change through
 * Stripe's own surfaces (the portal, dunning) and a mirror of them would
 * drift. Billing UI shows Stripe's truth or says it cannot reach it.
 */
export async function getSubscriptionForCustomer(
  customerId: string
): Promise<SubscriptionView | null | { error: string }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { error: "not_configured" };
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=5&expand[]=data.default_payment_method`,
      { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) }
    );
    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        status: string;
        trial_end: number | null;
        cancel_at_period_end: boolean;
        current_period_end: number | null;
        quantity?: number;
        items?: { data?: Array<{ quantity?: number }> };
        default_payment_method?: { card?: { brand?: string; last4?: string } } | string | null;
      }>;
      error?: { message?: string };
    };
    if (!res.ok) return { error: json.error?.message || `stripe error ${res.status}` };
    const subs = json.data ?? [];
    // Prefer the live subscription; fall back to the most recent ended one
    // so a canceled customer sees "canceled on ..." rather than nothing.
    const sub =
      subs.find((s) => ["trialing", "active", "past_due", "unpaid"].includes(s.status)) ?? subs[0];
    if (!sub) return null;
    const pm = typeof sub.default_payment_method === "object" ? sub.default_payment_method?.card : undefined;
    return {
      status: sub.status,
      trialEnd: sub.trial_end ?? null,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      currentPeriodEnd: sub.current_period_end ?? null,
      subscriptionId: sub.id,
      quantity: sub.items?.data?.[0]?.quantity ?? sub.quantity ?? 1,
      paymentMethod: pm?.last4 ? { brand: pm.brand || "card", last4: pm.last4 } : null,
    };
  } catch {
    return { error: "stripe unreachable" };
  }
}

/**
 * Flips cancel-at-period-end. Cancellation is scheduled, never immediate:
 * the customer paid for (or is trialing) the current period, so service
 * runs to the end of it and simply does not renew — during a trial that
 * means they are never charged at all. Resume is the same flag back off,
 * possible right up to the period's last second.
 */
export async function setCancelAtPeriodEnd(
  subscriptionId: string,
  cancel: boolean
): Promise<{ ok: true } | { error: string }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { error: "not_configured" };
  try {
    const res = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: `cancel_at_period_end=${cancel}`,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: { message?: string } };
      return { error: json.error?.message || `stripe error ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { error: "stripe unreachable" };
  }
}

/**
 * A Stripe Billing Portal session: card changes, invoices, tax details,
 * all on Stripe's hosted page. Payment details never touch our servers —
 * the portal is not a convenience choice, it is what keeps this codebase
 * out of the business of handling card data.
 */
export async function createPortalSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string } | { error: string }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { error: "not_configured" };
  try {
    const params = new URLSearchParams();
    params.set("customer", input.customerId);
    params.set("return_url", input.returnUrl);
    const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json()) as { url?: string; error?: { message?: string } };
    if (!res.ok || !json.url) return { error: json.error?.message || `stripe error ${res.status}` };
    return { url: json.url };
  } catch {
    return { error: "stripe unreachable" };
  }
}
