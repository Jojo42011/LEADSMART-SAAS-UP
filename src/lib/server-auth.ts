import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession, type SessionUser } from "./session";
import { storeConfigured } from "./engine/store";

/**
 * Session reading for server components, which get cookies from
 * next/headers rather than a NextRequest.
 *
 * The dashboard previously rendered for anyone who navigated to it. That
 * made every other auth control partly decorative: the engine routes were
 * gated, but the product page they belong to was not.
 */

/**
 * Whether this deployment has any way for a visitor to sign in at all —
 * email accounts need the database, SSO needs provider keys.
 *
 * The guard below only redirects when at least one method exists. A
 * deployment with no database and no OAuth has no accounts, no tenant
 * store and no other user's data to expose, so redirecting there would
 * lock everyone out of a demo it cannot authenticate anyone into. The
 * moment DATABASE_URL or a provider is configured, real data exists and
 * the guard turns on by itself.
 */
export function authAvailable(): boolean {
  return (
    storeConfigured() ||
    Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) ||
    Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
  );
}

/** The signed-in user, verified from the httpOnly session cookie. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Redirects to sign-in when nobody is signed in. Returns the user so a
 * page can render their identity without reading cookies a second time.
 */
export async function requireUser(redirectTo = "/signin"): Promise<SessionUser | null> {
  const user = await currentUser();
  if (user) return user;
  if (!authAvailable()) return null;
  redirect(redirectTo);
}
