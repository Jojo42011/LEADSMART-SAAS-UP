import { NextRequest, NextResponse } from "next/server";

/**
 * GitHub OAuth, step 1. Redirects the user to GitHub's consent screen.
 * Requires a GitHub OAuth App: set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET
 * in the environment, with the app's callback URL pointing at
 * /api/connect/github/callback.
 *
 * One flow, two jobs. `flow` selects the intent:
 *  - connect (default): the onboarding "connect GitHub for publishing" step.
 *    When unconfigured we return JSON so the wizard can fall back to manual
 *    token entry — unchanged behavior.
 *  - signin | signup: "Sign in with GitHub" from the auth screen. When
 *    unconfigured we bounce back to that screen with a friendly error.
 *
 * The user:email scope lets the callback identify the account so a GitHub
 * connection also establishes a login session.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const flowParam = req.nextUrl.searchParams.get("flow");
  const flow = flowParam === "signin" || flowParam === "signup" ? flowParam : "connect";

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    if (flow === "connect") return NextResponse.json({ configured: false }, { status: 503 });
    return NextResponse.redirect(`${origin}/${flow}?error=github_unconfigured`);
  }

  const state = crypto.randomUUID();
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${origin}/api/connect/github/callback`);
  url.searchParams.set("scope", "repo read:user user:email");
  url.searchParams.set("state", state);

  const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
  const res = NextResponse.redirect(url);
  res.cookies.set("gh_oauth_state", state, opts);
  res.cookies.set("gh_oauth_flow", flow, opts);
  return res;
}
