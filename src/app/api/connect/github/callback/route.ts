import { NextRequest, NextResponse } from "next/server";

/**
 * GitHub OAuth, step 2. Exchanges the code for an access token and stores it
 * in an httpOnly cookie so the browser never sees it. Publishing and repo
 * listing read the cookie server side.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const savedState = req.cookies.get("gh_oauth_state")?.value;
  const origin = req.nextUrl.origin;

  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/onboarding?github=error&reason=${encodeURIComponent(reason)}`);

  if (!code || !state || state !== savedState) return fail("state_mismatch");

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("not_configured");

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${origin}/api/connect/github/callback`,
      }),
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) return fail("no_token");

    const res = NextResponse.redirect(`${origin}/onboarding?github=connected`);
    res.cookies.set("gh_token", tokenJson.access_token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    res.cookies.delete("gh_oauth_state");
    return res;
  } catch {
    return fail("exchange_failed");
  }
}
