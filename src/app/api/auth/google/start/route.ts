import { NextRequest, NextResponse } from "next/server";

/**
 * Google sign-in, step 1. Redirects the user to Google's consent screen.
 *
 * Requires a Google OAuth 2.0 Client (Web application): set GOOGLE_CLIENT_ID
 * and GOOGLE_CLIENT_SECRET, and register this app's callback URL,
 * <origin>/api/auth/google/callback, as an Authorized redirect URI in the
 * Google Cloud console. When unconfigured we bounce back to the auth screen
 * with a friendly error rather than dead-ending on raw JSON.
 *
 * `flow` (signin | signup) is remembered in a short-lived cookie so the
 * callback can route new accounts through checkout and returning users
 * straight to the dashboard.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const flow = req.nextUrl.searchParams.get("flow") === "signup" ? "signup" : "signin";
  const back = flow === "signup" ? "signup" : "signin";

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${origin}/${back}?error=google_unconfigured`);
  }

  const state = crypto.randomUUID();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(url);
  const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("g_oauth_state", state, opts);
  res.cookies.set("g_oauth_flow", flow, opts);
  return res;
}
