import { createHash, timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { readSession, type SessionUser } from "./session";

/**
 * Guard for API routes that spend money (Gemini generation and research)
 * or write to a customer's website.
 *
 * These routes were previously callable by anyone who knew the URL, which
 * left the project's own API key and its customers' publishing credentials
 * reachable from the open internet. The cron pipeline is unaffected: the
 * orchestrator imports the engine functions directly from src/lib/engine,
 * it does not call these HTTP wrappers.
 */
export function requireSession(
  req: NextRequest
): { user: SessionUser; response?: undefined } | { user?: undefined; response: NextResponse } {
  const user = readSession(req);
  if (!user) {
    return {
      response: NextResponse.json(
        { ok: false, error: "authentication required" },
        { status: 401 }
      ),
    };
  }
  return { user };
}

/**
 * Compares two secrets without leaking the answer through timing.
 *
 * `a !== b` on strings returns as soon as it finds a differing byte, so
 * how long it takes correlates with how much of the prefix was right.
 * Over the open internet that signal is buried in network jitter, which
 * is why this was low severity rather than urgent — but the correct
 * comparison is three lines, and "an attacker probably cannot measure it"
 * is a weaker guarantee than "there is nothing to measure".
 *
 * Both sides are hashed first rather than compared directly:
 * timingSafeEqual throws when the buffers differ in length, and catching
 * that would itself leak the length. Digests are always 32 bytes.
 */
export function secretsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
