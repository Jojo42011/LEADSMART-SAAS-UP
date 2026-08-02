import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { SESSION_COOKIE, PROFILE_COOKIE } from "@/lib/session";
import { storeConfigured, deleteAccount, getTenantBillingByEmail } from "@/lib/engine/store";
import { getSubscriptionForCustomer, cancelSubscriptionNow } from "@/lib/stripe";

/**
 * Delete the signed-in account and everything belonging to it.
 *
 * The privacy policy promises deletion and the terms say it happens from
 * the dashboard, so this is a legal commitment rather than a convenience.
 * It is also irreversible, which shapes the whole route:
 *
 * - The caller must type their own email address to confirm. A single
 *   click cannot destroy an account, and a confirmation that only asks
 *   "are you sure?" is one mis-click away from the same outcome.
 * - The subscription is cancelled at Stripe BEFORE the local rows go. In
 *   the other order, a failure midway leaves a deleted account still
 *   being charged every month with no dashboard left to cancel from —
 *   the worst reachable state, so it is the one made unreachable.
 * - A Stripe failure aborts the deletion and says so. Deleting the
 *   records while the card keeps being charged is not a partial success.
 *
 * Pages already published to the customer's own website are untouched.
 * They belong to the customer, the policy says so, and a deletion request
 * is about our records — not about tearing down a site we were paid to
 * build.
 */
export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  if (!storeConfigured()) {
    return NextResponse.json(
      { ok: false, error: "No database is connected, so there is no stored account to delete." },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { confirmEmail?: string };
  const typed = (body.confirmEmail || "").trim().toLowerCase();
  const actual = auth.user.email.trim().toLowerCase();
  if (!typed || typed !== actual) {
    return NextResponse.json(
      { ok: false, error: "Type your account email exactly to confirm deletion." },
      { status: 400 }
    );
  }

  // Stop the billing relationship first — see the note above on ordering.
  try {
    const tenant = await getTenantBillingByEmail(actual);
    if (tenant?.stripeCustomerId) {
      const sub = await getSubscriptionForCustomer(tenant.stripeCustomerId);
      // A read failure is not proof there is no subscription, so it is
      // treated as one: better to refuse the deletion than to delete the
      // only screen the customer could have cancelled from.
      if (sub && "error" in sub && sub.error !== "not_configured") {
        return NextResponse.json(
          {
            ok: false,
            error: `Could not check your subscription (${sub.error}), so nothing was deleted. Please try again.`,
          },
          { status: 502 }
        );
      }
      if (sub && "id" in sub && typeof sub.id === "string") {
        const cancelled = await cancelSubscriptionNow(sub.id);
        // "not_configured" means this deployment has no Stripe keys, so
        // there is no live subscription to leave running. Any other error
        // is a real one and must stop the deletion.
        if ("error" in cancelled && cancelled.error !== "not_configured") {
          return NextResponse.json(
            {
              ok: false,
              error: `Your subscription could not be cancelled (${cancelled.error}), so nothing was deleted. Cancel from the Plan panel first, or contact support.`,
            },
            { status: 502 }
          );
        }
      }
    }
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Could not reach billing to cancel your subscription, so nothing was deleted. Please try again.",
      },
      { status: 502 }
    );
  }

  const removed = await deleteAccount(actual);
  if (removed.tenants === 0) {
    return NextResponse.json(
      { ok: false, error: "No account was found to delete." },
      { status: 404 }
    );
  }

  // The session must die with the account: leaving the cookie set means
  // the next request authenticates as a tenant that no longer exists.
  const res = NextResponse.json({ ok: true, removed });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(PROFILE_COOKIE);
  return res;
}
