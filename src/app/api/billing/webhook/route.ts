import { NextResponse } from "next/server";
import { verifyStripeSignature } from "@/lib/stripe";
import { setTenantPlanByEmail, setTenantPlanByCustomer, getTenantEmailByCustomer } from "@/lib/engine/store";
import { notifyPaymentFailed, notifyAgentSuspended, notifyAgentResumed } from "@/lib/engine/notify";
import { planStatusFromStripe, entitlementFor } from "@/lib/engine/entitlement";

/**
 * Stripe webhook: the source of truth for who is paying. Point a Stripe
 * webhook endpoint at /api/billing/webhook with these events enabled:
 *   checkout.session.completed        -> plan_status active
 *   customer.subscription.updated     -> active / past_due
 *   customer.subscription.deleted     -> canceled
 * The cron only runs sites whose tenant plan_status is 'active', so this
 * is what actually turns the autonomous agent on and off per customer.
 */

type StripeEvent = {
  type: string;
  data: {
    previous_attributes?: { status?: string } | null;
    object: {
      customer?: string;
      customer_email?: string | null;
      customer_details?: { email?: string | null } | null;
      metadata?: Record<string, string> | null;
      status?: string;
      hosted_invoice_url?: string | null;
      /** Stripe reports what changed; used to tell a transition from a repeat. */
      previous_attributes?: { status?: string } | null;
    };
  };
};

/**
 * The status this subscription held before the event, when Stripe says so.
 * Falls back to "active" — the assumption that errs toward notifying on a
 * genuine suspension rather than staying silent through one.
 */
function previousStatusOf(previous: { status?: string } | null): string {
  return previous?.status ?? "active";
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!verifyStripeSignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "bad payload" }, { status: 400 });
  }

  const obj = event.data?.object ?? {};
  const previousAttributes = event.data?.previous_attributes ?? null;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const email = obj.customer_details?.email || obj.customer_email || obj.metadata?.email;
        if (email) {
          await setTenantPlanByEmail(email, "active", typeof obj.customer === "string" ? obj.customer : undefined);
        }
        break;
      }
      case "customer.subscription.updated": {
        // Every Stripe status is mapped, including the ones the first
        // version dropped. `incomplete` in particular is what a trial
        // becomes when it ends without a usable card: it fell through the
        // old mapping, nothing was written, and the tenant stayed
        // "active" — the agent working indefinitely for free on a
        // subscription that never started paying.
        if (typeof obj.customer === "string" && obj.status) {
          const status = planStatusFromStripe(obj.status);
          const before = entitlementFor(previousStatusOf(previousAttributes), null);
          const result = await setTenantPlanByCustomer(obj.customer, status);
          if (result.email && result.changed) {
            const now = entitlementFor(status, new Date());
            // Notify on the transition that changes whether the agent
            // works, not on every status write — Stripe emits an event per
            // dunning retry and mailing each one trains people to ignore
            // all of them.
            if (!now.allowed && before.allowed !== false) {
              notifyAgentSuspended(result.email, now.reason);
            } else if (now.allowed && now.state !== "grace" && before.allowed === false) {
              notifyAgentResumed(result.email);
            }
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        if (typeof obj.customer === "string") {
          const result = await setTenantPlanByCustomer(obj.customer, "canceled");
          if (result.email && result.changed) {
            notifyAgentSuspended(
              result.email,
              "Your subscription has ended. Published pages stay on your site; the agent has stopped."
            );
          }
        }
        break;
      }
      case "invoice.payment_failed": {
        // Stripe dunning runs its own retries; this exists so the customer
        // hears it from us too, with the true consequence spelled out —
        // service continues during retries, and nothing already published
        // is ever deleted over a billing problem.
        if (typeof obj.customer === "string") {
          const email = await getTenantEmailByCustomer(obj.customer);
          if (email) {
            notifyPaymentFailed(
              email,
              obj.hosted_invoice_url || "https://leadsmart-saas-up.vercel.app/dashboard"
            );
          }
        }
        break;
      }
      default:
        break; // acknowledged, unhandled
    }
  } catch (e) {
    // Return 500 so Stripe retries; activation must not be silently lost.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
