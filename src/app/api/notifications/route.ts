import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { storeConfigured, getTenantNotifyPrefs, setTenantNotifyPrefs } from "@/lib/engine/store";
import { customerMailReady } from "@/lib/mailer";

/**
 * The owner's notification preference, plus whether this deployment can
 * actually email them.
 *
 * Reporting deliverability alongside the toggle is the point: a switch set
 * to "on" while no transport can reach a customer inbox is a promise the
 * product cannot keep, and the owner should see that rather than wonder
 * why nothing arrives.
 */
export async function GET(req: NextRequest) {
  const auth = requireSession(req);
  if (auth.response) return auth.response;
  const prefs = storeConfigured() ? await getTenantNotifyPrefs(auth.user.email) : null;
  const ready = customerMailReady();
  return NextResponse.json({
    ok: true,
    notifyPublishes: prefs?.notifyPublishes ?? true,
    deliverable: ready.ready,
    reason: ready.reason,
  });
}

export async function POST(req: NextRequest) {
  if (!storeConfigured()) {
    return NextResponse.json({ ok: false, error: "engine not connected" }, { status: 503 });
  }
  const auth = requireSession(req);
  if (auth.response) return auth.response;
  let notifyPublishes: boolean;
  try {
    notifyPublishes = Boolean(((await req.json()) as { notifyPublishes?: boolean }).notifyPublishes);
  } catch {
    return NextResponse.json({ ok: false, error: "notifyPublishes required" }, { status: 400 });
  }
  await setTenantNotifyPrefs(auth.user.email, notifyPublishes);
  return NextResponse.json({ ok: true, notifyPublishes });
}
