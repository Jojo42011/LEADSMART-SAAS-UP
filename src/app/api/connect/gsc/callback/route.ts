import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { encryptSecret } from "@/lib/secrets";
import { saveGscTokenForEmail } from "@/lib/engine/store";

/**
 * Search Console connect, step 2. Exchanges the code for a refresh token
 * and stores it encrypted on the signed-in tenant's site. During
 * onboarding the site row may not exist yet, so the token also rides an
 * httpOnly cookie that /api/sites picks up at provisioning time — the
 * same pattern the GitHub publish token uses.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const flow = req.cookies.get("gsc_oauth_flow")?.value === "onboarding" ? "onboarding" : "dashboard";
  const back = flow === "onboarding" ? "/onboarding" : "/dashboard";

  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}${back}?gsc=error&reason=${encodeURIComponent(reason)}`);

  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError) return fail(oauthError);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("gsc_oauth_state")?.value) {
    return fail("state_mismatch");
  }

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
        redirect_uri: `${origin}/api/connect/gsc/callback`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!tokenRes.ok) return fail("token_exchange_failed");
    const token = (await tokenRes.json()) as { refresh_token?: string };
    if (!token.refresh_token) return fail("no_refresh_token");

    const encrypted = encryptSecret(token.refresh_token) as string;

    // Store on the tenant's site when one exists already.
    const user = readSession(req);
    let stored = false;
    if (user) {
      try {
        stored = await saveGscTokenForEmail(user.email, encrypted);
      } catch {
        stored = false; // cookie fallback below still carries the token
      }
    }

    const res = NextResponse.redirect(`${origin}${back}?gsc=connected`);
    // Cookie fallback: provisioning reads this when the site row is created.
    res.cookies.set("gsc_token", encrypted, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    res.cookies.delete("gsc_oauth_state");
    res.cookies.delete("gsc_oauth_flow");
    void stored;
    return res;
  } catch {
    return fail("exchange_failed");
  }
}
