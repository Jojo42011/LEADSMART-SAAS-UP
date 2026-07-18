"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Wordmark } from "@/components/ui/Wordmark";
import { Field } from "@/components/onboarding/fields";

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    // Auth wiring lands with the backend; route into the product for now.
    // New accounts go through checkout, which unlocks onboarding.
    setTimeout(() => router.push(isSignup ? "/checkout" : "/dashboard"), 500);
  };

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
        <div className="mt-8 rounded-2xl border border-line bg-white p-8 shadow-xl shadow-black/[0.04]">
          <h1 className="font-display text-[26px] tracking-tight">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-[13.5px] text-muted">
            {isSignup
              ? "Your agent starts working the moment setup ends."
              : "Sign in to your command center."}
          </p>

          <form onSubmit={submit} className="mt-7 grid gap-4">
            <Field
              label="Email"
              type="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Field
              label="Password"
              type="password"
              required
              placeholder={isSignup ? "At least 8 characters" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-1 inline-flex items-center justify-center rounded-full bg-ink px-6 py-3.5 text-[14.5px] font-medium text-white transition-colors hover:bg-accent disabled:opacity-60"
            >
              {busy ? "One moment" : isSignup ? "Create account" : "Sign in"}
            </button>
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
        <p className="label-mono mt-6 text-center text-muted/60">
          Month to month &middot; Cancel anytime
        </p>
      </motion.div>
    </div>
  );
}
