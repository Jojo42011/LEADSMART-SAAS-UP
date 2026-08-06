import { NextResponse } from "next/server";
import { entitlementForEmail } from "./engine/store";

/**
 * Blocks work the tenant is not entitled to.
 *
 * Every action that spends money on a customer's behalf — a generation, a
 * publish, a refresh — goes through here. The scheduler has always gated
 * on plan status, but the on-demand buttons did not, so a cancelled
 * customer could press Generate and get a page written, audited and
 * published at our expense. A gate that only covers the automatic path is
 * not a gate.
 *
 * 402 rather than 403: this is "payment required", which is precisely the
 * situation, and it lets the dashboard tell a billing problem apart from a
 * permissions one without parsing prose.
 */
export async function requireEntitlement(email: string): Promise<NextResponse | null> {
  const entitlement = await entitlementForEmail(email);
  // No store means no billing to enforce — a local or demo deployment
  // stays fully usable rather than locking itself out.
  if (!entitlement || entitlement.allowed) return null;

  return NextResponse.json(
    {
      ok: false,
      error: entitlement.reason,
      // free carries the page counts when this is the free preview's limit
      // rather than a billing failure. The two need different prompts —
      // "start a plan" against "fix your card" — and the client should not
      // have to infer which one it is by reading the prose.
      entitlement: { state: entitlement.state, allowed: false, free: entitlement.free },
    },
    { status: 402 }
  );
}
