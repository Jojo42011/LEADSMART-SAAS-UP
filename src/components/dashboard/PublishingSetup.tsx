"use client";

import { useEffect, useState } from "react";
import type { OnboardingData, Platform } from "@/lib/onboarding";
import { loadIntel, type SiteIngest } from "@/lib/intel";
import { useAgentPages } from "@/lib/agent-pages";
import { ChoiceCard, Field } from "@/components/onboarding/fields";

/**
 * Changing where the agent publishes, after onboarding.
 *
 * Platform was set once in the wizard and then unreachable: Settings
 * carried the business and market answers but nothing about publishing,
 * so anyone who chose wrong — a Vercel-hosted site set up as WordPress,
 * say — had no way to correct it, and the agent kept failing to publish
 * against a platform that could never work.
 *
 * Deliberately no save button of its own. It edits the same onboarding
 * buffer every other Settings card edits, and the tab's existing "Save
 * changes" applies the lot through applySettings → /api/sites →
 * upsertSite, whose update branch already wrote `platform`. A second save
 * path here would be a second place for the two to disagree about what
 * was stored.
 *
 * Changing platform deliberately does NOT trigger a re-plan:
 * marketProfileOf covers the market answers the keyword plan is derived
 * from, and where a page is delivered is not one of them. Switching host
 * should not throw away the queue.
 */

const PLATFORM_LABEL: Record<Platform, string> = {
  wordpress: "WordPress",
  github: "GitHub repository",
  ftp: "FTP / SFTP",
};

