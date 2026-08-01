"use client";

import { useEffect, useState } from "react";

/**
 * The support enquiry form.
 *
 * Three outcomes, kept distinct on purpose: sent, saved-but-not-emailed,
 * and rejected. A form that shows the same green tick whether or not the
 * message actually left the building teaches people to trust a signal that
 * means nothing — so when delivery is not configured this says so and puts
 * the real inbox address in front of the sender, rather than letting them
 * wait on a reply to a message nobody received.
 */

type Result =
  | { kind: "sent" }
  | { kind: "stored"; inbox: string; reason: string }
  | { kind: "error"; message: string };

export function ContactForm({ inbox }: { inbox: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  // Prefill from the signed-in account when there is one, so an owner
  // writing in doesn't have to retype the address we already have.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { user?: { email?: string; name?: string } } | null) => {
        if (cancelled || !j?.user) return;
        if (j.user.email) setEmail((e) => e || j.user!.email!);
        if (j.user.name) setName((n) => n || j.user!.name!);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        delivered?: boolean;
        inbox?: string;
        reason?: string;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setResult({ kind: "error", message: json.error || "Something went wrong. Try again." });
      } else if (json.delivered) {
        setResult({ kind: "sent" });
        setSubject("");
        setMessage("");
      } else {
        setResult({
          kind: "stored",
          inbox: json.inbox || inbox,
          reason: json.reason || "Email delivery isn't switched on yet.",
        });
      }
    } catch {
      setResult({ kind: "error", message: "Could not reach the server. Check your connection." });
    }
    setBusy(false);
  };

  const field =
    "mt-1.5 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-ink/40";

  if (result?.kind === "sent") {
    return (
      <div className="rounded-2xl border border-accent/40 bg-accent/[0.06] p-6">
        <h2 className="text-[15.5px] font-medium">Message sent</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink/80">
          It went to {inbox} and we&apos;ll reply to {email}. Most enquiries get an
          answer within one business day.
        </p>
        <button
          onClick={() => setResult(null)}
          className="mt-4 rounded-full border border-line bg-white px-4 py-2 text-[13px] font-medium transition-colors hover:border-ink/40"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-line bg-white p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-[13px] font-medium">
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Jane Doe"
            className={field}
          />
        </label>
        <label className="block text-[13px] font-medium">
          Email <span className="text-muted">(we reply here)</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            className={field}
          />
        </label>
      </div>

      <label className="block text-[13px] font-medium">
        Subject
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Billing, a page that looks wrong, anything else"
          className={field}
        />
      </label>

      <label className="block text-[13px] font-medium">
        How can we help?
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={6}
          placeholder="If it's about a specific page, paste the URL — it makes this much faster to look into."
          className={`${field} resize-y`}
        />
      </label>

      {result?.kind === "error" && (
        <p className="rounded-xl border border-line bg-paper-warm p-3.5 text-[13px] text-ink/80">
          {result.message}
        </p>
      )}

      {result?.kind === "stored" && (
        <div className="rounded-xl border border-line bg-paper-warm p-3.5 text-[13px] leading-relaxed text-ink/80">
          <p className="font-medium text-ink">Saved, but not emailed yet</p>
          <p className="mt-1">
            {result.reason}{" "}
            Your message is stored and we will see it, but if
            it&apos;s urgent, email{" "}
            <a href={`mailto:${result.inbox}`} className="text-accent underline underline-offset-2">
              {result.inbox}
            </a>{" "}
            directly.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-medium text-white transition-colors hover:bg-accent disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send message"}
        </button>
        <span className="text-[12.5px] text-muted">
          Or email{" "}
          <a href={`mailto:${inbox}`} className="underline underline-offset-2 hover:text-ink">
            {inbox}
          </a>
        </span>
      </div>
    </form>
  );
}
