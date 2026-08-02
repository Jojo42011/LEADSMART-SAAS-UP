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
import { storeConfigured, findTenantByEmail } from "@/lib/engine/store";
import { normalizeEmail, verifyPassword } from "@/lib/password";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Email sign-in.
 *
 * The failure message is identical whether the email is unregistered or
 * the password is wrong, and verifyPassword does equivalent work in both
 * cases, so neither the response body nor its timing reveals which emails
 * have accounts.
 */
export async function POST(req: NextRequest) {
  // Ten attempts in five minutes leaves room for a forgotten password
  // and none for credential stuffing. Keyed by client rather than by
  // account, so an attacker cannot lock a real user out by failing on
  // their address.
  const limited = await enforceRateLimit(req, { bucket: "signin", limit: 10, windowSeconds: 300 });
  if (limited) return limited;

  if (!storeConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Email accounts need the database. Use Google or GitHub sign-in." },
      { status: 503 }
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const email = normalizeEmail(body.email || "");
  const password = body.password || "";
  const generic = { ok: false, error: "Email or password is incorrect." };

  if (!email || !password) return NextResponse.json(generic, { status: 401 });

  const account = await findTenantByEmail(email);
  // Runs even when account is null: equal work, so timing says nothing.
  const valid = await verifyPassword(password, account?.password_hash);
  if (!account || !valid) return NextResponse.json(generic, { status: 401 });

  const user: SessionUser = {
    sub: account.id,
    email: account.email,
    name: account.name || account.email.split("@")[0],
    picture: "",
    provider: "password",
    iat: Date.now(),
  };
  const res = NextResponse.json({ ok: true, next: "/dashboard" });
  res.cookies.set(SESSION_COOKIE, signSession(user), sessionCookieOptions);
  res.cookies.set(PROFILE_COOKIE, encodeProfile(user), profileCookieOptions);
  return res;
}
