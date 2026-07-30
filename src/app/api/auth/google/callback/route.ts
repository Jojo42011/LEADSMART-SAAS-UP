import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  PROFILE_COOKIE,
  encodeProfile,
  signSession,
  sessionCookieOptions,
  profileCookieOptions,
  type SessionUser,
} from "@/lib/session";
import { upsertTenant } from "@/lib/engine/store";

/**
 * Google sign-in, step 2. Exchanges the authorization code for tokens,
 * reads the verified profile from Google's userinfo endpoint, mints an
 * httpOnly session, and routes the user into the product. New accounts
 * (flow=signup) go through checkout, which unlocks onboarding; returning
 * users land on the dashboard.
 */

type GoogleProfile = {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
};

/**
 * Decodes a JWT payload without signature verification. Safe here because
 * the token was just returned directly by Google's token endpoint over TLS
 * in exchange for our client secret — it is only a fallback if the
 * userinfo call fails.
 */
function decodeIdToken(jwt: string): GoogleProfile {
  const part = jwt.split(".")[1];
  if (!part) return {};
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as GoogleProfile;
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const flow = req.cookies.get("g_oauth_flow")?.value === "signup" ? "signup" : "signin";
  const back = flow === "signup" ? "signup" : "signin";

  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/${back}?error=${encodeURIComponent(reason)}`);

  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError) return fail(oauthError);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const savedState = req.cookies.get("g_oauth_state")?.value;
  if (!code || !state || state !== savedState) return fail("state_mismatch");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("google_unconfigured");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${origin}/api/auth/google/callback`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!tokenRes.ok) return fail("token_exchange_failed");
    const token = (await tokenRes.json()) as { access_token?: string; id_token?: string };

    // Prefer the userinfo endpoint (freshest, canonical); fall back to the
    // id_token payload if that call is unavailable.
    let profile: GoogleProfile = {};
    if (token.access_token) {
      const uiRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (uiRes.ok) profile = (await uiRes.json()) as GoogleProfile;
    }
    if (!profile.email && token.id_token) profile = decodeIdToken(token.id_token);
    if (!profile.email) return fail("no_email");

    const user: SessionUser = {
      sub: profile.sub || profile.email,
      email: profile.email,
      name: profile.name || profile.email.split("@")[0],
      picture: profile.picture || "",
      provider: "google",
      iat: Date.now(),
    };

    // Make the account visible in the tenants table immediately. Best
    // effort: a database hiccup must never block sign-in itself.
    try {
      await upsertTenant(user.email, user.name);
    } catch {
      // sign-in proceeds; provisioning upserts the tenant again at launch
    }

    const res = NextResponse.redirect(`${origin}/${flow === "signup" ? "checkout" : "dashboard"}`);
    res.cookies.set(SESSION_COOKIE, signSession(user), sessionCookieOptions);
    res.cookies.set(PROFILE_COOKIE, encodeProfile(user), profileCookieOptions);
    res.cookies.delete("g_oauth_state");
    res.cookies.delete("g_oauth_flow");
    return res;
  } catch {
    return fail("exchange_failed");
  }
}
