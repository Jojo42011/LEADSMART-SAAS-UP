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
import { storeConfigured, createPasswordTenant, findTenantByEmail } from "@/lib/engine/store";
import {
  emailLooksValid,
  hashPassword,
  normalizeEmail,
  passwordProblem,
} from "@/lib/password";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Email account creation.
 *
 * Before this existed the sign-up form ran a 500ms timer and redirected —
 * no account was stored, no password was checked, and no session was
 * minted, which meant the sign-in form let anyone in with any credentials.
 * Accounts now live in the tenants table with a scrypt hash, and a real
 * httpOnly session is issued on success.
 *
 * Requires the store: without DATABASE_URL there is nowhere to keep an
 * account, and pretending otherwise is what caused the original hole.
 */
export async function POST(req: NextRequest) {
  // Every signup is a tenant row and, once billing is live, a Stripe
  // customer. Five an hour per client is generous for a household and
  // useless for scripted account creation.
  const limited = await enforceRateLimit(req, { bucket: "signup", limit: 5, windowSeconds: 3600 });
  if (limited) return limited;

  if (!storeConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Email accounts need the database. Use Google or GitHub sign-in." },
      { status: 503 }
    );
  }

  let body: { email?: string; password?: string; name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const email = normalizeEmail(body.email || "");
  const password = body.password || "";
  const name = (body.name || "").trim() || email.split("@")[0];

  if (!emailLooksValid(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  const weak = passwordProblem(password);
  if (weak) return NextResponse.json({ ok: false, error: weak }, { status: 400 });

  const created = await createPasswordTenant(email, await hashPassword(password), name);
  if (!created) {
    // Either the email is taken, or a tenant row exists with a password
    // already set. Say so plainly: the visitor needs to sign in, and the
    // sign-up form is an enumeration surface regardless of wording.
    const existing = await findTenantByEmail(email);
    return NextResponse.json(
      {
        ok: false,
        error: existing
          ? "An account with that email already exists. Sign in instead."
          : "Could not create the account.",
      },
      { status: 409 }
    );
  }

  const user: SessionUser = {
    sub: created.id,
    email: created.email,
    name: created.name || name,
    picture: "",
    provider: "password",
    iat: Date.now(),
  };
  const res = NextResponse.json({ ok: true, next: "/checkout" });
  res.cookies.set(SESSION_COOKIE, signSession(user), sessionCookieOptions);
  res.cookies.set(PROFILE_COOKIE, encodeProfile(user), profileCookieOptions);
  return res;
}
