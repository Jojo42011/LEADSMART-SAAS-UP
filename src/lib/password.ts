import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>;

/**
 * Password hashing for email accounts.
 *
 * scrypt is a memory-hard KDF and ships in Node core, so this needs no new
 * dependency. Stored form is scrypt$<salt base64url>$<hash base64url>; the
 * scheme is recorded so a future migration to argon2 can tell old hashes
 * apart instead of guessing.
 *
 * Never log, return, or store the plaintext. Verification is timing-safe,
 * and verifyPassword deliberately does the same work when the account does
 * not exist so signin timing cannot be used to enumerate accounts.
 */

const KEYLEN = 64;
const SCHEME = "scrypt";

/** Rejected before hashing so obviously weak inputs never create an account. */
export const MIN_PASSWORD_LENGTH = 8;

export function passwordProblem(password: string): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 200) return "Password is too long.";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return `${SCHEME}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

/**
 * Constant-time verification. Returns false for malformed or missing
 * hashes rather than throwing, so a corrupt row cannot 500 the sign-in
 * route or be distinguished from a wrong password.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined
): Promise<boolean> {
  // No account: still burn a comparable amount of work so the response
  // time does not reveal whether the email is registered.
  if (!stored) {
    await scrypt(password, randomBytes(16), KEYLEN);
    return false;
  }
  const [scheme, saltPart, hashPart] = stored.split("$");
  if (scheme !== SCHEME || !saltPart || !hashPart) {
    await scrypt(password, randomBytes(16), KEYLEN);
    return false;
  }
  let expected: Buffer;
  try {
    expected = Buffer.from(hashPart, "base64url");
  } catch {
    return false;
  }
  const actual = await scrypt(password, Buffer.from(saltPart, "base64url"), expected.length || KEYLEN);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Lowercased and trimmed so Foo@Bar.com and foo@bar.com are one account. */
export function normalizeEmail(email: string): string {
  return (email || "").trim().toLowerCase();
}

export function emailLooksValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
