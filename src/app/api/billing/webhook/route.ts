import { NextResponse } from "next/server";
import { verifyStripeSignature } from "@/lib/stripe";
import { setTenantPlanByEmail, setTenantPlanByCustomer, getTenantEmailByCustomer } from "@/lib/engine/store";
import { notifyPaymentFailed } from "@/lib/engine/notify";

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
    object: {
      customer?: string;
      customer_email?: string | null;
      customer_details?: { email?: string | null } | null;
      metadata?: Record<string, string> | null;
      status?: string;
      hosted_invoice_url?: string | null;
    };
  };
};

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
        if (typeof obj.customer === "string" && obj.status) {
          const status =
            obj.status === "active" || obj.status === "trialing"
              ? "active"
              : obj.status === "past_due" || obj.status === "unpaid"
                ? "past_due"
                : obj.status === "canceled"
                  ? "canceled"
                  : null;
          if (status) await setTenantPlanByCustomer(obj.customer, status);
        }
        break;
      }
      case "customer.subscription.deleted": {
        if (typeof obj.customer === "string") {
          await setTenantPlanByCustomer(obj.customer, "canceled");
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
