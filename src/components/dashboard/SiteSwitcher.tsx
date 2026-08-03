"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentSite } from "@/lib/agent-pages";
import { quoteFor, describeQuote } from "@/lib/pricing";

/**
 * The "+" beside the site name: switch between the owner's websites, or
 * add another.
 *
 * Adding branches on whether the plan already covers it, because those are
 * genuinely different acts. If a seat is paid for and unused, pressing "+"
 * has no business showing a payment screen — the customer already bought
 * it, and asking again reads as being charged twice. If no seat is spare,
 * the charge is stated in full before anything happens: what the plan
 * costs now, what it will cost, and that it is prorated. Both paths end in
 * the same place, the setup wizard for the new site.
 *
 * The prices come from src/lib/pricing.ts rather than being written here,
 * so this panel cannot quote a number the card is not charged.
 */

type Seats = { allowance: number; used: number };

type AddState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "confirm"; seats: Seats }
  // Carries the seats so the confirmation stays on screen while the charge
  // is in flight. Swapping back to the menu mid-payment would read as the
  // click having done nothing.
  | { phase: "paying"; seats: Seats }
  | { phase: "error"; message: string };

function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function SiteSwitcher({
  sites,
  activeSiteId,
  onSelect,
}: {
  sites: AgentSite[];
  activeSiteId: string | null;
  onSelect: (siteId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [add, setAdd] = useState<AddState>({ phase: "idle" });
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape. A popover that can only be
  // dismissed by completing it is a trap on touch devices, where there is
  // no cursor to move away.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAdd({ phase: "idle" });
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setAdd({ phase: "idle" });
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /** Does the plan already cover another site, or must one be bought? */
  const beginAdd = async () => {
    setAdd({ phase: "checking" });
    try {
      const res = await fetch("/api/billing/subscription");
      const json = (await res.json()) as { seats?: Seats; error?: string };
      if (!json.seats) {
        setAdd({
          phase: "error",
          message: json.error || "Could not check your plan. Try again in a moment.",
        });
        return;
      }
      if (json.seats.used < json.seats.allowance) {
        // Already paid for. Straight into setup — no payment screen.
        window.location.href = "/onboarding?add=1";
        return;
      }
      setAdd({ phase: "confirm", seats: json.seats });
    } catch {
      setAdd({ phase: "error", message: "Could not reach billing. Check your connection and try again." });
    }
  };

  /** Buy the extra site, then go straight to setting it up. */
  const payAndAdd = async (seats: Seats) => {
    setAdd({ phase: "paying", seats });
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addSite" }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setAdd({ phase: "error", message: json.error || "The payment did not go through." });
        return;
      }
      window.location.href = "/onboarding?add=1";
    } catch {
      setAdd({ phase: "error", message: "Could not reach billing. Nothing has been charged." });
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setAdd({ phase: "idle" });
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={sites.length > 1 ? "Switch website or add another" : "Add another website"}
        title={sites.length > 1 ? "Switch website or add another" : "Add another website"}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-[15px] leading-none text-muted transition-colors hover:border-ink/40 hover:text-ink"
      >
        +
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            role="menu"
            className="absolute left-0 top-9 z-50 w-[19rem] overflow-hidden rounded-xl border border-line bg-paper shadow-xl shadow-black/[0.08]"
          >
            {add.phase === "confirm" || add.phase === "paying" ? (
              <AddConfirm
                seats={add.seats}
                busy={add.phase === "paying"}
                onCancel={() => setAdd({ phase: "idle" })}
                onPay={() => payAndAdd(add.seats)}
              />
            ) : (
              <>
                {sites.length > 0 && (
                  <div className="border-b border-line py-1.5">
                    <p className="px-3 pb-1 pt-1.5 label-mono text-muted">Your websites</p>
                    {sites.map((s) => {
                      const current = s.siteId === activeSiteId;
                      return (
                        <button
                          key={s.siteId}
                          role="menuitem"
                          onClick={() => {
                            onSelect(s.siteId);
                            setOpen(false);
                          }}
                          aria-current={current ? "true" : undefined}
                          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-paper-warm ${
                            current ? "bg-paper-warm" : ""
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              current ? "bg-accent" : "bg-line"
                            }`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium">
                              {s.businessName || hostOf(s.url)}
                            </span>
                            <span className="block truncate text-[11.5px] text-muted">
                              {hostOf(s.url)}
                            </span>
                          </span>
                          {current && (
                            <span className="shrink-0 text-[11px] text-muted">Viewing</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                <button
                  role="menuitem"
                  onClick={beginAdd}
                  disabled={add.phase === "checking"}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-paper-warm disabled:opacity-50"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[13px] leading-none text-muted"
                  >
                    +
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium">
                      {add.phase === "checking" ? "Checking your plan…" : "Add another website"}
                    </span>
                    <span className="block text-[11.5px] text-muted">
                      Its own agent, plan and schedule
                    </span>
                  </span>
                </button>

                {add.phase === "error" && (
                  <p className="border-t border-line bg-paper-warm px-3 py-2.5 text-[12px] leading-relaxed text-ink">
                    {add.message}
                  </p>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * What adding one more site costs, stated before it is charged.
 *
 * Shows the delta as well as the new total, because the delta is the
 * number the customer is actually deciding about.
 */
function AddConfirm({
  seats,
  busy,
  onCancel,
  onPay,
}: {
  seats: Seats;
  busy: boolean;
  onCancel: () => void;
  onPay: () => void;
}) {
  const now = quoteFor(seats.allowance);
  const next = quoteFor(seats.allowance + 1);
  const delta = next.total - now.total;

  return (
    <div className="p-4">
      <p className="text-[13.5px] font-medium">Add a website to your plan</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        Your plan covers {seats.allowance} website{seats.allowance === 1 ? "" : "s"} and all{" "}
        {seats.allowance === 1 ? "of it is" : "of them are"} in use.
      </p>

      <dl className="mt-3 overflow-hidden rounded-xl border border-line">
        <div className="flex items-baseline justify-between gap-3 px-3 py-2">
          <dt className="text-[12px] text-muted">Now</dt>
          <dd className="text-[13px]">${now.total}/mo</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-line bg-paper-warm px-3 py-2">
          <dt className="text-[12px] text-muted">After</dt>
          <dd className="text-[13.5px] font-medium">
            ${next.total}/mo{" "}
            <span className="text-[11.5px] font-normal text-muted">
              (+${delta})
            </span>
          </dd>
        </div>
      </dl>

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
        {describeQuote(next)}. Prorated — you only pay for the rest of this
        month.
      </p>

      <div className="mt-3.5 flex items-center gap-2">
        <button
          onClick={onPay}
          disabled={busy}
          className="flex-1 rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-on-ink transition-colors hover:bg-accent disabled:opacity-60"
        >
          {busy ? "Adding…" : `Pay $${delta} and continue`}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-full border border-line px-3.5 py-2 text-[12.5px] transition-colors hover:border-ink/40 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
