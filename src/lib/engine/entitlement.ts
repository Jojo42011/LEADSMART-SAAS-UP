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

/**
 * How many pages the agent publishes before asking for a card.
 *
 * The free preview exists so someone can watch the thing actually work on
 * their own website before paying for it. It is deliberately counted in
 * published pages rather than in days: a trial measured in time can be
 * spent entirely on a slow week, whereas three real pages on your own
 * domain is the same evidence for everybody.
 *
 * It is also the abuse limit. The allowance is charged against the
 * WEBSITE, not the email address (see freePagesUsedFor), so signing up
 * again with a different email and the same site yields no further free
 * pages — the domain is the thing that cannot be re-minted for free.
 */
export const FREE_PAGE_LIMIT = Number(process.env.FREE_PAGE_LIMIT) || 3;

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
  state: "trialing" | "active" | "grace" | "suspended" | "none" | "free" | "free_limit";
  /** One sentence an owner can act on. */
  reason: string;
  /** When a grace period runs out, if one is running. */
  graceEndsAt: Date | null;
  /**
   * Free-preview progress, present only in the two free states. The
   * dashboard shows this as "2 of 3 free pages used"; nothing else should
   * infer the count from the reason string.
   */
  free?: { used: number; limit: number };
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

/**
 * @param freePagesUsed Published pages already charged against this site's
 * free allowance. Pass a number to evaluate the free preview; omit it and
 * a tenant with no subscription is simply denied. The omission default is
 * deliberately the closed one — a caller that has not been taught about
 * the free tier turns work away rather than handing it out unmetered.
 * entitlementForEmail always supplies it, so in practice it is always set.
 */
export function entitlementFor(
  planStatus: string | null | undefined,
  statusSince: Date | string | null | undefined,
  now: Date = new Date(),
  freePagesUsed?: number | null
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
    // The free preview. Someone who has never paid still gets the agent
    // researching, writing and publishing to their real site — capped at
    // FREE_PAGE_LIMIT pages — because "see it working first" is the whole
    // proposition, and a dashboard full of locked panels demonstrates
    // nothing. Past the cap the agent stops and the upgrade prompt is the
    // only way forward.
    if (typeof freePagesUsed === "number") {
      const used = Math.max(0, Math.floor(freePagesUsed));
      const free = { used, limit: FREE_PAGE_LIMIT };
      const left = FREE_PAGE_LIMIT - used;
      if (left > 0) {
        return {
          allowed: true,
          state: "free",
          reason: `Free preview — ${left} of ${FREE_PAGE_LIMIT} page${FREE_PAGE_LIMIT === 1 ? "" : "s"} left before you pick a plan.`,
          graceEndsAt: null,
          free,
        };
      }
      return {
        allowed: false,
        state: "free_limit",
        reason: `You've used all ${FREE_PAGE_LIMIT} free pages. Start a plan to keep the agent writing — the pages already published stay on your site.`,
        graceEndsAt: null,
        free,
      };
    }
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
/**
 * The free preview's rule, in SQL, for the scheduler.
 *
 * Kept beside entitledSqlFragment for the same reason that one exists: the
 * cron decides in SQL and every button decides in TypeScript, and when the
 * two drift the product either keeps working for people it should have
 * stopped serving or stops for people it should be serving — silently,
 * either way. The live test runs both against the same rows.
 *
 * Counted by host rather than by tenant so a second signup on the same
 * website inherits the pages the first one already spent, which is what
 * makes the limit hold against a fresh email address. A site whose host
 * could not be resolved gets no free pages: an unidentifiable site must
 * not match every other unidentifiable site.
 */
export function freeTierSqlFragment(siteAlias = "s", tenantAlias = "t"): string {
  const limit = Math.max(0, Math.round(FREE_PAGE_LIMIT));
  return `(
    ${tenantAlias}.plan_status = 'inactive'
    and coalesce(${siteAlias}.host, '') <> ''
    and (
      select count(*) from pages fp
      join sites fs on fs.id = fp.site_id
      where fp.status = 'published' and fs.host = ${siteAlias}.host
    ) < ${limit}
  )`;
}

export function entitledSqlFragment(alias = "t"): string {
  return `(
    ${alias}.plan_status in ('active', 'trialing')
    or (
      ${alias}.plan_status = 'past_due'
      and coalesce(${alias}.plan_status_since, now()) > now() - make_interval(days => ${Math.max(0, Math.round(PLAN_GRACE_DAYS))})
    )
  )`;
}
