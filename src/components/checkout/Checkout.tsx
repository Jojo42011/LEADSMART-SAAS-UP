"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Wordmark } from "@/components/ui/Wordmark";
import { quoteFor, describeQuote } from "@/lib/pricing";

const ease = [0.21, 0.47, 0.32, 0.98] as const;

const included = [
  "Autonomous research, writing and publishing",
  "SEO and AEO optimization on every page",
  "Full audit before anything ships",
  "Live dashboard and ranking sync",
];

function formatCard(v: string): string {
  return v
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatExpiry(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function Checkout() {
  const router = useRouter();
  const [sites, setSites] = useState(1);
  const [name, setName] = useState("");
  const [card, setCard] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  /** null = probing, true = real Stripe Checkout, false = demo mode. */
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // Which mode this deployment runs in, plus the Stripe return legs.
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid") === "1") {
      // Payment confirmed by Stripe redirect; the webhook activates the
      // tenant server side, which is the only place activation is recorded.
      // There used to be a localStorage flag mirrored here to unlock
      // onboarding — a second, client-side answer to "have they paid" that
      // could disagree with the server's. Onboarding is open now, and
      // entitlement is read from the server, so the flag is gone.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount browser read
      setDone(true);
      const t = setTimeout(() => router.push("/onboarding"), 1400);
      return () => clearTimeout(t);
    }
    if (params.get("canceled") === "1") {
      setNotice("Checkout was canceled. No charge was made.");
    }
    fetch("/api/billing/checkout")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { configured?: boolean } | null) => setStripeReady(Boolean(j?.configured)))
      .catch(() => setStripeReady(false));
  }, [router]);

  // One definition of the price, shared with the billing panel, the
  // marketing page and the Stripe line items — see src/lib/pricing.ts.
  const quote = quoteFor(sites);
  const total = quote.total;

  /** Real checkout: create a Stripe session and hand the browser to Stripe. */
  const payStripe = async () => {
    if (paying) return;
    setPaying(true);
    setNotice(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sites }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (json.url) {
        window.location.href = json.url;
        return;
      }
      setNotice(json.error || "Could not start checkout. Please try again.");
    } catch {
      setNotice("Could not reach checkout. Please try again.");
    }
    setPaying(false);
  };

  const pay = (e: React.FormEvent) => {
    e.preventDefault();
    if (paying) return;
    if (stripeReady) {
      void payStripe();
      return;
    }
    setPaying(true);
    // Demo mode (no STRIPE_SECRET_KEY): no card needed, activates after a
    // short beat so testers can click straight through the paywall. The
    // POST is what flips the tenant's plan to active server-side — the
    // engine only runs sites on active plans, so a purely client-side demo
    // "payment" left every site invisible to the daily cycle.
    void fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sites }),
    }).catch(() => {});
    setTimeout(() => {
      setDone(true);
      setTimeout(() => router.push("/onboarding"), 1200);
    }, 1400);
  };

  const inputClass =
    "mt-2 w-full rounded-xl border border-line bg-paper px-4 py-3 text-[14.5px] text-ink outline-none transition-all placeholder:text-muted focus:border-ink focus:ring-4 focus:ring-ink/[0.06]";

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-paper-warm px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.03)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_40%,black_30%,transparent_75%)]"
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease }}
        className="relative w-full max-w-3xl"
      >
        <div className="flex justify-center">
          <Wordmark />
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-paper shadow-xl shadow-black/[0.05]">
          <div className="grid md:grid-cols-[minmax(0,4fr)_minmax(0,5fr)]">
            {/* Order summary */}
            <div className="flex flex-col bg-fill-strong p-8 text-on-ink">
              <span className="label-mono text-on-ink/75">Your plan</span>
              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="font-display text-6xl tracking-tight">${total}</span>
                <span className="text-[13px] text-on-ink/75">/month</span>
              </div>

              <div className="mt-6 flex items-center justify-between rounded-xl border border-on-ink/12 px-4 py-3">
                <div>
                  <p className="text-[13.5px] font-medium">Websites</p>
                  <p className="text-[11.5px] text-on-ink/75">{describeQuote(quote)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSites((s) => Math.max(1, s - 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-on-ink/20 text-on-ink/80 transition-colors hover:border-on-ink"
                    aria-label="Fewer websites"
                  >
                    &minus;
                  </button>
                  <span className="w-5 text-center font-mono text-[15px]">{sites}</span>
                  <button
                    type="button"
                    onClick={() => setSites((s) => Math.min(20, s + 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-on-ink/20 text-on-ink/80 transition-colors hover:border-on-ink"
                    aria-label="More websites"
                  >
                    +
                  </button>
                </div>
              </div>

              <ul className="mt-6 grid gap-2.5">
                {included.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[12.5px] text-on-ink/75">
                    <svg viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m3 8.5 3.5 3.5L13 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <p className="mt-auto pt-6 text-[11.5px] leading-relaxed text-on-ink/75">
                Month to month. Cancel anytime. Every page ever published
                stays on your site.
              </p>
            </div>

            {/* Payment form */}
            <div className="p-8">
              {done ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex h-full flex-col items-center justify-center py-12 text-center"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink">
                    <svg viewBox="0 0 16 16" className="h-6 w-6 text-on-ink" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m3.5 8.5 3 3L12.5 5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <p className="font-display mt-5 text-2xl tracking-tight">You are in.</p>
                  <p className="mt-1.5 text-[13.5px] text-muted">
                    Taking you to setup, your agent is waiting.
                  </p>
                </motion.div>
              ) : (
                <form onSubmit={pay}>
                  <h1 className="font-display text-[24px] tracking-tight">Payment details</h1>
                  <p className="mt-1 text-[13px] text-muted">
                    Billed monthly. First charge today, then every month until
                    you cancel.
                  </p>

                  {notice && (
                    <div className="mt-4 rounded-xl border border-accent/30 bg-accent-dim px-4 py-3 text-[12.5px] leading-relaxed text-ink">
                      {notice}
                    </div>
                  )}

                  <div className="mt-6 grid gap-4">
                    {stripeReady && (
                      <p className="rounded-xl border border-line bg-paper-warm px-4 py-3 text-[12.5px] leading-relaxed text-muted">
                        You&apos;ll enter card details on Stripe&apos;s secure
                        checkout page in the next step.
                      </p>
                    )}
                    {!stripeReady && (<>
                    {/* id + name on every field: autoComplete alone does not
                        make browsers fill a card form, and the id is what
                        links each label to its input for assistive tech. */}
                    <label className="block" htmlFor="cc-name">
                      <span className="text-[13px] font-medium text-ink">Name on card</span>
                      <input
                        id="cc-name"
                        name="cc-name"
                        className={inputClass}
                        placeholder="Jordan Smith"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="cc-name"
                      />
                    </label>
                    <label className="block" htmlFor="cc-number">
                      <span className="text-[13px] font-medium text-ink">Card number</span>
                      <div className="relative">
                        <input
                          id="cc-number"
                          name="cc-number"
                          className={inputClass}
                          placeholder="4242 4242 4242 4242"
                          inputMode="numeric"
                          value={card}
                          onChange={(e) => setCard(formatCard(e.target.value))}
                          autoComplete="cc-number"
                        />
                        <span className="absolute right-4 top-1/2 mt-1 flex -translate-y-1/2 items-center gap-1.5">
                          <span className="h-5 w-8 rounded-[3px] bg-line" />
                          <span className="h-5 w-8 rounded-[3px] bg-line" />
                        </span>
                      </div>
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <label className="block" htmlFor="cc-exp">
                        <span className="text-[13px] font-medium text-ink">Expiry</span>
                        <input
                          id="cc-exp"
                          name="cc-exp"
                          className={inputClass}
                          placeholder="MM/YY"
                          inputMode="numeric"
                          value={expiry}
                          onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                          autoComplete="cc-exp"
                        />
                      </label>
                      <label className="block" htmlFor="cc-csc">
                        <span className="text-[13px] font-medium text-ink">CVC</span>
                        <input
                          id="cc-csc"
                          name="cc-csc"
                          className={inputClass}
                          placeholder="123"
                          inputMode="numeric"
                          value={cvc}
                          onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          autoComplete="cc-csc"
                        />
                      </label>
                    </div>
                    </>)}

                    <button
                      type="submit"
                      disabled={paying || stripeReady === null}
                      className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-[14.5px] font-medium text-on-ink transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {paying ? (
                        <>
                          <span className="h-4 w-4 rounded-full border-2 border-on-ink/40 border-t-white animate-spin" />
                          {stripeReady ? "Opening Stripe" : "Processing"}
                        </>
                      ) : (
                        <>Subscribe for ${total}/month</>
                      )}
                    </button>

                    <p className="flex items-center justify-center gap-1.5 text-center text-[11.5px] text-muted">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <rect x="5" y="10" width="14" height="10" rx="2" />
                        <path d="M8 10V7a4 4 0 1 1 8 0v3" />
                      </svg>
                      {stripeReady
                        ? "Payments secured by Stripe."
                        : "Test mode: card fields are optional and nothing is charged. Click subscribe to continue."}
                    </p>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
