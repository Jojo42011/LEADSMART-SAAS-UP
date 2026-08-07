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
 * GitHub OAuth, step 2. Exchanges the code for an access token and stores it
 * in an httpOnly cookie so the browser never sees it. Publishing and repo
 * listing read the cookie server side.
 *
 * The same exchange also establishes a login session: we read the account's
 * identity and mint the session cookie. Where the user lands depends on the
 * `flow` set at step 1 — the onboarding connect path is unchanged, while
 * "Sign in with GitHub" routes signup through checkout and signin to the
 * dashboard.
 */

type GithubUser = { login?: string; name?: string; email?: string; avatar_url?: string };

async function fetchIdentity(token: string): Promise<SessionUser | null> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  try {
    const userRes = await fetch("https://api.github.com/user", { headers, cache: "no-store" });
    if (!userRes.ok) return null;
    const user = (await userRes.json()) as GithubUser;
    if (!user.login) return null;

    // /user only returns email when it is public; ask the emails endpoint
    // for the primary verified address otherwise.
    let email = user.email || "";
    if (!email) {
      const emailRes = await fetch("https://api.github.com/user/emails", { headers, cache: "no-store" });
      if (emailRes.ok) {
        const emails = (await emailRes.json()) as { email: string; primary: boolean; verified: boolean }[];
        email = emails.find((e) => e.primary && e.verified)?.email || emails.find((e) => e.verified)?.email || "";
      }
    }
    if (!email) email = `${user.login}@users.noreply.github.com`;

    return {
      sub: `github:${user.login}`,
      email,
      name: user.name || user.login,
      picture: user.avatar_url || "",
      provider: "github",
      iat: Date.now(),
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const savedState = req.cookies.get("gh_oauth_state")?.value;
  const flowCookie = req.cookies.get("gh_oauth_flow")?.value;
  const flow = flowCookie === "signin" || flowCookie === "signup" ? flowCookie : "connect";
  const origin = req.nextUrl.origin;

  const fail = (reason: string) => {
    if (flow === "connect") {
      return NextResponse.redirect(`${origin}/onboarding?github=error&reason=${encodeURIComponent(reason)}`);
    }
    return NextResponse.redirect(`${origin}/${flow}?error=${encodeURIComponent(reason)}`);
  };

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

    // Establish the login session from the connected account.
    const identity = await fetchIdentity(tokenJson.access_token);
    if (flow !== "connect" && !identity) return fail("no_identity");

    // Make the account visible in the tenants table immediately. Best
    // effort: a database hiccup must never block sign-in itself.
    if (identity) {
      try {
        await upsertTenant(identity.email, identity.name);
      } catch {
        // sign-in proceeds; provisioning upserts the tenant again at launch
      }
    }

    const dest =
      flow === "signup"
        ? `${origin}/onboarding`
        : flow === "signin"
          ? `${origin}/dashboard`
          : `${origin}/onboarding?github=connected`;

    const res = NextResponse.redirect(dest);
    res.cookies.set("gh_token", tokenJson.access_token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    if (identity) {
      res.cookies.set(SESSION_COOKIE, signSession(identity), sessionCookieOptions);
      res.cookies.set(PROFILE_COOKIE, encodeProfile(identity), profileCookieOptions);
    }
    res.cookies.delete("gh_oauth_state");
    res.cookies.delete("gh_oauth_flow");
    return res;
  } catch {
    return fail("exchange_failed");
  }
}
