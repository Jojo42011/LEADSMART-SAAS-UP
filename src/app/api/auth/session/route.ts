import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/session";

/**
 * Who is signed in, verified from the httpOnly session cookie. Any client
 * (auth screen, dashboard, nav) can call this to check auth state without
 * ever touching the raw session token.
 */
export async function GET(req: NextRequest) {
  const user = readSession(req);
  if (!user) return NextResponse.json({ authed: false });
  return NextResponse.json({
    authed: true,
    user: { email: user.email, name: user.name, picture: user.picture, provider: user.provider },
  });
}
