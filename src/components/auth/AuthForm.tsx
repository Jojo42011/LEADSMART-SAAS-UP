"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Wordmark } from "@/components/ui/Wordmark";
import { Field } from "@/components/onboarding/fields";

type Providers = { google: boolean; github: boolean; password: boolean };
type Profile = { email: string; name: string; picture: string; provider: string };

/** Human-friendly copy for the error codes the OAuth routes redirect with. */
const ERROR_COPY: Record<string, string> = {
  google_unconfigured: "Google sign-in isn't set up on this deployment yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable it.",
  github_unconfigured: "GitHub sign-in isn't set up on this deployment yet. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to enable it.",
  state_mismatch: "That sign-in link expired. Please try again.",
  token_exchange_failed: "The provider rejected the sign-in. Please try again.",
  exchange_failed: "Something went wrong reaching the provider. Please try again.",
  no_email: "We couldn't read an email address from that account.",
  email_unverified:
    "That Google account's email address isn't verified. Verify it with Google, then try again.",
  no_identity: "We couldn't read your profile from that account.",
  access_denied: "Sign-in was cancelled.",
};

/** Reads the readable (non-httpOnly) profile cookie the OAuth callbacks set. */
function readProfileCookie(): Profile | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith("ascent_profile="));
  if (!match) return null;
  try {
    const b64 = match.slice("ascent_profile=".length).replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Profile;
  } catch {
    return null;
  }
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#4285F4" d="M23.52 12.27c0-.82-.07-1.6-.21-2.36H12v4.46h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.73Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76l3.99-3.09Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44A11.96 11.96 0 0 0 12 0 12 12 0 0 0 1.28 6.62l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75Z" />
    </svg>
  );
}

function GithubGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
      <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.82-.26.82-.58v-2c-3.34.72-4.04-1.6-4.04-1.6-.55-1.4-1.34-1.76-1.34-1.76-1.1-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.84 2.8 1.3 3.49 1 .1-.78.42-1.31.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.32.47-2.4 1.24-3.24-.12-.31-.54-1.53.12-3.18 0 0 1-.32 3.3 1.24a11.4 11.4 0 0 1 6 0c2.3-1.56 3.3-1.24 3.3-1.24.66 1.65.24 2.87.12 3.18.77.84 1.24 1.92 1.24 3.24 0 4.62-2.81 5.64-5.49 5.94.43.37.82 1.1.82 2.22v3.29c0 .32.21.69.82.57A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<Profile | null>(null);

  const isSignup = mode === "signup";

  useEffect(() => {
    // Which SSO providers this deployment actually has credentials for.
    fetch("/api/auth/providers")
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Providers | null) => p && setProviders(p))
      .catch(() => setProviders({ google: false, github: false, password: false }));

    // Browser-only reads (window.location, document.cookie) that must run
    // after mount, mirroring the app's client-only hydration pattern.
    const code = new URLSearchParams(window.location.search).get("error");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount browser read
    if (code) setError(ERROR_COPY[code] ?? "Sign-in failed. Please try again.");

    // Only offer "Continue as ..." when the server still honors the
    // session. The readable profile cookie can outlive the session itself
    // (sign-out elsewhere, a session-epoch bump), and a continue button
    // into a bounce reads as broken.
    const profile = readProfileCookie();
    if (profile) {
      fetch("/api/auth/session")
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { authed?: boolean } | null) => {
          if (j?.authed) setExisting(profile);
        })
        .catch(() => {});
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Real authentication: the server verifies the password against a
      // stored scrypt hash and sets an httpOnly session cookie. It decides
      // where to go next, so the client cannot route itself into the
      // product without one.
      const res = await fetch(`/api/auth/password/${isSignup ? "signup" : "signin"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = (await res.json()) as { ok?: boolean; next?: string; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "Sign-in failed. Please try again.");
        setBusy(false);
        return;
      }
      router.push(json.next || (isSignup ? "/checkout" : "/dashboard"));
    } catch {
      setError("Could not reach the server. Please try again.");
      setBusy(false);
    }
  };

  const ssoHref = (provider: "google" | "github") =>
    provider === "google"
      ? `/api/auth/google/start?flow=${mode}`
      : `/api/connect/github/start?flow=${mode}`;

  const anyProvider = providers === null || providers.google || providers.github;
  // Email accounts need the database; without it the server refuses these
  // requests, so don't present a form that cannot succeed.
  const passwordDisabled = providers !== null && !providers.password;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-paper-warm px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.03)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_40%,black_30%,transparent_75%)]"
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="relative w-full max-w-sm"
      >
        <div className="flex justify-center">
          <Wordmark />
        </div>
        <div className="mt-8 rounded-2xl border border-line bg-paper p-8 shadow-xl shadow-black/[0.04]">
          <h1 className="font-display text-[26px] tracking-tight">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-[13.5px] text-muted">
            {isSignup
              ? "Your agent starts working the moment setup ends."
              : "Sign in to your command center."}
          </p>

          {existing && (
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-line bg-paper-warm p-3">
              {existing.picture ? (
                // eslint-disable-next-line @next/next/no-img-element -- external avatar, no loader needed
                <img src={existing.picture} alt="" className="h-9 w-9 rounded-full" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-[13px] font-medium text-on-ink">
                  {existing.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">{existing.name}</span>
                <span className="block truncate text-[12px] text-muted">{existing.email}</span>
              </span>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="shrink-0 rounded-full bg-ink px-3.5 py-2 text-[12.5px] font-medium text-on-ink transition-colors hover:bg-accent"
              >
                Continue
              </button>
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-xl border border-accent/30 bg-accent-dim px-4 py-3 text-[12.5px] leading-relaxed text-ink">
              {error}
            </div>
          )}

          {/* Single sign-on — the fast path. */}
          <div className="mt-6 grid gap-2.5">
            <a
              href={ssoHref("google")}
              className="inline-flex items-center justify-center gap-3 rounded-full border border-line bg-paper px-6 py-3 text-[14px] font-medium text-ink transition-colors hover:border-ink/40 hover:bg-paper-warm"
            >
              <GoogleGlyph />
              Continue with Google
            </a>
            <a
              href={ssoHref("github")}
              className="inline-flex items-center justify-center gap-3 rounded-full border border-line bg-paper px-6 py-3 text-[14px] font-medium text-ink transition-colors hover:border-ink/40 hover:bg-paper-warm"
            >
              <GithubGlyph />
              Continue with GitHub
            </a>
            {providers && !anyProvider && (
              <p className="mt-1 text-center text-[11.5px] leading-relaxed text-muted">
                SSO needs provider keys. See{" "}
                <code className="rounded bg-paper-warm px-1 py-0.5 text-[11px]">.env.example</code> to enable
                Google or GitHub sign-in.
              </p>
            )}
          </div>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="label-mono text-[10px] text-muted">or with email</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submit} className="grid gap-4">
            <Field
              label="Email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Field
              label="Password"
              type="password"
              required
              // new-password tells a password manager to offer to generate
              // and save one; current-password tells it to fill the saved
              // one. Sharing a single value here made signup prompt for an
              // existing password and signin offer to invent a new one.
              autoComplete={isSignup ? "new-password" : "current-password"}
              placeholder={isSignup ? "At least 8 characters" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="submit"
              disabled={busy || passwordDisabled}
              className="mt-1 inline-flex items-center justify-center rounded-full bg-ink px-6 py-3.5 text-[14.5px] font-medium text-on-ink transition-colors hover:bg-accent disabled:opacity-60"
            >
              {busy ? "One moment" : isSignup ? "Create account" : "Sign in"}
            </button>
            {passwordDisabled && (
              <p className="text-center text-[11.5px] leading-relaxed text-muted">
                Email accounts need the database. Set{" "}
                <code className="rounded bg-paper-warm px-1 py-0.5 text-[11px]">DATABASE_URL</code>, or
                use Google or GitHub above.
              </p>
            )}
          </form>

          <div className="mt-6 border-t border-line pt-5 text-center text-[13px] text-muted">
            {isSignup ? (
              <>
                Already have an account?{" "}
                <Link href="/signin" className="font-medium text-ink hover:text-accent">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New here?{" "}
                <Link href="/signup" className="font-medium text-ink hover:text-accent">
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
        <p className="label-mono mt-6 text-center text-muted">
          Month to month &middot; Cancel anytime
        </p>
      </motion.div>
    </div>
  );
}
