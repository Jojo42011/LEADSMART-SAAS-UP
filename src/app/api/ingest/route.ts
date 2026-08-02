import { NextRequest, NextResponse } from "next/server";
import { BlockedUrlError } from "@/lib/safe-fetch";
import { ingestSite } from "@/lib/site-ingest";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Studies a website the way the agent does before its first cycle. The
 * wizard uses this to auto select WordPress and to show the owner that
 * the agent has actually read their site. The extraction itself lives in
 * lib/site-ingest so the engine can reuse it when a stored brand snapshot
 * is missing.
 */
export async function POST(req: NextRequest) {
  // Fetches an arbitrary URL on the caller's behalf, so an unbounded
  // version is a request-forwarding service we pay to run.
  const limited = await enforceRateLimit(req, { bucket: "ingest", limit: 10, windowSeconds: 600 });
  if (limited) return limited;

  let url = "";
  try {
    const body = (await req.json()) as { url?: string };
    url = (body.url || "").trim();
  } catch {
    // fall through to validation
  }
  if (!url) return NextResponse.json({ ok: false, error: "url required" }, { status: 400 });

  try {
    const result = await ingestSite(url);
    if (!result.ok) {
      return NextResponse.json({ ...result, error: "fetch failed" }, { status: 200 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof BlockedUrlError ? e.message : "invalid url" },
      { status: 400 }
    );
  }
}
