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
