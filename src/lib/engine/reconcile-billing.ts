import { listBillableTenants, setTenantPlanByCustomer, setSiteAllowanceByCustomer } from "./store";
import { getSubscriptionForCustomer, stripeConfigured } from "../stripe";
import { planStatusFromStripe, entitlementFor } from "./entitlement";
import { notifyAgentSuspended, notifyAgentResumed, notifyTrialEnding } from "./notify";

/**
 * Brings stored plan status back in line with Stripe.
 *
 * Webhooks are the fast path, not a guarantee. They are missed when the
 * endpoint is misconfigured, when a deploy is mid-flight, when Stripe
 * gives up after its retries, or when a signature check fails for a
 * reason nobody noticed. Every one of those failures is silent, and
 * silence resolves in exactly two directions: a cancelled customer keeps
 * getting the agent for free, or a paying customer sits suspended
 * wondering why nothing publishes. Neither is acceptable to discover from
 * a support email.
 *
 * So this runs on the heartbeat and treats Stripe as the authority.
 * Bounded per run — reconciliation is a correction, not a sync job, and
 * it must not eat the cycle budget the agent needs to do actual work.
 */

const RECONCILE_PER_RUN = Number(process.env.BILLING_RECONCILE_PER_RUN) || 20;

/** Days before a trial ends that the heads-up goes out. */
const TRIAL_WARNING_DAYS = 3;

export type ReconcileSummary = {
  checked: number;
  corrected: { email: string; from: string; to: string }[];
  trialWarnings: number;
  errors: number;
};

export async function reconcileBilling(limit = RECONCILE_PER_RUN): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { checked: 0, corrected: [], trialWarnings: 0, errors: 0 };
  if (!stripeConfigured()) return summary;

  // Ordered by least-recently-changed, so every tenant is reached in
  // rotation rather than the same few being checked forever.
  const tenants = await listBillableTenants(limit);

  for (const tenant of tenants) {
    summary.checked += 1;
    try {
      const sub = await getSubscriptionForCustomer(tenant.stripeCustomerId);
      if (!sub) {
        // A customer with no subscription at all in Stripe. Treat as
        // cancelled rather than leaving whatever we last stored.
        if (tenant.planStatus !== "canceled" && tenant.planStatus !== "inactive") {
          const res = await setTenantPlanByCustomer(tenant.stripeCustomerId, "canceled");
          summary.corrected.push({ email: tenant.email, from: tenant.planStatus, to: "canceled" });
          if (res.email && res.changed) {
            notifyAgentSuspended(res.email, "Your subscription has ended.");
          }
        }
        continue;
      }
      if ("error" in sub) {
        summary.errors += 1;
        continue;
      }

      // Seats follow the subscription's real quantity, so a plan changed
      // in the Stripe dashboard rather than through our UI still lands.
      await setSiteAllowanceByCustomer(tenant.stripeCustomerId, sub.quantity || 1);

      const actual = planStatusFromStripe(sub.status);
      if (actual !== tenant.planStatus) {
        const wasEntitled = entitlementFor(tenant.planStatus, null).allowed;
        const res = await setTenantPlanByCustomer(tenant.stripeCustomerId, actual);
        summary.corrected.push({ email: tenant.email, from: tenant.planStatus, to: actual });
        const isEntitled = entitlementFor(actual, new Date()).allowed;
        if (res.email && res.changed) {
          if (wasEntitled && !isEntitled) notifyAgentSuspended(res.email, entitlementFor(actual, new Date()).reason);
          else if (!wasEntitled && isEntitled) notifyAgentResumed(res.email);
        }
      }

      // Trial ending soon. Sent from here rather than from a webhook
      // because Stripe's trial_will_end fires once and a missed delivery
      // cannot be recovered; recomputing it from the trial date each day
      // is idempotent, and the notification store keeps it to one send.
      if (sub.status === "trialing" && sub.trialEnd) {
        const daysLeft = Math.ceil((sub.trialEnd * 1000 - Date.now()) / 86_400_000);
        if (daysLeft > 0 && daysLeft <= TRIAL_WARNING_DAYS) {
          notifyTrialEnding(tenant.email, daysLeft, `$${49 * (sub.quantity || 1)}`);
          summary.trialWarnings += 1;
        }
      }
    } catch {
      summary.errors += 1;
    }
  }

  return summary;
}
