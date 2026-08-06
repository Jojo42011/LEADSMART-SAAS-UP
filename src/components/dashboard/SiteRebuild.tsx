"use client";

import { useEffect, useState } from "react";
import { useAgentPages } from "@/lib/agent-pages";
import { loadIntel } from "@/lib/intel";
import { assessSiteQuality } from "@/lib/site-quality";
import { REBUILD_PRICE } from "@/lib/pricing";

/**
 * The one-click homepage rebuild, on the Settings tab.
 *
 * The walk is the contract: generate a preview (free, repeatable), look
 * at the actual document in an iframe, pay $REBUILD_PRICE once, then —
 * as a separate press — publish. Nothing goes near the live site as a
 * side effect of paying, and the server enforces every step of that
 * order; this component just makes the order visible.
 *
 * The pitch adjusts to evidence. When the site-quality assessment found
 * real problems, the panel leads with them; when the site is fine, the
 * feature is still available but presented as exactly that — available,
 * not urged. Selling a rebuild to someone whose site is good would spend
 * trust the rest of the dashboard works hard to earn.
 */

type RebuildState = {
  status: "none" | "preview" | "paid" | "published";
  liveUrl?: string | null;
  wordpressDraft?: boolean;
  note?: string | null;
};

export function SiteRebuild() {
  const { engine, activeSite } = useAgentPages();
  const siteId = activeSite?.siteId ?? null;

  const [state, setState] = useState<RebuildState>({ status: "none" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const quality = assessSiteQuality(loadIntel().ingest);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    fetch(`/api/rebuild?siteId=${siteId}`)
      .then((r) => r.json())
      .then((j: { ok?: boolean; rebuild?: { status: RebuildState["status"]; liveUrl?: string | null; liveStatus?: string | null } | null }) => {
        if (cancelled || !j.ok) return;
        setState(
          j.rebuild
            ? {
                status: j.rebuild.status,
                liveUrl: j.rebuild.liveUrl,
                wordpressDraft: j.rebuild.liveStatus === "wordpress-draft",
              }
            : { status: "none" }
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  if (!engine || !siteId) return null;

  const call = async (
    label: string,
    url: string,
    init: RequestInit,
    onOk: (json: Record<string, unknown>) => void
  ) => {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(url, init);
      const json = (await res.json()) as Record<string, unknown> & { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) setError(json.error || "Something went wrong.");
      else onOk(json);
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(null);
  };

  const generate = () =>
    call("generate", `/api/rebuild?siteId=${siteId}`, { method: "POST" }, () => {
      setState({ status: "preview" });
      setPreviewOpen(true);
    });

  const pay = () =>
    call(
      "pay",
      "/api/rebuild/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      },
      (json) => {
        if (typeof json.url === "string") {
          // Real Stripe checkout; payment lands via webhook.
          window.location.href = json.url;
        } else {
          // Demo mode paid immediately.
          setState((s) => ({ ...s, status: "paid" }));
        }
      }
    );

  const publish = () =>
    call(
      "publish",
      "/api/rebuild/publish",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      },
      (json) => {
        setState({
          status: "published",
          liveUrl: typeof json.liveUrl === "string" ? json.liveUrl : null,
          wordpressDraft: json.wordpressDraft === true,
          note: typeof json.note === "string" ? json.note : null,
        });
      }
    );

  const btn =
    "rounded-full px-4 py-2 text-[13px] font-medium transition-colors disabled:opacity-60";
  const primary = `${btn} bg-ink text-on-ink hover:bg-accent`;
  const secondary = `${btn} border border-line text-ink hover:border-ink/40 hover:bg-paper-warm`;

  return (
    <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[14.5px] font-medium">Homepage rebuild</h2>
        <span className="label-mono text-muted">${REBUILD_PRICE} one-time</span>
      </div>

      {/* The pitch: findings when there are findings, availability when
          there aren't. Never urgency the evidence doesn't support. */}
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
        {quality.offerRebuild
          ? `${quality.summary} A rebuilt homepage fixes the foundation the agent publishes into — modern, fast, readable by every AI crawler, built from your real business details.`
          : "A fresh, modern homepage built from your real business details — designed to be read by every search and AI crawler. Preview it free; nothing touches your site unless you approve and publish it."}
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        You see the exact page before paying. Publishing never deletes
        anything: on GitHub and FTP the old homepage&apos;s content is kept and
        recoverable, and on WordPress the new page arrives as a draft you
        activate yourself.
      </p>

      {error && (
        <p role="status" className="mt-3 rounded-lg bg-paper-warm px-3 py-2 text-[12.5px] text-ink">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {state.status === "none" && (
          <button onClick={generate} disabled={busy !== null} className={primary}>
            {busy === "generate" ? "Building…" : "Generate a free preview"}
          </button>
        )}

        {state.status === "preview" && (
          <>
            <button onClick={() => setPreviewOpen((o) => !o)} className={secondary}>
              {previewOpen ? "Hide preview" : "View the preview"}
            </button>
            <button onClick={generate} disabled={busy !== null} className={secondary}>
              {busy === "generate" ? "Rebuilding…" : "Regenerate"}
            </button>
            <button onClick={pay} disabled={busy !== null} className={primary}>
              {busy === "pay" ? "Opening checkout…" : `Approve & pay $${REBUILD_PRICE}`}
            </button>
          </>
        )}

        {state.status === "paid" && (
          <>
            <button onClick={() => setPreviewOpen((o) => !o)} className={secondary}>
              {previewOpen ? "Hide preview" : "View the preview"}
            </button>
            <button onClick={publish} disabled={busy !== null} className={primary}>
              {busy === "publish" ? "Publishing…" : "Publish to your site"}
            </button>
            <span className="text-[12px] text-muted">
              Paid. Publishes only when you press this.
            </span>
          </>
        )}

        {state.status === "published" && (
          <p className="text-[13px] leading-relaxed">
            {state.wordpressDraft ? (
              <span className="text-muted">
                {state.note ??
                  "Saved as a draft page in WordPress — set it as your homepage under Settings → Reading when ready."}
              </span>
            ) : state.liveUrl ? (
              <>
                <span className="font-medium">Live.</span>{" "}
                <a
                  href={state.liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline underline-offset-2"
                >
                  See your new homepage &rarr;
                </a>
              </>
            ) : (
              <span className="text-muted">Published.</span>
            )}
          </p>
        )}
      </div>

      {previewOpen && (state.status === "preview" || state.status === "paid") && (
        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          <iframe
            src={`/api/rebuild/preview?siteId=${siteId}`}
            title="Rebuilt homepage preview"
            className="h-[560px] w-full bg-white"
            sandbox=""
          />
        </div>
      )}
    </div>
  );
}
