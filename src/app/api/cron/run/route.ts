import { NextResponse } from "next/server";

/**
 * Daily agent heartbeat, invoked by the Vercel cron in vercel.json.
 * The full autonomous loop (research, generate, publish per tenant) runs
 * here once tenants live in a database. Until then this endpoint verifies
 * the pipeline pieces are configured and reports readiness, so the cron
 * wiring is proven before the data layer lands.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    readiness: {
      research: Boolean(process.env.GEMINI_API_KEY),
      githubOauth: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      tenantStore: false,
    },
    note: "Per tenant runs activate when the tenant database is connected. Pipeline endpoints (research, generate, publish) are live and callable now.",
  });
}
