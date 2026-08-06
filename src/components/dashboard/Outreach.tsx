"use client";

import { useEffect, useState } from "react";
import { useAgentPages, allPages } from "@/lib/agent-pages";
import { CopyButton } from "./Citations";

/**
 * Editorial placements: the outreach engine, Option B shape.
 *
 * The agent researches the outlets worth pitching — the "best <service>
 * in <city>" roundups that already rank, local press, industry
 * associations — and drafts a personal pitch for each. The owner sends
 * it from their own email, in their own name. This panel never sends
 * anything; the deliberate absence of a send button IS the design, and
 * the copy says so rather than leaving it to look unfinished.
 */

type Target = {
  id: string;
  name: string;
  url: string;
  kind: "roundup" | "press" | "association" | "search";
  why: string;
  pitchSubject: string;
  pitchBody: string;
  status: "new" | "pitched" | "replied" | "placed" | "dismissed";
};

const KIND_LABEL: Record<Target["kind"], string> = {
  roundup: "Best-of roundup",
  press: "Local press",
  association: "Association",
  search: "Search to run",
};

const STATUSES: { value: Target["status"]; label: string }[] = [
  { value: "new", label: "New" },
  { value: "pitched", label: "Pitched" },
  { value: "replied", label: "Replied" },
  { value: "placed", label: "Placed" },
  { value: "dismissed", label: "Dismissed" },
];

export function Outreach() {
  const { engine, sites, activeSite } = useAgentPages();
  const siteId = activeSite?.siteId ?? null;
  const hasPublished = allPages(sites).some((p) => p.status === "published" && p.live_url);

  const [targets, setTargets] = useState<Target[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = (id: string) =>
    fetch(`/api/outreach?siteId=${id}`)
      .then((r) => r.json())
      .then((j: { ok?: boolean; targets?: Target[] }) => {
        if (j.ok && j.targets) setTargets(j.targets);
      })
      .catch(() => {});

  useEffect(() => {
    if (!engine || !siteId) return;
    let cancelled = false;
    fetch(`/api/outreach?siteId=${siteId}`)
      .then((r) => r.json())
      .then((j: { ok?: boolean; targets?: Target[] }) => {
        if (!cancelled && j.ok && j.targets) setTargets(j.targets);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [engine, siteId]);

  if (!engine || !siteId) return null;

  const research = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; found?: number; dropped?: number; source?: string };
      if (!j.ok) {
        setNote(j.error || "Research failed — try again in a minute.");
      } else {
        await refresh(siteId);
        const bits = [`Found ${j.found} target${j.found === 1 ? "" : "s"}.`];
        if (j.dropped) bits.push(`${j.dropped} suggestion${j.dropped === 1 ? "" : "s"} dropped for failing the reachability check.`);
        if (j.source === "fallback") bits.push("Live search isn't configured here, so these are the searches worth running yourself.");
        setNote(bits.join(" "));
      }
    } catch {
      setNote("Could not reach the server.");
    }
    setBusy(false);
  };

  const setStatus = async (id: string, status: Target["status"]) => {
    setTargets((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      const res = await fetch("/api/outreach", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) setNote(j.error || "Could not save that status.");
    } catch {
      setNote("Could not reach the server — the change isn't saved.");
    }
  };

  const placed = targets.filter((t) => t.status === "placed").length;
  const visible = targets.filter((t) => t.status !== "dismissed");
  const dismissed = targets.length - visible.length;

  return (
    <div className="rounded-2xl border border-line bg-paper p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[14.5px] font-medium">Editorial placements</h2>
        {targets.length > 0 && (
          <span className="label-mono text-muted">{placed} placed</span>
        )}
      </div>
      <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
        The mentions that actually move AI recommendations: the &quot;best
        &lt;service&gt; in &lt;city&gt;&quot; roundups that already rank, local
        press, industry associations. The agent finds them and writes each
        pitch; you send it from your own email, in your own name — that is
        what editors respond to, and it is why there is no send button here.
      </p>

      {note && (
        <p role="status" className="mt-3 rounded-lg bg-paper-warm px-3 py-2 text-[12.5px] text-ink">
          {note}
        </p>
      )}

      <div className="mt-4">
        <button
          onClick={research}
          disabled={busy || !hasPublished}
          title={
            hasPublished
              ? "Searches for roundups, press and associations worth pitching, and drafts each pitch"
              : "Unlocks once the agent has published a page — a pitch needs something to show an editor."
          }
          className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-on-ink transition-colors hover:bg-accent disabled:opacity-60"
        >
          {busy ? "Researching…" : targets.length ? "Refresh targets" : "Find placement targets"}
        </button>
        {!hasPublished && (
          <span className="ml-3 text-[12px] text-muted">
            Unlocks after the first published page.
          </span>
        )}
      </div>

      {visible.length > 0 && (
        <div className="mt-5 grid gap-2.5">
          {visible.map((t) => (
            <div key={t.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
                    {t.name}
                    <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-[10.5px] font-normal text-muted">
                      {KIND_LABEL[t.kind]}
                    </span>
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">{t.why}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-line px-3 py-1.5 text-[12px] font-medium transition-colors hover:border-ink/40"
                  >
                    Open &rarr;
                  </a>
                  <select
                    aria-label={`${t.name} status`}
                    value={t.status}
                    onChange={(e) => setStatus(t.id, e.target.value as Target["status"])}
                    className="rounded-lg border border-line bg-paper px-2 py-1.5 text-[12px]"
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <details className="group mt-3 border-t border-line pt-3">
                <summary className="cursor-pointer list-none text-[12px] text-muted transition-colors hover:text-ink">
                  <span className="label-mono">
                    The drafted pitch
                    <span className="ml-1.5 inline-block transition-transform group-open:rotate-90">&rsaquo;</span>
                  </span>
                </summary>
                <div className="mt-3 grid gap-2.5">
                  <div className="flex items-start justify-between gap-3 rounded-lg border border-line p-3">
                    <div className="min-w-0">
                      <p className="label-mono text-muted">Subject</p>
                      <p className="mt-0.5 break-words text-[13px]">{t.pitchSubject}</p>
                    </div>
                    <CopyButton text={t.pitchSubject} label={`${t.name} subject`} />
                  </div>
                  <div className="flex items-start justify-between gap-3 rounded-lg border border-line p-3">
                    <div className="min-w-0">
                      <p className="label-mono text-muted">Message</p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                        {t.pitchBody}
                      </p>
                    </div>
                    <CopyButton text={t.pitchBody} label={`${t.name} message`} />
                  </div>
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    Read it before sending — it goes out under your name, so it
                    should sound like you. Find their contact page via Open
                    above, paste, adjust, send.
                  </p>
                </div>
              </details>
            </div>
          ))}
        </div>
      )}

      {dismissed > 0 && (
        <p className="mt-3 text-[11.5px] text-muted">
          {dismissed} dismissed target{dismissed === 1 ? "" : "s"} hidden.
        </p>
      )}
    </div>
  );
}
