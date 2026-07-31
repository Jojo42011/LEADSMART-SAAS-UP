import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/**
 * The login session primitive the app didn't have yet.
 *
 * A session is a small JSON payload (who signed in, from which provider)
 * signed with an HMAC and stored in an httpOnly cookie so the browser can
 * never read or forge it. No database is required: the signature is the
 * source of truth. Swaps to a server side session store the same way the
 * rest of the app upgrades — when DATABASE_URL lands — without changing any
 * caller. Degrades to a dev secret when AUTH_SECRET is unset so local runs
 * still work; production must set AUTH_SECRET.
 */

export const SESSION_COOKIE = "ascent_session";
/** Non-sensitive mirror the client can read to render "signed in as". */
export const PROFILE_COOKIE = "ascent_profile";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Session epoch. Bumping this invalidates every session issued before the
 * bump — the one lever a stateless cookie session has for "log everyone
 * out". Bumped to 2 when logins started writing tenant rows to the
 * database, so sessions from before that change (accounts that exist in
 * nobody's records) cannot linger; those visitors sign in again and their
 * account lands in the tenants table like every new one.
 */
export const SESSION_VERSION = 2;

export type AuthProvider = "google" | "github" | "password";

export type SessionUser = {
  sub: string;
  email: string;
  name: string;
  picture: string;
  provider: AuthProvider;
  /** Issued-at, epoch ms. */
  iat: number;
  /** Session epoch this token was issued under. */
  v?: number;
};

function secret(): string {
  return process.env.AUTH_SECRET || "ascent-dev-secret-change-me";
}

/** The cookie options every session cookie is written with. */
export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
};

/** The readable profile cookie: same lifetime, not httpOnly, no secrets. */
export const profileCookieOptions = {
  httpOnly: false,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
};

export function signSession(user: SessionUser): string {
  const payload = Buffer.from(JSON.stringify({ ...user, v: SESSION_VERSION }), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySession(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionUser;
    // Sessions from an earlier epoch are gone, not grandfathered: their
    // holders sign in again, which writes their account to the database.
    if (user.v !== SESSION_VERSION) return null;
    return user;
  } catch {
    return null;
  }
}

export function readSession(req: NextRequest): SessionUser | null {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

/** Base64url-encodes the display profile so it survives as a cookie value. */
export function encodeProfile(user: SessionUser): string {
  return Buffer.from(
    JSON.stringify({ email: user.email, name: user.name, picture: user.picture, provider: user.provider }),
    "utf8"
  ).toString("base64url");
}
