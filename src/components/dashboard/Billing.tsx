"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * The Billing tab: what the customer is paying, where it stands, and the
 * levers — cancel, resume, payment method, invoices, support.
 *
 * State comes live from /api/billing/subscription (Stripe's truth, or the
 * stored demo status labelled as such — never a blend). Cancellation is
 * always scheduled for period end and the copy says exactly what will
 * happen and when: during a trial, "you will not be charged"; during a
 * paid period, "you keep service until <date>". A cancel button whose
 * consequences have to be guessed at is how billing UIs earn distrust.
 */

type Subscription = {
  status: string;
  trialEnd: number | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number | null;
  subscriptionId: string;
  quantity: number;
  paymentMethod: { brand: string; last4: string } | null;
};

type BillingState = {
  ok: boolean;
  stripe: boolean;
  mode: "stripe" | "demo";
  planStatus: string;
  email: string;
  subscription: Subscription | null;
  error?: string;
};

const fmtDate = (epochSeconds: number) =>
  new Date(epochSeconds * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

export function Billing() {
  const [state, setState] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // The cancel flow confirms in place. A subscription is not a page card;
  // one mis-click must never schedule its end.
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [notify, setNotify] = useState<{ on: boolean; deliverable: boolean; reason: string | null } | null>(null);

  const load = useCallback(() => {
    fetch("/api/billing/subscription")
      .then((r) => r.json())
      .then((j: BillingState) => setState(j))
      .catch(() => setState(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((j: { notifyPublishes?: boolean; deliverable?: boolean; reason?: string | null }) =>
        setNotify({ on: j.notifyPublishes ?? true, deliverable: Boolean(j.deliverable), reason: j.reason ?? null })
      )
      .catch(() => {});
  }, []);

  const toggleNotify = async () => {
    if (!notify) return;
    const next = !notify.on;
    setNotify({ ...notify, on: next });
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyPublishes: next }),
    }).catch(() => setNotify({ ...notify, on: !next }));
  };

  const act = async (action: "cancel" | "resume" | "portal") => {
    setBusy(action);
    setActionError(null);
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !json.ok) {
        setActionError(json.error || "That did not go through — try again.");
      } else if (action === "portal" && json.url) {
        window.location.href = json.url;
        return; // leaving the page; no state to update
      } else {
        setConfirmingCancel(false);
        load();
      }
    } catch {
      setActionError("Could not reach the server.");
    }
    setBusy(null);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-paper p-6">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="text-[13px] text-muted">Loading your subscription</p>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="rounded-2xl border border-line bg-paper p-6">
        <p className="text-[14px]">Could not load billing. Refresh, or{" "}
          <Link href="/support" className="text-accent underline underline-offset-2">contact support</Link>.
        </p>
      </div>
    );
  }

  const sub = state.subscription;
  const inTrial = sub?.status === "trialing" && sub.trialEnd;
  const ending = Boolean(sub?.cancelAtPeriodEnd);
  const endDate = sub?.currentPeriodEnd ? fmtDate(sub.currentPeriodEnd) : null;

  const statusLine = (() => {
    if (state.mode === "demo") {
      return state.planStatus === "active"
        ? "Active — demo mode, no payment on file"
        : `${state.planStatus} — demo mode`;
    }
    if (!sub) return state.error ? `Could not reach Stripe: ${state.error}` : "No subscription yet";
    if (ending) return `Ends ${endDate ?? "at the period end"} — will not renew`;
    if (inTrial) return `Free trial — first charge ${sub.trialEnd ? fmtDate(sub.trialEnd) : "at trial end"}`;
    if (sub.status === "active") return `Active — renews ${endDate ?? "monthly"}`;
    if (sub.status === "past_due") return "Payment past due — update your card to keep the agent running";
    if (sub.status === "canceled") return "Canceled";
    return sub.status;
  })();

  return (
    <div className="grid gap-5">
      {/* Current plan */}
      <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-medium">Your plan</h2>
            <p className="mt-0.5 text-[12px] text-muted">{state.email}</p>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] ${
              ending || sub?.status === "past_due"
                ? "border-line text-ink"
                : "border-accent/40 bg-accent/[0.08] text-ink"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${
                sub?.status === "past_due" ? "bg-ink" : ending ? "bg-muted/60" : "bg-accent"
              }`}
            />
            {statusLine}
          </span>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-line p-3.5">
            <dt className="label-mono text-muted">Price</dt>
            <dd className="mt-1 text-[17px] font-medium tracking-tight">
              ${49 * (sub?.quantity ?? 1)}<span className="text-[12px] text-muted">/mo</span>
            </dd>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {sub?.quantity ?? 1} website{(sub?.quantity ?? 1) === 1 ? "" : "s"} × $49
            </p>
          </div>
          <div className="rounded-xl border border-line p-3.5">
            <dt className="label-mono text-muted">{inTrial ? "Trial ends" : ending ? "Service ends" : "Renews"}</dt>
            <dd className="mt-1 text-[15px] font-medium tracking-tight">
              {inTrial && sub?.trialEnd ? fmtDate(sub.trialEnd) : endDate ?? "—"}
            </dd>
          </div>
          <div className="rounded-xl border border-line p-3.5">
            <dt className="label-mono text-muted">Payment method</dt>
            <dd className="mt-1 text-[15px] font-medium tracking-tight">
              {sub?.paymentMethod
                ? `${sub.paymentMethod.brand} ···· ${sub.paymentMethod.last4}`
                : state.mode === "demo"
                  ? "None (demo)"
                  : "None on file"}
            </dd>
          </div>
          <div className="rounded-xl border border-line p-3.5">
            <dt className="label-mono text-muted">Agent</dt>
            <dd className="mt-1 text-[15px] font-medium tracking-tight">
              {state.planStatus === "active" ? "Running" : "Stopped"}
            </dd>
            <p className="mt-0.5 text-[11.5px] text-muted">Follows the subscription</p>
          </div>
        </dl>
      </div>

      {/* Actions */}
      <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <h2 className="text-[15px] font-medium">Manage</h2>
        {sub?.status === "past_due" && (
          <p className="mt-2 rounded-xl border border-accent/40 bg-accent/[0.06] p-3.5 text-[12.5px] leading-relaxed text-ink">
            <span className="font-medium">Your last payment did not go through.</span>{" "}
            Update the card below and the agent keeps running — it only stops if the
            retries run out.
          </p>
        )}
        <div className="mt-4 grid gap-3">
          {/* Always present, never hidden.
              Hiding this in demo mode meant the single thing a customer
              most needs to find — "where do I update my card" — simply
              was not on the page, and its absence looked like an
              oversight rather than a deployment that has no Stripe yet.
              It is shown either way and says which it is. */}
          {state.mode === "stripe" ? (
            <button
              onClick={() => act("portal")}
              disabled={busy !== null}
              className="flex w-full items-center justify-between rounded-xl border border-line p-4 text-left transition-colors hover:border-ink/40 hover:bg-paper-warm disabled:opacity-60"
            >
              <span>
                <span className="block text-[13.5px] font-medium">
                  {busy === "portal" ? "Opening Stripe…" : "Update payment method"}
                </span>
                <span className="block text-[12px] text-muted">
                  {sub?.paymentMethod
                    ? `Currently ${sub.paymentMethod.brand} ···· ${sub.paymentMethod.last4}. Change your card, download invoices, or update billing details on Stripe's secure page.`
                    : "Add a card, download invoices, or update billing details on Stripe's secure page."}
                </span>
              </span>
              <span aria-hidden="true" className="text-muted">&rarr;</span>
            </button>
          ) : (
            <div className="rounded-xl border border-line p-4">
              <p className="text-[13.5px] font-medium">Update payment method</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                Card details are handled entirely by Stripe and never reach Ascent&apos;s
                servers. This deployment has no Stripe keys yet, so there is no card on
                file and nothing to update — the button appears here the moment billing
                is connected.
              </p>
            </div>
          )}

          {/* Cancel / resume */}
          {(sub || state.mode === "demo") && state.planStatus !== "canceled" && !ending && (
            confirmingCancel ? (
              <div className="rounded-xl border border-ink/30 bg-paper-warm p-4">
                <p className="text-[13.5px] font-medium">
                  {inTrial ? "End your free trial?" : "Cancel your subscription?"}
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  {state.mode === "demo"
                    ? "Demo mode: the agent stops producing pages immediately. Pages already published stay on your site."
                    : inTrial
                      ? `You will not be charged. The agent keeps working until ${sub?.trialEnd ? fmtDate(sub.trialEnd) : "the trial ends"}, then stops. Pages already published stay on your site.`
                      : `No further charges. The agent keeps working until ${endDate ?? "the end of the period you paid for"}, then stops. Pages already published stay on your site.`}
                </p>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  <button
                    onClick={() => act("cancel")}
                    disabled={busy !== null}
                    className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-on-ink transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    {busy === "cancel" ? "Cancelling…" : inTrial ? "Yes, end my trial" : "Yes, cancel"}
                  </button>
                  <button
                    onClick={() => setConfirmingCancel(false)}
                    disabled={busy !== null}
                    className="rounded-full border border-line bg-paper px-4 py-2 text-[12.5px] font-medium transition-colors hover:border-ink/40"
                  >
                    Keep my plan
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingCancel(true)}
                className="flex w-full items-center justify-between rounded-xl border border-line p-4 text-left transition-colors hover:border-ink/40 hover:bg-paper-warm"
              >
                <span>
                  <span className="block text-[13.5px] font-medium">
                    {inTrial ? "End free trial" : "Cancel subscription"}
                  </span>
                  <span className="block text-[12px] text-muted">
                    {inTrial
                      ? "Stop before the trial converts — you will not be charged."
                      : "Service continues to the end of the period you paid for."}
                  </span>
                </span>
                <span aria-hidden="true" className="text-muted">&rarr;</span>
              </button>
            )
          )}

          {/* Resume a scheduled cancellation / reactivate demo */}
          {(ending || (state.mode === "demo" && state.planStatus === "canceled")) && (
            <button
              onClick={() => act("resume")}
              disabled={busy !== null}
              className="flex w-full items-center justify-between rounded-xl border border-accent/50 bg-accent/[0.06] p-4 text-left transition-colors hover:border-accent disabled:opacity-60"
            >
              <span>
                <span className="block text-[13.5px] font-medium">
                  {busy === "resume" ? "Resuming…" : "Resume subscription"}
                </span>
                <span className="block text-[12px] text-muted">
                  {ending
                    ? `Cancellation is scheduled for ${endDate ?? "the period end"} — undo it and keep the agent running.`
                    : "Turn the agent back on."}
                </span>
              </span>
              <span aria-hidden="true" className="text-muted">&rarr;</span>
            </button>
          )}

          {notify && (
            <div className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <span className="block text-[13.5px] font-medium">Email me when a page goes live</span>
                  <span className="block text-[12px] text-muted">
                    Account and billing emails are always sent — this covers publishing notices only.
                  </span>
                </span>
                <button
                  onClick={toggleNotify}
                  role="switch"
                  aria-checked={notify.on}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    notify.on ? "bg-accent" : "bg-line"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-paper transition-all ${
                      notify.on ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
              {!notify.deliverable && notify.reason && (
                <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
                  <span className="text-ink">Not sending yet.</span> {notify.reason}
                </p>
              )}
            </div>
          )}

          <Link
            href="/support"
            className="flex w-full items-center justify-between rounded-xl border border-line p-4 text-left transition-colors hover:border-ink/40 hover:bg-paper-warm"
          >
            <span>
              <span className="block text-[13.5px] font-medium">Contact support</span>
              <span className="block text-[12px] text-muted">
                Billing questions, refunds, or anything else — a person answers.
              </span>
            </span>
            <span aria-hidden="true" className="text-muted">&rarr;</span>
          </Link>
        </div>

        {actionError && (
          <p className="mt-4 rounded-xl border border-line bg-paper-warm p-3.5 text-[12.5px] leading-relaxed text-ink/80">
            {actionError} If it keeps failing,{" "}
            <Link href="/support" className="text-accent underline underline-offset-2">write to support</Link>.
          </p>
        )}

        {state.mode === "demo" && (
          <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
            This deployment is running in demo billing mode — activation is simulated and no card is
            ever charged. Payment methods and invoices appear here once Stripe is connected.
          </p>
        )}
      </div>
    </div>
  );
}
