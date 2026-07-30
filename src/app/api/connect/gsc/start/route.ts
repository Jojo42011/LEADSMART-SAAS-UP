import { NextRequest, NextResponse } from "next/server";

/**
 * Search Console connect, step 1. Same Google OAuth client as sign-in,
 * different grant: the webmasters.readonly scope plus offline access, so
 * the analytics route can mint fresh access tokens from a stored refresh
 * token long after this browser session ends.
 *
 * IMPORTANT setup detail: the Google Cloud OAuth client must list
 * <origin>/api/connect/gsc/callback as an Authorized redirect URI, and the
 * "Google Search Console API" must be enabled on the same project.
 *
 * `flow` (dashboard | onboarding) is remembered in a short-lived cookie so
 * the callback returns the user to where they started.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const flow = req.nextUrl.searchParams.get("flow") === "onboarding" ? "onboarding" : "dashboard";
  const back = flow === "onboarding" ? "/onboarding" : "/dashboard";

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${origin}${back}?gsc=error&reason=google_unconfigured`);
  }

  const state = crypto.randomUUID();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${origin}/api/connect/gsc/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/webmasters.readonly");
  url.searchParams.set("state", state);
  // offline + consent is what makes Google return a refresh token.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  const res = NextResponse.redirect(url);
  const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("gsc_oauth_state", state, opts);
  res.cookies.set("gsc_oauth_flow", flow, opts);
  return res;
}
