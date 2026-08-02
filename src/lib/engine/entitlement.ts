/**
 * Whether a tenant is entitled to have the agent work for them.
 *
 * One definition, used by the scheduler, by every on-demand button, and
 * by the dashboard. Entitlement scattered across call sites is how a
 * cancelled customer keeps getting free work from the one endpoint
 * somebody forgot to check — which was exactly the state before this
 * existed: the cron gated on plan_status while Generate, Publish and
 * Refresh did not.
 *
 * The grace period is the substantive decision here. Stripe retries a
 * failed charge over roughly two weeks, and most failures are an expired
 * card rather than an unwilling customer. Cutting production off at the
 * first decline would punish people mid-dunning for something a
 * thirty-second card update fixes, and they would lose days of work they
 * had every intention of paying for. So past_due keeps working for a
 * bounded window, then stops. Cancelled and unpaid stop immediately —
 * those are settled outcomes, not pending ones.
 */

export const PLAN_GRACE_DAYS = Number(process.env.PLAN_GRACE_DAYS) || 7;

/** Statuses we store. Mirrors Stripe's vocabulary plus our own two. */
export type PlanStatus =
  | "inactive"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export type Entitlement = {
  allowed: boolean;
  /** Machine-readable, for the dashboard and for tests. */
  state: "trialing" | "active" | "grace" | "suspended" | "none";
  /** One sentence an owner can act on. */
  reason: string;
  /** When a grace period runs out, if one is running. */
  graceEndsAt: Date | null;
};

/**
 * Maps a Stripe subscription status onto ours.
 *
 * Exhaustive on purpose. The first version handled four statuses and let
 * everything else fall through without writing anything, so a trial that
 * ended without a usable card — Stripe reports `incomplete` — left the
 * tenant sitting at `active` and the agent working indefinitely for free.
 * An unrecognised status now suspends rather than silently permits.
 */
export function planStatusFromStripe(stripeStatus: string): PlanStatus {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "unpaid":
      return "unpaid";
    case "canceled":
      return "canceled";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "incomplete_expired";
    case "paused":
      return "paused";
    default:
      return "incomplete";
  }
}

export function entitlementFor(
  planStatus: string | null | undefined,
  statusSince: Date | string | null | undefined,
  now: Date = new Date()
): Entitlement {
  const status = (planStatus || "inactive") as PlanStatus;

  if (status === "trialing") {
    return {
      allowed: true,
      state: "trialing",
      reason: "Free trial — the agent is running.",
      graceEndsAt: null,
    };
  }

  if (status === "active") {
    return { allowed: true, state: "active", reason: "Subscription active.", graceEndsAt: null };
  }

  if (status === "past_due") {
    // Dated from when the status last CHANGED, not from the last webhook.
    // Stripe sends an event per retry, so restamping on every write would
    // roll the window forward each time and the grace period would never
    // end — service free forever for anyone whose card kept failing.
    const since = statusSince ? new Date(statusSince) : null;
    const graceEndsAt = since
      ? new Date(since.getTime() + PLAN_GRACE_DAYS * 86_400_000)
      : new Date(now.getTime() + PLAN_GRACE_DAYS * 86_400_000);
    if (graceEndsAt > now) {
      const days = Math.max(1, Math.ceil((graceEndsAt.getTime() - now.getTime()) / 86_400_000));
      return {
        allowed: true,
        state: "grace",
        reason: `Payment failed. The agent keeps working for ${days} more day${days === 1 ? "" : "s"} while the card is retried.`,
        graceEndsAt,
      };
    }
    return {
      allowed: false,
      state: "suspended",
      reason: "Payment has not gone through. Update your card to restart the agent.",
      graceEndsAt,
    };
  }

  if (status === "inactive") {
    return {
      allowed: false,
      state: "none",
      reason: "No active subscription. Start a plan to switch the agent on.",
      graceEndsAt: null,
    };
  }

  const settled: Record<string, string> = {
    canceled: "Subscription cancelled. Published pages stay on your site; the agent has stopped.",
    unpaid: "The subscription is unpaid after Stripe stopped retrying. Update your card to restart the agent.",
    incomplete: "The subscription was never confirmed — the first payment did not complete.",
    incomplete_expired: "The subscription expired before its first payment completed.",
    paused: "The subscription is paused.",
  };
  return {
    allowed: false,
    state: "suspended",
    reason: settled[status] ?? "The subscription is not active.",
    graceEndsAt: null,
  };
}

/**
 * The same rule as SQL, for the scheduler's due-sites query.
 *
 * Deliberately a fragment of the one module that defines entitlement
 * rather than a condition written inline in the query: the two would
 * drift, and the direction they drift in is "the cron keeps paying
 * customers waiting" or "the cron serves people who stopped paying".
 * Kept alongside entitlementFor so a change to one is visibly a change
 * to the other.
 */
export function entitledSqlFragment(alias = "t"): string {
  return `(
    ${alias}.plan_status in ('active', 'trialing')
    or (
      ${alias}.plan_status = 'past_due'
      and coalesce(${alias}.plan_status_since, now()) > now() - make_interval(days => ${Math.max(0, Math.round(PLAN_GRACE_DAYS))})
    )
  )`;
}
