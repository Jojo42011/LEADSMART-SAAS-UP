"use client";

import { useEffect, useMemo, useState } from "react";
import type { OnboardingData } from "@/lib/onboarding";
import { useAgentPages } from "@/lib/agent-pages";
import {
  buildNapPack,
  directoriesFor,
  CITATION_STATUSES,
  type CitationStatus,
  type Directory,
} from "@/lib/citations";

/**
 * The Citations tab: the compliant version of "register me everywhere".
 *
 * Three pieces, in the order they matter. The NAP pack — one canonical
 * block of business details with copy buttons, because consistency
 * character-for-character across listings is itself the ranking signal.
 * The checklist — the short list of directories that genuinely move
 * local visibility for THIS business, each with the claim link and a
 * status the owner sets. And the honesty line about why the agent
 * doesn't fill the forms itself.
 *
 * Statuses persist server-side (a checklist that resets on a new device
 * teaches people not to trust the checklist); without an engine the tab
 * still renders the pack and the links, minus the checkboxes.
 */

const TIER_LABEL: Record<Directory["tier"], string> = {
  core: "The core six — do these first",
  industry: "Your industry",
  general: "General",
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:border-ink/40 hover:text-ink"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function Citations({ data }: { data: OnboardingData }) {
  const { engine, activeSite } = useAgentPages();
  const siteId = activeSite?.siteId ?? null;

  // The server row is the authority once the engine knows the site; the
  // local onboarding buffer covers preview mode and multi-site drift the
  // same way the header handles siteName.
  const nap = useMemo(
    () =>
      buildNapPack({
        businessName: activeSite?.businessName || data.business.name,
        phone: data.business.phone,
        address: data.business.address,
        city: data.business.city,
        region: data.business.region,
        websiteUrl: activeSite?.url || data.website.url,
        industry: data.market.industry,
        services: data.market.services.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean),
        serviceArea: data.business.serviceArea,
      }),
    [activeSite, data]
  );

  const directories = useMemo(
    () => directoriesFor(data.market.industry, data.market.services),
    [data.market.industry, data.market.services]
  );

  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!engine || !siteId) return;
    let cancelled = false;
    fetch(`/api/citations?siteId=${siteId}`)
      .then((r) => r.json())
      .then((j: { ok?: boolean; statuses?: Record<string, string> }) => {
        if (!cancelled && j.ok && j.statuses) setStatuses(j.statuses);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [engine, siteId]);

  const setStatus = async (directory: string, status: CitationStatus) => {
    // Optimistic: the row is the owner's own claim about their own work,
    // so showing it immediately is honest; a failed write is reported.
    setStatuses((s) => ({ ...s, [directory]: status }));
    setNote(null);
    try {
      const res = await fetch("/api/citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          directory,
          status,
          industry: data.market.industry,
          services: data.market.services,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) setNote(j.error || "Could not save that — try again.");
    } catch {
      setNote("Could not reach the server — the change isn't saved.");
    }
  };

  const liveCount = directories.filter((d) => statuses[d.key] === "live").length;
  const tiers = ["core", "industry", "general"] as const;

  return (
    <div className="grid gap-4">
      {/* The NAP pack */}
      <div className="rounded-2xl border border-line bg-paper p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[14.5px] font-medium">Your listing details, one canonical copy</h2>
          {nap.fields.length > 0 && <CopyButton text={nap.all} label="all details" />}
        </div>
        <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
          Paste these exactly — the same name, address and phone, character
          for character, on every listing. Consistency across listings is
          itself a ranking signal, and a listing that spells anything
          differently reads to an engine as a different business.
        </p>
        {nap.fields.length === 0 ? (
          <p className="mt-4 text-[13px] text-muted">
            Add your business details in Settings and the pack builds itself
            from them.
          </p>
        ) : (
          <dl className="mt-4 grid gap-2.5">
            {nap.fields.map((f) => (
              <div
                key={f.label}
                className="flex items-start justify-between gap-3 rounded-xl border border-line p-3.5"
              >
                <div className="min-w-0">
                  <dt className="label-mono text-muted">{f.label}</dt>
                  <dd className="mt-0.5 break-words text-[13.5px]">{f.value}</dd>
                </div>
                <CopyButton text={f.value} label={f.label} />
              </div>
            ))}
          </dl>
        )}
      </div>

      {/* The checklist */}
      <div className="rounded-2xl border border-line bg-paper p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[14.5px] font-medium">Where to be listed</h2>
          {engine && siteId && (
            <span className="label-mono text-muted">
              {liveCount} of {directories.length} live
            </span>
          )}
        </div>
        <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
          A deliberately short list. Citation value follows a power law —
          one complete, accurate listing on a surface engines actually read
          beats presence on dozens of obscure directories.
        </p>

        {note && (
          <p role="status" className="mt-3 rounded-lg bg-paper-warm px-3 py-2 text-[12.5px] text-ink">
            {note}
          </p>
        )}

        {tiers.map((tier) => {
          const rows = directories.filter((d) => d.tier === tier);
          if (rows.length === 0) return null;
          return (
            <div key={tier} className="mt-5">
              <p className="label-mono text-muted">{TIER_LABEL[tier]}</p>
              <div className="mt-2 grid gap-2">
                {rows.map((d) => (
                  <div
                    key={d.key}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium">{d.name}</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{d.why}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-line px-3 py-1.5 text-[12px] font-medium transition-colors hover:border-ink/40"
                      >
                        Open &rarr;
                      </a>
                      {engine && siteId && (
                        <select
                          aria-label={`${d.name} listing status`}
                          value={statuses[d.key] ?? "todo"}
                          onChange={(e) => setStatus(d.key, e.target.value as CitationStatus)}
                          className="rounded-lg border border-line bg-paper px-2 py-1.5 text-[12px]"
                        >
                          {CITATION_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Why the agent doesn't do this itself — stated once, plainly. */}
        <p className="mt-5 border-t border-line pt-4 text-[12px] leading-relaxed text-muted">
          The agent prepares everything but doesn&apos;t fill the forms itself:
          directories prohibit automated signups, most verify by email or
          phone only you can receive, and Google treats automated directory
          submission as link spam. Fifteen careful minutes per listing with
          the pack above is the version that actually works.
        </p>
      </div>
    </div>
  );
}