export function PublishingSetup({
  data,
  update,
}: {
  data: OnboardingData;
  update: (patch: Partial<OnboardingData>) => void;
}) {
  const p = data.publishing;
  const set = (patch: Partial<typeof p>) => update({ publishing: { ...p, ...patch } });
  const platform = data.website.platform;
  const { activeSite } = useAgentPages();

  // What the site scan found, read back from the intel snapshot — the
  // same evidence the wizard uses to warn before a doomed connection.
  const [ingest, setIngest] = useState<SiteIngest | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage, browser-only
    setIngest(loadIntel().ingest ?? null);
  }, []);

  const [repos, setRepos] = useState<{ fullName: string; defaultBranch: string }[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [ghConnected, setGhConnected] = useState<boolean | null>(null);
  const [ghLogin, setGhLogin] = useState("");

  // The GitHub OAuth token lives in an httpOnly cookie, so the only way to
  // know whether it is still there is to ask.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/github/repos")
      .then((r) => r.json())
      .then((j: { connected?: boolean; login?: string; repos?: { fullName: string; defaultBranch: string }[] }) => {
        if (cancelled) return;
        setGhConnected(Boolean(j.connected));
        if (j.connected) {
          setRepos(j.repos || []);
          setGhLogin(j.login || "");
        }
      })
      .catch(() => {
        if (!cancelled) setGhConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (platform !== "github" || !p.githubRepo) return;
    let cancelled = false;
    fetch(`/api/github/branches?repo=${encodeURIComponent(p.githubRepo)}`)
      .then((r) => r.json())
      .then((j: { branches?: string[] }) => {
        if (!cancelled) setBranches(j.branches || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [platform, p.githubRepo]);

  const [test, setTest] = useState<{ state: "idle" | "busy" | "ok" | "fail"; msg: string }>({
    state: "idle",
    msg: "",
  });

  const testWordpress = async () => {
    setTest({ state: "busy", msg: "" });
    try {
      const res = await fetch("/api/connect/wordpress/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site: data.website.url, user: p.wpUser, appPassword: p.wpAppPassword }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string; name?: string };
      setTest(
        j.ok
          ? { state: "ok", msg: `Verified — signed in as ${j.name || p.wpUser}.` }
          : { state: "fail", msg: j.error || "The connection test failed." }
      );
    } catch {
      setTest({ state: "fail", msg: "Could not reach the server to run the test." });
    }
  };

  const testFtp = async () => {
    setTest({ state: "busy", msg: "" });
    try {
      const res = await fetch("/api/connect/ftp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: p.ftpHost,
          port: p.ftpPort,
          user: p.ftpUser,
          password: p.ftpPassword,
          protocol: p.ftpProtocol,
          root: p.ftpRoot,
        }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string };
      setTest(
        j.ok
          ? { state: "ok", msg: "Connected — the web root is reachable and writable." }
          : { state: "fail", msg: j.error || "The connection test failed." }
      );
    } catch {
      setTest({ state: "fail", msg: "Could not reach the server to run the test." });
    }
  };

  // The stored platform, as the engine currently has it. Differs from the
  // picker the moment someone changes it and before they save, which is
  // exactly when they need telling that nothing has happened yet.
  const storedPlatform = activeSite?.platform as Platform | undefined;
  const changed = Boolean(storedPlatform && storedPlatform !== platform);

  // The same mismatch evidence the wizard uses: the scan probed /wp-json/
  // and the HTML, so "no WordPress found" is a real finding, not a guess.
  const wpMismatch = platform === "wordpress" && ingest?.ok && ingest.platform !== "wordpress";
  const suggests =
    ingest?.platform === "vercel" || ingest?.platform === "netlify" || ingest?.platform === "lovable";

  return (
    <div className="rounded-2xl border border-line bg-paper p-6 sm:p-8">
      <h2 className="text-[14.5px] font-medium">Where we publish</h2>
      <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
        How the agent delivers finished pages to your site.
        {storedPlatform && (
          <> Currently set to <span className="text-ink">{PLATFORM_LABEL[storedPlatform]}</span>.</>
        )}{" "}
        Changing this doesn&apos;t affect your keyword plan or the pages already
        published — only where the next ones are delivered.
      </p>

      <div role="group" aria-labelledby="publish-platform" className="mt-5 grid gap-3">
        <span id="publish-platform" className="sr-only">
          Publishing platform
        </span>
        <ChoiceCard
          selected={platform === "wordpress"}
          onClick={() => update({ website: { ...data.website, platform: "wordpress" } })}
          title="WordPress"
          text="Published through the WordPress REST API. Works with any theme or page builder."
        />
        <ChoiceCard
          selected={platform === "github"}
          onClick={() => update({ website: { ...data.website, platform: "github" } })}
          title="Static site on GitHub"
          text="Committed straight into the repository your site deploys from. Vercel, Netlify, Lovable and Cursor-built sites all live here."
        />
        <ChoiceCard
          selected={platform === "ftp"}
          onClick={() => update({ website: { ...data.website, platform: "ftp" } })}
          title="Any other host (FTP/SFTP)"
          text="GoDaddy, HostGator, cPanel hosting, a plain VPS — anywhere with FTP access."
        />
      </div>

      {/* The guard that exists because a Vercel-hosted site set up as
          WordPress is exactly how someone ends up here. */}
      {wpMismatch && (
        <div className="mt-4 rounded-xl border border-ink/30 bg-paper-warm p-4">
          <p className="text-[13px] font-medium">
            We couldn&apos;t find WordPress at {data.website.url.replace(/^https?:\/\//, "")}
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            The site scan checked the page and its <code>/wp-json/</code> endpoint
            and found no WordPress.{" "}
            {suggests
              ? "It builds from a repository, so GitHub is the route that works here."
              : "Choose GitHub if it deploys from a repository, or FTP/SFTP for traditional hosting."}
          </p>
        </div>
      )}

      <div className="mt-5 grid gap-5">
        {platform === "wordpress" && (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="WordPress username"
                value={p.wpUser}
                onChange={(e) => set({ wpUser: e.target.value })}
              />
              <Field
                label="Application password"
                type="password"
                hint="Users → Profile → Application Passwords in WordPress."
                value={p.wpAppPassword}
                onChange={(e) => set({ wpAppPassword: e.target.value })}
              />
            </div>
            <TestRow
              onTest={testWordpress}
              disabled={!p.wpUser.trim() || !p.wpAppPassword.trim()}
              test={test}
            />
          </>
        )}

        {platform === "github" && (
          <>
            {ghConnected ? (
              <>
                <p className="text-[12.5px] text-muted">
                  GitHub connected{ghLogin ? ` as ${ghLogin}` : ""}. Pick the
                  repository your live site is built from.
                </p>
                <label className="block">
                  <span className="text-[13px] font-medium text-ink">Repository</span>
                  <select
                    value={p.githubRepo}
                    onChange={(e) => {
                      const fullName = e.target.value;
                      const chosen = repos.find((r) => r.fullName === fullName);
                      setBranches([]);
                      set({ githubRepo: fullName, githubBranch: chosen?.defaultBranch || "" });
                    }}
                    className="mt-2 w-full rounded-xl border border-line bg-paper px-4 py-3 text-[14.5px] text-ink outline-none transition-all focus:border-ink focus:ring-4 focus:ring-ink/[0.06]"
                  >
                    <option value="">Choose the repository</option>
                    {repos.map((r) => (
                      <option key={r.fullName} value={r.fullName}>
                        {r.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                {p.githubRepo && (
                  <label className="block">
                    <span className="text-[13px] font-medium text-ink">Branch</span>
                    <select
                      value={p.githubBranch}
                      onChange={(e) => set({ githubBranch: e.target.value })}
                      className="mt-2 w-full rounded-xl border border-line bg-paper px-4 py-3 text-[14.5px] text-ink outline-none transition-all focus:border-ink focus:ring-4 focus:ring-ink/[0.06]"
                    >
                      {branches.length === 0 && (
                        <option value={p.githubBranch}>{p.githubBranch || "default branch"}</option>
                      )}
                      {branches.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1.5 block text-[12px] text-muted">
                      The branch your host deploys from.
                    </span>
                  </label>
                )}
              </>
            ) : (
              <>
                {/* flow=dashboard so the callback returns here rather than
                    dropping the owner back into onboarding. */}
                <a
                  href="/api/connect/github/start?flow=dashboard"
                  className="inline-flex w-fit items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-medium text-on-ink transition-colors hover:bg-accent"
                >
                  Connect GitHub
                  <span aria-hidden="true">&rarr;</span>
                </a>
                <p className="text-[12px] text-muted">
                  Or enter a personal access token with repository contents
                  access:
                </p>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Repository"
                    placeholder="owner/repo"
                    value={p.githubRepo}
                    onChange={(e) => set({ githubRepo: e.target.value })}
                  />
                  <Field
                    label="Access token"
                    type="password"
                    value={p.githubToken}
                    onChange={(e) => set({ githubToken: e.target.value })}
                  />
                </div>
                <Field
                  label="Branch"
                  optional
                  hint="Leave blank for the repository's default branch."
                  value={p.githubBranch}
                  onChange={(e) => set({ githubBranch: e.target.value })}
                />
              </>
            )}
          </>
        )}

        {platform === "ftp" && (
          <>
            <Field
              label="Server"
              placeholder="ftp.yoursite.com"
              hint="From your host's FTP Accounts page."
              value={p.ftpHost}
              onChange={(e) => set({ ftpHost: e.target.value })}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-[13px] font-medium text-ink">Connection type</span>
                <select
                  value={p.ftpProtocol}
                  onChange={(e) => set({ ftpProtocol: e.target.value as typeof p.ftpProtocol })}
                  className="mt-2 w-full rounded-xl border border-line bg-paper px-4 py-3 text-[14.5px] text-ink outline-none transition-all focus:border-ink focus:ring-4 focus:ring-ink/[0.06]"
                >
                  <option value="ftps">FTPS — encrypted (recommended)</option>
                  <option value="sftp">SFTP — over SSH, port 22</option>
                  <option value="ftp">Plain FTP — unencrypted, last resort</option>
                </select>
              </label>
              <Field
                label="Port"
                optional
                inputMode="numeric"
                placeholder={p.ftpProtocol === "sftp" ? "22" : "21"}
                value={p.ftpPort}
                onChange={(e) => set({ ftpPort: e.target.value })}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Username" value={p.ftpUser} onChange={(e) => set({ ftpUser: e.target.value })} />
              <Field
                label="Password"
                type="password"
                value={p.ftpPassword}
                onChange={(e) => set({ ftpPassword: e.target.value })}
              />
            </div>
            <Field
              label="Web root folder"
              optional
              placeholder="public_html"
              hint="The folder that serves your site. Blank means the login already lands there."
              value={p.ftpRoot}
              onChange={(e) => set({ ftpRoot: e.target.value })}
            />
            <TestRow
              onTest={testFtp}
              disabled={!p.ftpHost.trim() || !p.ftpUser.trim() || !p.ftpPassword.trim()}
              test={test}
            />
          </>
        )}
      </div>

      {changed && (
        <p className="mt-5 rounded-xl border border-line bg-paper-warm p-3.5 text-[12.5px] leading-relaxed text-ink/80">
          <span className="font-medium">Not saved yet.</span> Press{" "}
          <span className="font-medium">Save changes</span> below to switch this
          site from {PLATFORM_LABEL[storedPlatform as Platform]} to{" "}
          {PLATFORM_LABEL[platform as Platform]}. Your{" "}
          {PLATFORM_LABEL[storedPlatform as Platform]} credentials stay stored
          until you remove them under Connections below.
        </p>
      )}
    </div>
  );
}

function TestRow({
  onTest,
  disabled,
  test,
}: {
  onTest: () => void;
  disabled: boolean;
  test: { state: "idle" | "busy" | "ok" | "fail"; msg: string };
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onTest}
        disabled={test.state === "busy" || disabled}
        className="rounded-full border border-line bg-paper px-4 py-2 text-[12.5px] font-medium transition-colors hover:border-ink/40 disabled:opacity-60"
      >
        {test.state === "busy" ? "Testing…" : "Test the connection"}
      </button>
      {/* Proving credentials before saving them is the whole point: "saved"
          and "the agent can publish here" are different facts. */}
      <span role="status" aria-live="polite" className="text-[12.5px] text-muted">
        {test.state === "ok" || test.state === "fail" ? test.msg : ""}
      </span>
    </div>
  );
}
