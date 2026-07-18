import { NextResponse } from "next/server";
import { storeConfigured, getDueSites, recoverStuckRuns } from "@/lib/engine/store";
import { runSiteCycle, type CycleResult } from "@/lib/engine/orchestrator";

/**
 * The daily heartbeat, fired by the Vercel cron in vercel.json.
 * With DATABASE_URL set this is the real autonomous loop: recover stuck
 * cycles, pick the sites whose cadence is due, and run one full cycle
 * per site (research, plan, generate, audit, publish). Without a
 * database it reports pipeline readiness so the wiring stays provable.
 */

export const maxDuration = 300;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!storeConfigured()) {
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      readiness: {
        tenantStore: false,
        research: Boolean(process.env.GEMINI_API_KEY),
        githubOauth: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      },
      note: "Set DATABASE_URL and apply db/schema.sql to activate per site autonomous cycles. Pipeline endpoints are live and callable now.",
    });
  }

  const recovered = await recoverStuckRuns();
  const due = await getDueSites(2); // bounded per invocation to fit the function window
  const results: CycleResult[] = [];
  for (const site of due) {
    results.push(await runSiteCycle(site));
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    recoveredStuckRuns: recovered,
    sitesDue: due.length,
    results,
  });
}
