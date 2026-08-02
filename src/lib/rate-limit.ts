import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit } from "./engine/store";

/**
 * Rate limiting for endpoints anyone on the internet can call.
 *
 * The counters live in Postgres rather than in module memory. An
 * in-memory limiter is the usual first instinct and it is worthless here:
 * every serverless instance would keep its own counter, so the real limit
 * becomes "N per window per instance" and an attacker gets more headroom
 * the harder they push, because load spawns instances. A shared store is
 * the only kind that actually limits anything on this architecture.
 *
 * It fails OPEN. If the database is unreachable the request proceeds
 * rather than 429s: these endpoints include the support form, and locking
 * people out of the way to report an outage during an outage is worse
 * than the abuse this defends against.
 */

export type RateLimitRule = {
  /** Distinguishes counters, so one endpoint's traffic cannot exhaust another's. */
  bucket: string;
  limit: number;
  windowSeconds: number;
};

/**
 * Best available client identity.
 *
 * x-forwarded-for is trivially spoofed in general, but on Vercel the
 * platform sets it and the leftmost entry is the real client, so it is
 * sound here. Falls back to a constant, which turns the limit into a
 * global one for that endpoint — deliberately still a limit rather than
 * an exemption, since a request we cannot attribute is exactly the kind
 * worth capping.
 */
export function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim().slice(0, 64);
  return req.headers.get("x-real-ip")?.slice(0, 64) || "unattributed";
}

export async function enforceRateLimit(
  req: NextRequest,
  rule: RateLimitRule
): Promise<NextResponse | null> {
  const key = clientKey(req);
  const verdict = await consumeRateLimit(`${rule.bucket}:${key}`, rule.limit, rule.windowSeconds);
  if (verdict.allowed) return null;
  void verdict.degraded; // a degraded verdict is always `allowed`, handled above

  return NextResponse.json(
    {
      ok: false,
      error: `Too many requests. Try again in ${verdict.retryAfterSeconds}s.`,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(verdict.retryAfterSeconds),
        "X-RateLimit-Limit": String(rule.limit),
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}
