"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Wordmark } from "@/components/ui/Wordmark";
import { saveBilling } from "@/lib/billing";

const ease = [0.21, 0.47, 0.32, 0.98] as const;
const PRICE = 49;

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

  const total = sites * PRICE;
  const ready = name.trim() !== "" && card.replace(/\D/g, "").length >= 15 && expiry.length === 5 && cvc.length >= 3;

  const pay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || paying) return;
    setPaying(true);
    // Stripe attaches here. Demo mode activates after a short beat.
    setTimeout(() => {
      saveBilling({ active: true, sites, activatedAt: new Date().toISOString() });
      setDone(true);
      setTimeout(() => router.push("/onboarding"), 1200);
    }, 1400);
  };

  const inputClass =
    "mt-2 w-full rounded-xl border border-line bg-white px-4 py-3 text-[14.5px] text-ink outline-none transition-all placeholder:text-muted/50 focus:border-ink focus:ring-4 focus:ring-ink/[0.06]";

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

        <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-white shadow-xl shadow-black/[0.05]">
          <div className="grid md:grid-cols-[minmax(0,4fr)_minmax(0,5fr)]">
            {/* Order summary */}
            <div className="flex flex-col bg-ink p-8 text-white">
              <span className="label-mono text-white/50">Your plan</span>
              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="font-display text-6xl tracking-tight">${total}</span>
                <span className="text-[13px] text-white/50">/month</span>
              </div>

              <div className="mt-6 flex items-center justify-between rounded-xl border border-white/12 px-4 py-3">
                <div>
                  <p className="text-[13.5px] font-medium">Websites</p>
                  <p className="text-[11.5px] text-white/50">${PRICE} each, one agent per site</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSites((s) => Math.max(1, s - 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-white/80 transition-colors hover:border-white"
                    aria-label="Fewer websites"
                  >
                    &minus;
                  </button>
                  <span className="w-5 text-center font-mono text-[15px]">{sites}</span>
                  <button
                    type="button"
                    onClick={() => setSites((s) => Math.min(20, s + 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-white/80 transition-colors hover:border-white"
                    aria-label="More websites"
                  >
                    +
                  </button>
                </div>
              </div>

              <ul className="mt-6 grid gap-2.5">
                {included.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[12.5px] text-white/70">
                    <svg viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m3 8.5 3.5 3.5L13 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <p className="mt-auto pt-6 text-[11.5px] leading-relaxed text-white/40">
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
                    <svg viewBox="0 0 16 16" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="2">
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

                  <div className="mt-6 grid gap-4">
                    <label className="block">
                      <span className="text-[13px] font-medium text-ink">Name on card</span>
                      <input
                        className={inputClass}
                        placeholder="Jordan Smith"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="cc-name"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[13px] font-medium text-ink">Card number</span>
                      <div className="relative">
                        <input
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
                      <label className="block">
                        <span className="text-[13px] font-medium text-ink">Expiry</span>
                        <input
                          className={inputClass}
                          placeholder="MM/YY"
                          inputMode="numeric"
                          value={expiry}
                          onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                          autoComplete="cc-exp"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[13px] font-medium text-ink">CVC</span>
                        <input
                          className={inputClass}
                          placeholder="123"
                          inputMode="numeric"
                          value={cvc}
                          onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          autoComplete="cc-csc"
                        />
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={!ready || paying}
                      className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-[14.5px] font-medium text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {paying ? (
                        <>
                          <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                          Processing
                        </>
                      ) : (
                        <>Subscribe for ${total}/month</>
                      )}
                    </button>

                    <p className="flex items-center justify-center gap-1.5 text-center text-[11.5px] text-muted/70">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <rect x="5" y="10" width="14" height="10" rx="2" />
                        <path d="M8 10V7a4 4 0 1 1 8 0v3" />
                      </svg>
                      Payments secured by Stripe. Demo mode until launch, no
                      card is charged.
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
