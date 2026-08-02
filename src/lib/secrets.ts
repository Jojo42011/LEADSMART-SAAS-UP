import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * Envelope encryption for the publishing credentials we hold on a
 * customer's behalf — WordPress application passwords and GitHub tokens.
 *
 * These grant write access to someone else's website, so storing them as
 * readable columns means one database leak hands an attacker every
 * customer's site. Values are encrypted with AES-256-GCM before they are
 * written and decrypted only at the moment the engine publishes.
 *
 * Key material comes from CREDENTIALS_KEY, falling back to AUTH_SECRET so
 * a correctly configured deployment needs no new variable. Rotating either
 * one makes existing stored credentials undecryptable; customers reconnect,
 * which is the intended failure mode for a key rotation.
 */

// No "." in the prefix: it is also the field separator below, and a dotted
// prefix silently shifts every field on parse.
const PREFIX = "enc:v1";
const DEV_KEY_MATERIAL = "ascent-dev-secret-change-me";

function keyMaterial(): string {
  const configured = process.env.CREDENTIALS_KEY || process.env.AUTH_SECRET;
  if (configured) return configured;
  // Same reasoning as the session secret: this key encrypts every stored
  // WordPress application password and OAuth refresh token, and the
  // fallback is a literal in a source file. Encrypting customer
  // credentials with a publicly known key is indistinguishable from
  // storing them in plain text, while looking like encryption in the
  // database. Refuse rather than pretend.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Neither CREDENTIALS_KEY nor AUTH_SECRET is set. Refusing to encrypt customer credentials with the development key."
    );
  }
  return DEV_KEY_MATERIAL;
}

function key(): Buffer {
  // scrypt stretches the shared secret into a proper 32-byte AES key; the
  // salt is fixed so the same secret always derives the same key.
  return scryptSync(keyMaterial(), "ascent-credential-encryption", 32);
}

/**
 * True when real key material is configured. Production deployments that
 * store credentials must not run on the development fallback.
 */
export function encryptionConfigured(): boolean {
  return Boolean(process.env.CREDENTIALS_KEY || process.env.AUTH_SECRET);
}

/** Encrypts a secret for storage. Empty and null values pass through untouched. */
export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === "") return plain ?? null;
  // Already encrypted (re-save of an unchanged value): don't double-wrap.
  if (plain.startsWith(`${PREFIX}.`)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Decrypts a stored secret. Values written before encryption existed are
 * returned as-is so the engine keeps working through the transition; they
 * are re-encrypted the next time the customer saves their connection.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined || stored === "") return stored ?? null;
  if (!stored.startsWith(`${PREFIX}.`)) return stored; // legacy plaintext
  const [, ivPart, tagPart, dataPart] = stored.split(".");
  if (!ivPart || !tagPart || !dataPart) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Wrong key or tampered value: fail closed rather than return garbage.
    return null;
  }
}
