import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, PROFILE_COOKIE } from "@/lib/session";

/**
 * Clears the session. A GET returns the user to the home page (so a plain
 * link works); a POST answers JSON for fetch-driven sign out.
 */
function clear(res: NextResponse): NextResponse {
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(PROFILE_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  return clear(NextResponse.redirect(`${req.nextUrl.origin}/`));
}

export async function POST() {
  return clear(NextResponse.json({ ok: true }));
}
