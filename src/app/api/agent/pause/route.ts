import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { storeConfigured, setAgentActive, listSitesForEmail } from "@/lib/engine/store";

/**
 * Pauses or resumes autonomous page production for the signed-in owner.
 *
 * This flips sites.active, which getDueSites already filters on, so a
 * paused agent is invisible to the cron by the same rule that has always
 * governed scheduling — there is no second source of truth to drift.
 *
 * A cycle already in flight is deliberately left alone: it holds a claimed
 * run row, and killing it mid-publish could leave a committed page with no
 * database record. Pausing stops the next cycle, not the current one.
 */
export async function POST(req: NextRequest) {
  if (!storeConfigured()) {
    return NextResponse.json({ ok: false, error: "engine not connected" }, { status: 503 });
  }
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  let paused: boolean;
  try {
    const body = (await req.json()) as { paused?: boolean };
    if (typeof body.paused !== "boolean") {
      return NextResponse.json({ ok: false, error: "paused must be true or false" }, { status: 400 });
    }
    paused = body.paused;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const changed = await setAgentActive(auth.user.email, !paused);
  if (changed === 0) {
    const sites = await listSitesForEmail(auth.user.email);
    if (sites.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No site registered for this account yet." },
        { status: 404 }
      );
    }
  }
  return NextResponse.json({ ok: true, paused, sites: changed });
}
