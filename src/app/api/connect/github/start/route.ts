import { NextRequest, NextResponse } from "next/server";

/**
 * GitHub OAuth, step 1. Redirects the user to GitHub's consent screen.
 * Requires a GitHub OAuth App: set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET
 * in the environment, with the app's callback URL pointing at
 * /api/connect/github/callback. When unconfigured we return JSON so the
 * client can fall back to manual token entry.
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ configured: false }, { status: 503 });
  }

  const state = crypto.randomUUID();
  const origin = req.nextUrl.origin;
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${origin}/api/connect/github/callback`);
  url.searchParams.set("scope", "repo");
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  res.cookies.set("gh_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
