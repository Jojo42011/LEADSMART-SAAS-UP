"use client";

import { useState } from "react";
import { useAgentPages } from "@/lib/agent-pages";

/**
 * Disconnect a connected service, and delete the account.
 *
 * Both exist because the legal pages say they do. The privacy policy
 * tells customers they can disconnect Google, GitHub or Search Console
 * "at any time from your dashboard", and the terms say an account can be
 * deleted from here — neither was true, which is a worse defect than a
 * missing feature: it is a promise made to someone deciding whether to
 * hand over their publishing credentials.
 *
 * Deletion is deliberately awkward. It asks for the account email typed
 * out, states plainly what survives (pages on the customer's own site)
 * and what does not, and reports the counts it removed. An irreversible
 * action that takes one click is a bug waiting for a mis-tap.
 */

type Service = "wordpress" | "github" | "gsc";

const SERVICE_LABEL: Record<Service, string> = {
  wordpress: "WordPress",
  github: "GitHub",
  gsc: "Google Search Console",
};

const SERVICE_NOTE: Record<Service, string> = {
  wordpress:
    "The application password is deleted. The agent stops publishing to this site until you reconnect it.",
  github:
    "The access token and repository are deleted. The agent stops publishing to this site until you reconnect it.",
  gsc: "The token is revoked at Google and deleted here. Your rankings panel stops updating; nothing on your site changes.",
};

export function Connections() {
  const { allSites, activeSite, refresh } = useAgentPages();
  const siteId = activeSite?.siteId ?? null;

  const [busy, setBusy] = useState<Service | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Service | null>(null);

  const disconnect = async (service: Service) => {
    setBusy(service);
    setNotice(null);
    try {
      const res = await fetch("/api/connect/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, service }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; note?: string };
      setNotice(
        json.ok
          ? json.note ?? `${SERVICE_LABEL[service]} disconnected.`
          : json.error ?? "Could not disconnect."
      );
      if (json.ok) refresh();
    } catch {
      setNotice("Could not reach the server. Nothing was changed.");
    }
    setBusy(null);
    setConfirming(null);
  };

  return (
    <div className="grid gap-5">
      <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <h2 className="text-[14.5px] font-medium">Connections</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          {activeSite
            ? `What ${activeSite.businessName || "this site"} is connected to. Disconnecting takes effect immediately.`
            : "Connections appear here once a site is set up."}
        </p>

        {siteId && (
          <div className="mt-4 grid gap-2.5">
            {(Object.keys(SERVICE_LABEL) as Service[]).map((service) => (
              <div
                key={service}
                className="rounded-xl border border-line p-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium">{SERVICE_LABEL[service]}</p>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                      {SERVICE_NOTE[service]}
                    </p>
                  </div>
                  {confirming === service ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => disconnect(service)}
                        disabled={busy !== null}
                        className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-on-ink transition-colors hover:bg-accent disabled:opacity-60"
                      >
                        {busy === service ? "Disconnecting…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => setConfirming(null)}
                        disabled={busy !== null}
                        className="rounded-full border border-line px-3 py-1.5 text-[12px] transition-colors hover:border-ink/40 disabled:opacity-60"
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setConfirming(service);
                        setNotice(null);
                      }}
                      className="shrink-0 rounded-full border border-line px-3.5 py-1.5 text-[12px] transition-colors hover:border-ink/40"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {notice && (
          <p className="mt-4 rounded-xl border border-line bg-paper-warm px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink">
            {notice}
          </p>
        )}
      </div>

      <DeleteAccount siteCount={allSites.length} />
    </div>
  );
}

function DeleteAccount({ siteCount }: { siteCount: number }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: email }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        removed?: { sites: number; pages: number };
      };
      if (!json.ok) {
        setError(json.error ?? "The account was not deleted.");
        setBusy(false);
        return;
      }
      setDone(
        `Account deleted — ${json.removed?.sites ?? 0} site${json.removed?.sites === 1 ? "" : "s"} and ${json.removed?.pages ?? 0} page record${json.removed?.pages === 1 ? "" : "s"} removed. Pages on your own website are untouched.`
      );
      // The session is already cleared server-side; a full reload lands
      // on the signed-out site rather than a dashboard with no account
      // behind it.
      setTimeout(() => {
        window.location.href = "/";
      }, 3500);
    } catch {
      setError("Could not reach the server. Nothing was deleted.");
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <p className="text-[13.5px] leading-relaxed">{done}</p>
        <p className="mt-1.5 text-[12px] text-muted">Signing you out…</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
      <h2 className="text-[14.5px] font-medium">Delete account</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
        Permanently removes your account
        {siteCount === 0 ? "" : siteCount === 1 ? ", your site" : `, all ${siteCount} sites`},
        stored credentials, keyword plans and page records, and cancels your
        subscription. Pages already published to your own website stay live and
        remain yours. This cannot be undone.
      </p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-4 rounded-full border border-line px-4 py-2 text-[12.5px] transition-colors hover:border-ink/40"
        >
          Delete my account
        </button>
      ) : (
        <div className="mt-4">
          <label className="block" htmlFor="confirm-email">
            <span className="text-[12.5px] text-muted">
              Type your account email to confirm.
            </span>
            <input
              id="confirm-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="off"
              className="mt-2 w-full max-w-sm rounded-xl border border-line bg-paper px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-all placeholder:text-muted focus:border-ink focus:ring-4 focus:ring-ink/[0.06]"
            />
          </label>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={remove}
              disabled={busy || email.trim() === ""}
              className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-on-ink transition-colors hover:bg-accent disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setEmail("");
                setError(null);
              }}
              disabled={busy}
              className="rounded-full border border-line px-3.5 py-2 text-[12.5px] transition-colors hover:border-ink/40 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
          {error && (
            <p className="mt-3 rounded-xl border border-line bg-paper-warm px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
