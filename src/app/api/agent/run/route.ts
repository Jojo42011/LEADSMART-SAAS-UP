import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { storeConfigured, listSitesForEmail } from "@/lib/engine/store";
import { runSiteCycle } from "@/lib/engine/orchestrator";

// A full cycle researches, writes with the LLM, audits, and publishes —
// the same budget the cron route gets.
export const maxDuration = 300;

/**
 * Generate-on-demand: runs one cycle for the signed-in owner's site,
 * right now, ignoring cadence.
 *
 * The cron endpoint could already do this, but it authenticates with
 * CRON_SECRET — a server credential the owner shouldn't need to hold just
 * to ask their own agent to write the next page. This authenticates with
 * the session and only ever operates on sites the signed-in tenant owns,
 * so it grants nothing beyond what the owner's dashboard already shows.
 *
 * Cadence is deliberately not checked: pressing the button IS the
 * schedule. Overlap is still safe — runSiteCycle claims the run row, so a
 * cycle already in flight makes this return "cycle already running"
 * instead of double-writing.
 */
export async function POST(req: NextRequest) {
  if (!storeConfigured()) {
    return NextResponse.json(
      { ok: false, error: "The engine is not connected (no DATABASE_URL)." },
      { status: 503 }
    );
  }

  const auth = requireSession(req);
  if (auth.response) return auth.response;

  // Optional: generate a specific keyword (a planned-queue card's button)
  // instead of the queue's next pick.
  let keywordTerm: string | undefined;
  try {
    const body = (await req.json()) as { keyword?: string };
    if (typeof body.keyword === "string" && body.keyword.trim()) {
      keywordTerm = body.keyword.trim().slice(0, 200);
    }
  } catch {
    // no body: queue order
  }

  const sites = await listSitesForEmail(auth.user.email);
  if (sites.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No site is registered for this account yet — complete onboarding first." },
      { status: 404 }
    );
  }

  // One site per press. Multi-site accounts run their oldest-idle site
  // first, matching the cron's ordering.
  const site = [...sites].sort((a, b) =>
    (a.last_run_at ?? "") < (b.last_run_at ?? "") ? -1 : 1
  )[0];

  try {
    const result = await runSiteCycle(site, keywordTerm ? { keywordTerm } : undefined);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "cycle failed" },
      { status: 500 }
    );
  }
}
