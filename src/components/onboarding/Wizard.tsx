"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Wordmark } from "@/components/ui/Wordmark";
import { type OnboardingData, useOnboarding, loadOnboarding, saveOnboarding } from "@/lib/onboarding";
import { loadBilling } from "@/lib/billing";
import { loadIntel, saveIntel, type SiteIngest } from "@/lib/intel";
import { buildPlan } from "@/lib/plan";
import { normalizeGithubRepo } from "@/lib/github-repo";
import { site } from "@/lib/site";
import { ChoiceCard, Field, StepHeading } from "./fields";

const STEP_KEY = "onboarding.step";

const steps = [
  { key: "business", label: "Business" },
  { key: "website", label: "Website" },
  { key: "publishing", label: "Publishing" },
  { key: "searchconsole", label: "Rankings" },
  { key: "market", label: "Market" },
  { key: "launch", label: "Launch" },
] as const;

const ease = [0.21, 0.47, 0.32, 0.98] as const;

export function Wizard() {
  const router = useRouter();
  const [data, update] = useOnboarding();
  const [step, setStep] = useState(0);
  const [launching, setLaunching] = useState(false);
  const handledCallback = useRef(false);

  // Handle returns from connect flows (WordPress application password
  // authorization and GitHub OAuth) and restore the saved step, so the
  // user lands back exactly where they left, already connected.
  /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from URL callback params and sessionStorage, both browser-only; runs exactly once on mount, same pattern as useOnboarding */
  useEffect(() => {
    if (handledCallback.current) return;
    handledCallback.current = true;

    // Onboarding is unlocked by checkout. Swaps to a server side
    // subscription check when Stripe is attached.
    if (!loadBilling().active) {
      router.replace("/checkout");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const wpLogin = params.get("user_login");
    const wpPassword = params.get("password");
    const github = params.get("github");
    const gsc = params.get("gsc");
    const saved = Number(window.sessionStorage.getItem(STEP_KEY) || "0");

    if (wpLogin && wpPassword) {
      const current = loadOnboarding();
      saveOnboarding({
        ...current,
        publishing: { ...current.publishing, wpUser: wpLogin, wpAppPassword: wpPassword },
      });
      // useOnboarding hydrated from the pre-callback snapshot; re-apply so
      // the connected state renders immediately.
      update({ publishing: { ...current.publishing, wpUser: wpLogin, wpAppPassword: wpPassword } });
      setStep(2);
    } else if (github === "connected") {
      const current = loadOnboarding();
      update({ publishing: { ...current.publishing, githubOauth: true } });
      setStep(2);
    } else if (gsc === "connected") {
      const current = loadOnboarding();
      update({ searchConsole: { ...current.searchConsole, connected: true, skipped: false } });
      setStep(3);
    } else if (gsc) {
      // Connect failed or was cancelled; return to the step to choose again.
      setStep(3);
    } else if (!Number.isNaN(saved) && saved > 0 && saved < steps.length) {
      setStep(saved);
    }

    if (wpLogin || github || gsc) {
      window.history.replaceState({}, "", "/onboarding");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount by design
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    window.sessionStorage.setItem(STEP_KEY, String(step));
  }, [step]);

  const canContinue = useMemo(() => {
    switch (steps[step].key) {
      case "business":
        return data.business.name.trim() !== "" && data.business.city.trim() !== "";
      case "website":
        return data.website.url.trim() !== "" && data.website.platform !== null;
      case "publishing":
        if (data.website.platform === "wordpress")
          return data.publishing.wpUser.trim() !== "" && data.publishing.wpAppPassword.trim() !== "";
        if (data.website.platform === "github")
          return (
            data.publishing.githubRepo.trim() !== "" &&
            (data.publishing.githubOauth || data.publishing.githubToken.trim() !== "")
          );
        return false;
      case "searchconsole":
        return data.searchConsole.connected || data.searchConsole.skipped;
      case "market":
        return data.market.industry.trim() !== "" && data.market.services.trim() !== "";
      default:
        return true;
    }
  }, [step, data]);

  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  if (launching) return <LaunchSequence data={data} onDone={() => router.push("/dashboard")} />;

  return (
    <div className="flex min-h-screen bg-paper-warm">
      {/* Progress rail */}
      <aside className="hidden w-72 shrink-0 flex-col justify-between border-r border-line bg-white px-8 py-8 lg:flex">
        <div>
          <Wordmark />
          <nav aria-label="Setup steps" className="mt-14 flex flex-col gap-1">
            {steps.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <button
                  key={s.key}
                  onClick={() => i < step && setStep(i)}
                  disabled={i > step}
                  // Current step was signalled by background colour only.
                  aria-current={active ? "step" : undefined}
                  className={`flex items-center gap-3.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    active ? "bg-paper-warm" : done ? "hover:bg-paper-warm" : ""
                  } ${i > step ? "cursor-default" : ""}`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition-colors ${
                      done
                        ? "border-ink bg-ink text-white"
                        : active
                          ? "border-accent text-accent"
                          : "border-line text-muted/60"
                    }`}
                  >
                    {done ? (
                      <>
                        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="m3.5 8.5 3 3L12.5 5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="sr-only">Completed: </span>
                      </>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span
                    className={`text-[13.5px] ${
                      active ? "font-medium text-ink" : done ? "text-ink/70" : "text-muted/60"
                    }`}
                  >
                    {s.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
        <p className="text-[12px] leading-relaxed text-muted/70">
          Everything you enter here configures your agent. You can change any
          of it later in settings.
        </p>
      </aside>

      {/* Step content */}
      <div className="flex min-h-screen flex-1 flex-col">
        {/* Mobile progress */}
        <div className="flex items-center justify-between border-b border-line bg-white px-6 py-4 lg:hidden">
          <Wordmark />
          <span className="label-mono text-muted">
            {step + 1} / {steps.length}
          </span>
        </div>
        <div className="h-[2px] w-full bg-line lg:hidden">
          <div
            className="h-full bg-accent transition-all duration-500"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-14">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease }}
            >
              {steps[step].key === "business" && <BusinessStep data={data} update={update} />}
              {steps[step].key === "website" && <WebsiteStep data={data} update={update} />}
              {steps[step].key === "publishing" && <PublishingStep data={data} update={update} />}
              {steps[step].key === "searchconsole" && <SearchConsoleStep data={data} update={update} />}
              {steps[step].key === "market" && <MarketStep data={data} update={update} />}
              {steps[step].key === "launch" && <LaunchStep data={data} update={update} />}
            </motion.div>
          </AnimatePresence>

          <div className="mt-10 flex items-center justify-between">
            <button
              onClick={back}
              className={`text-[14px] text-muted transition-colors hover:text-ink ${
                step === 0 ? "invisible" : ""
              }`}
            >
              &larr; Back
            </button>
            {steps[step].key === "launch" ? (
              <button
                onClick={() => setLaunching(true)}
                className="group inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-ink"
              >
                Launch my agent
                <span className="transition-transform duration-200 group-hover:translate-x-1">&rarr;</span>
              </button>
            ) : (
              <button
                onClick={next}
                disabled={!canContinue}
                className="group inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3 text-[14.5px] font-medium text-white transition-all hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
              >
                Continue
                <span className="transition-transform duration-200 group-hover:translate-x-0.5">&rarr;</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Steps ---------- */

type StepProps = {
  data: OnboardingData;
  update: (patch: Partial<OnboardingData>) => void;
};

function BusinessStep({ data, update }: StepProps) {
  const b = data.business;
  const set = (patch: Partial<typeof b>) => update({ business: { ...b, ...patch } });
  return (
    <div>
      <StepHeading
        eyebrow="Step 1"
        title={<>Tell us about your business.</>}
        sub="This becomes the single source of truth for your name, phone and address across every page the agent publishes. Consistency here is a ranking signal."
      />
      <div className="mt-8 grid gap-5">
        <Field
          label="Business name"
          placeholder="Summit Custom Pools"
          value={b.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Phone"
            optional
            hint="Shown on every page and included in your business schema markup."
            placeholder="(480) 555 0184"
            value={b.phone}
            onChange={(e) => set({ phone: e.target.value })}
          />
          <Field
            label="Street address"
            optional
            placeholder="4280 N Scottsdale Rd"
            value={b.address}
            onChange={(e) => set({ address: e.target.value })}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="City"
            placeholder="Scottsdale"
            value={b.city}
            onChange={(e) => set({ city: e.target.value })}
          />
          <Field
            label="State or region"
            optional
            placeholder="Arizona"
            value={b.region}
            onChange={(e) => set({ region: e.target.value })}
          />
        </div>
        <Field
          label="Service area"
          optional
          hint="Cities or neighborhoods you serve, separated by commas. The agent builds location pages from these."
          placeholder="Scottsdale, Paradise Valley, Tempe, Chandler"
          value={b.serviceArea}
          onChange={(e) => set({ serviceArea: e.target.value })}
        />
      </div>
    </div>
  );
}

function WebsiteStep({ data, update }: StepProps) {
  const w = data.website;
  const set = (patch: Partial<typeof w>) => update({ website: { ...w, ...patch } });
  const [studying, setStudying] = useState(false);
  const [ingest, setIngest] = useState<SiteIngest | null>(null);
  const lastStudied = useRef("");

  const study = async () => {
    const url = w.url.trim();
    if (!url || url === lastStudied.current) return;
    lastStudied.current = url;
    setStudying(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = (await res.json()) as SiteIngest;
      setIngest(json);
      if (json.ok) {
        saveIntel({ ingest: json });
        if (json.platform === "wordpress" && !w.platform) set({ platform: "wordpress" });
      }
    } catch {
      setIngest(null);
    } finally {
      setStudying(false);
    }
  };

  return (
    <div>
      <StepHeading
        eyebrow="Step 2"
        title={<>Where do we publish?</>}
        sub="Point the agent at your live site. It reads the site immediately: brand, structure, platform. Pages publish directly there, so the equity stays yours."
      />
      <div className="mt-8 grid gap-5">
        <Field
          label="Website URL"
          placeholder="https://summitcustompools.com"
          type="url"
          value={w.url}
          onChange={(e) => set({ url: e.target.value })}
          onBlur={study}
        />

        {studying && (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-4">
            <span className="h-4 w-4 shrink-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            <p className="text-[13px] text-muted">Reading your site: brand, structure, platform</p>
          </div>
        )}

        {!studying && ingest?.ok && (
          <div className="rounded-xl border border-line bg-white p-5">
            <p className="label-mono text-accent">Site studied</p>
            <div className="mt-3 grid gap-1.5 text-[13px]">
              {ingest.title && (
                <p className="truncate">
                  <span className="text-muted">Title </span>
                  <span className="font-medium">{ingest.title}</span>
                </p>
              )}
              {ingest.platform !== "unknown" && (
                <p>
                  <span className="text-muted">Platform </span>
                  <span className="font-medium">
                    {ingest.platform === "wordpress" ? "WordPress detected" : "Static site"}
                  </span>
                </p>
              )}
              {ingest.pageCount !== null && (
                <p>
                  <span className="text-muted">Pages in sitemap </span>
                  <span className="font-medium">{ingest.pageCount}</span>
                </p>
              )}
              {ingest.colors.length > 0 && (
                <p className="flex items-center gap-2">
                  <span className="text-muted">Brand colors</span>
                  {ingest.colors.slice(0, 5).map((c) => (
                    <span key={c} className="h-3.5 w-3.5 rounded-full border border-line" style={{ background: c }} />
                  ))}
                </p>
              )}
            </div>
          </div>
        )}

        <div role="group" aria-labelledby="platform-label" className="grid gap-3">
          <span id="platform-label" className="text-[13px] font-medium text-ink">Platform</span>
          <ChoiceCard
            selected={w.platform === "wordpress"}
            onClick={() => set({ platform: "wordpress" })}
            title="WordPress"
            text="One click connect. We publish through the WordPress REST API. Works with any theme or page builder."
          />
          <ChoiceCard
            selected={w.platform === "github"}
            onClick={() => set({ platform: "github" })}
            title="Static site on GitHub"
            text="Sign in with GitHub and pick the repository. We commit pages straight into it."
          />
        </div>
      </div>
    </div>
  );
}

function PublishingStep({ data, update }: StepProps) {
  const p = data.publishing;
  const set = (patch: Partial<typeof p>) => update({ publishing: { ...p, ...patch } });
  const isWp = data.website.platform === "wordpress";
  const [manual, setManual] = useState(false);
  const [repos, setRepos] = useState<{ fullName: string; defaultBranch: string }[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [ghLogin, setGhLogin] = useState("");
  const [connecting, setConnecting] = useState(false);

  const wpConnected = Boolean(p.wpUser && p.wpAppPassword);
  const ghConnected = p.githubOauth || Boolean(p.githubRepo && p.githubToken);

  // After GitHub OAuth, load the repo list for the picker.
  useEffect(() => {
    if (!isWp && p.githubOauth && repos.length === 0) {
      fetch("/api/github/repos")
        .then((r) => r.json())
        .then((j: { connected: boolean; login?: string; repos?: { fullName: string; defaultBranch: string }[] }) => {
          if (j.connected) {
            setRepos(j.repos || []);
            setGhLogin(j.login || "");
          }
        })
        .catch(() => {});
    }
  }, [isWp, p.githubOauth, repos.length]);

  // Once a repository is chosen, load its branches so the owner can point
  // the agent at the branch their live site actually deploys from.
  useEffect(() => {
    if (isWp || !p.githubOauth || !p.githubRepo) return;
    let cancelled = false;
    fetch(`/api/github/branches?repo=${encodeURIComponent(p.githubRepo)}`)
      .then((r) => r.json())
      .then((j: { branches?: string[]; defaultBranch?: string }) => {
        if (cancelled) return;
        setBranches(j.branches || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isWp, p.githubOauth, p.githubRepo]);

  const connectWordpress = () => {
    const raw = data.website.url.trim();
    if (!raw) return;
    const origin = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const successUrl = `${window.location.origin}/onboarding`;
    const url = new URL("/wp-admin/authorize-application.php", origin);
    url.searchParams.set("app_name", site.name);
    url.searchParams.set("success_url", successUrl);
    window.location.href = url.toString();
  };

  const connectGithub = async () => {
    setConnecting(true);
    try {
      const probe = await fetch("/api/connect/github/start", { redirect: "manual" });
      if (probe.status === 503) {
        setManual(true);
        setConnecting(false);
        return;
      }
      window.location.href = "/api/connect/github/start";
    } catch {
      window.location.href = "/api/connect/github/start";
    }
  };

  return (
    <div>
      <StepHeading
        eyebrow="Step 3"
        title={<>Connect publishing.</>}
        sub={
          isWp
            ? "One click. You sign in on your own WordPress site and approve the connection. No passwords are typed here and you can revoke access from WordPress at any time."
            : "Sign in with GitHub and pick the repository your site lives in. We request access to repository contents only."
        }
      />
      <div className="mt-8 grid gap-5">
        {isWp ? (
          wpConnected ? (
            <ConnectedCard
              title="WordPress connected"
              detail={`Signed in as ${p.wpUser}. The agent can now publish pages to your site.`}
              onDisconnect={() => set({ wpUser: "", wpAppPassword: "" })}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={connectWordpress}
                disabled={!data.website.url.trim()}
                className="group flex w-full items-center justify-between rounded-xl border border-ink bg-ink p-5 text-left text-white transition-colors hover:bg-accent hover:border-accent disabled:opacity-40"
              >
                <span className="flex items-center gap-3.5">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 1.5c2.13 0 4.08.79 5.57 2.09-.36-.02-.7.05-.7.05-.79.05-.9 1.12-.16 1.17 0 0 .74.06 1.22.1l1.72 4.7-2.17 6.49-3.61-10.74c.48-.03 1.16-.1 1.16-.1.75-.09.66-1.16-.09-1.12 0 0-1.64.13-2.7.13-1 0-2.67-.13-2.67-.13-.75-.04-.84 1.08-.09 1.12 0 0 .52.07 1.09.1l1.61 4.41-2.26 6.77L6.4 6.91c.49-.03 1.17-.1 1.17-.1.75-.09.66-1.16-.09-1.12 0 0-.5.04-.95.06A8.47 8.47 0 0 1 12 3.5Zm8.5 8.5c0 3.14-1.71 5.88-4.24 7.35l2.6-7.51c.44-1.21.64-2.17.64-3.03 0-.24-.01-.47-.04-.68.71 1.16 1.04 2.46 1.04 3.87Zm-12.66 7.72A8.5 8.5 0 0 1 3.5 12c0-1.24.26-2.42.74-3.48l3.6 9.2Zm4.36-3.55 2.53 6.51c-.86.27-1.77.42-2.73.42-.8 0-1.58-.11-2.32-.3l2.52-6.63Z" />
                  </svg>
                  <span>
                    <span className="block text-[15px] font-medium">Connect WordPress</span>
                    <span className="block text-[12.5px] text-white/60">
                      Opens {data.website.url.replace(/^https?:\/\//, "") || "your site"} to approve access
                    </span>
                  </span>
                </span>
                <span className="text-lg transition-transform duration-200 group-hover:translate-x-1">&rarr;</span>
              </button>
              <button
                type="button"
                onClick={() => setManual(!manual)}
                className="text-left text-[12.5px] text-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Or enter an application password manually
              </button>
              {manual && (
                <>
                  <Field
                    label="WordPress username"
                    placeholder="admin"
                    value={p.wpUser}
                    onChange={(e) => set({ wpUser: e.target.value })}
                  />
                  <Field
                    label="Application password"
                    type="password"
                    placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                    hint="Created under Users, Profile, Application Passwords in WordPress."
                    value={p.wpAppPassword}
                    onChange={(e) => set({ wpAppPassword: e.target.value })}
                  />
                </>
              )}
            </>
          )
        ) : ghConnected && p.githubOauth ? (
          <>
            <ConnectedCard
              title="GitHub connected"
              detail={ghLogin ? `Signed in as ${ghLogin}. Pick the repository your site lives in.` : "Signed in. Pick the repository your site lives in."}
              onDisconnect={() => {
                set({ githubOauth: false, githubRepo: "", githubBranch: "" });
                setRepos([]);
                setBranches([]);
              }}
            />
            <label className="block">
              <span className="text-[13px] font-medium text-ink">Repository</span>
              <select
                value={p.githubRepo}
                onChange={(e) => {
                  const fullName = e.target.value;
                  // Preselect the repo's default branch; the picker below
                  // lets the owner change it if the site deploys elsewhere.
                  const chosen = repos.find((r) => r.fullName === fullName);
                  setBranches([]);
                  set({ githubRepo: fullName, githubBranch: chosen?.defaultBranch || "" });
                }}
                className="mt-2 w-full rounded-xl border border-line bg-white px-4 py-3 text-[14.5px] text-ink outline-none transition-all focus:border-ink focus:ring-4 focus:ring-ink/[0.06]"
              >
                <option value="">Choose the repository</option>
                {repos.map((r) => (
                  <option key={r.fullName} value={r.fullName}>
                    {r.fullName}
                  </option>
                ))}
              </select>
              <span className="mt-1.5 block text-[12px] text-muted">
                The repository your live site is built and hosted from.
              </span>
            </label>
            {p.githubRepo && (
              <label className="block">
                <span className="text-[13px] font-medium text-ink">Branch</span>
                <select
                  value={p.githubBranch}
                  onChange={(e) => set({ githubBranch: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-line bg-white px-4 py-3 text-[14.5px] text-ink outline-none transition-all focus:border-ink focus:ring-4 focus:ring-ink/[0.06]"
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
                  The branch your host deploys — pages the agent publishes here go live.
                </span>
              </label>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={connectGithub}
              disabled={connecting}
              className="group flex w-full items-center justify-between rounded-xl border border-ink bg-ink p-5 text-left text-white transition-colors hover:bg-accent hover:border-accent disabled:opacity-60"
            >
              <span className="flex items-center gap-3.5">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-.89-.01-1.74-2.78.62-3.37-1.37-3.37-1.37-.45-1.19-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 2.5-.35c.85 0 1.71.12 2.5.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.05 10.05 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
                </svg>
                <span>
                  <span className="block text-[15px] font-medium">
                    {connecting ? "Opening GitHub" : "Sign in with GitHub"}
                  </span>
                  <span className="block text-[12.5px] text-white/60">
                    Approve once, then pick your repository from a list
                  </span>
                </span>
              </span>
              <span className="text-lg transition-transform duration-200 group-hover:translate-x-1">&rarr;</span>
            </button>
            <button
              type="button"
              onClick={() => setManual(!manual)}
              className="text-left text-[12.5px] text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Or enter a repository and access token manually
            </button>
            {manual && (
              <>
                <Field
                  label="Repository"
                  placeholder="yourname/your-site"
                  hint="Paste the repository URL or type owner/repo."
                  value={p.githubRepo}
                  // Normalized on the way in so a pasted browser URL becomes
                  // owner/repo, which is what the publish API needs.
                  onChange={(e) => set({ githubRepo: normalizeGithubRepo(e.target.value) })}
                />
                <Field
                  label="Branch"
                  optional
                  placeholder="main"
                  hint="The branch your host deploys. Leave blank to use the repository's default branch."
                  value={p.githubBranch}
                  onChange={(e) => set({ githubBranch: e.target.value.trim() })}
                />
                <Field
                  label="Access token"
                  type="password"
                  placeholder="github_pat_..."
                  hint="Needs content write access to this one repository only."
                  value={p.githubToken}
                  onChange={(e) => set({ githubToken: e.target.value })}
                />
              </>
            )}
          </>
        )}
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-muted">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-ink/60" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 1 1 8 0v3" />
            </svg>
            Access is scoped to publishing only, held in secure storage, and
            revocable from your own account at any time. Nothing is ever
            deleted or modified without a record.
          </p>
        </div>
      </div>
    </div>
  );
}

function ConnectedCard({
  title,
  detail,
  onDisconnect,
}: {
  title: string;
  detail: string;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m3.5 8.5 3 3L12.5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div>
          <p className="flex items-center gap-2 text-[14.5px] font-medium">
            {title}
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-livepulse" />
          </p>
          <p className="mt-0.5 text-[13px] text-muted">{detail}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDisconnect}
        className="shrink-0 text-[12.5px] text-muted hover:text-ink"
      >
        Disconnect
      </button>
    </div>
  );
}

function SearchConsoleStep({ data, update }: StepProps) {
  const sc = data.searchConsole;
  const set = (patch: Partial<typeof sc>) => update({ searchConsole: { ...sc, ...patch } });
  return (
    <div>
      <StepHeading
        eyebrow="Step 4"
        title={<>Connect real ranking data.</>}
        sub="Google Search Console feeds actual positions, impressions and clicks back into the strategy. The agent works without it, but it gets sharper with it."
      />
      <div className="mt-8 grid gap-3">
        <ChoiceCard
          selected={sc.connected}
          onClick={() => {
            if (sc.connected) return;
            // Real OAuth: Google asks for read-only Search Console access
            // and returns here with ?gsc=connected. If Google keys are not
            // configured the flow bounces back with ?gsc=error instead.
            window.location.href = "/api/connect/gsc/start?flow=onboarding";
          }}
          title={sc.connected ? "Google Search Console connected" : "Connect Google Search Console"}
          text={
            sc.connected
              ? "Ranking data flows into your Analytics tab. You can revoke access from your Google account at any time."
              : "Recommended. Approve read-only access with your Google account and real impressions, clicks and rankings appear in your dashboard."
          }
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="m4 17 5-5 3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 7h5v5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <ChoiceCard
          selected={sc.skipped}
          onClick={() => set({ skipped: true, connected: false })}
          title="Skip for now"
          text="The agent tracks its own publishing metrics until you connect. You can do this later in settings."
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 12h14m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
      </div>
    </div>
  );
}

function MarketStep({ data, update }: StepProps) {
  const m = data.market;
  const set = (patch: Partial<typeof m>) => update({ market: { ...m, ...patch } });
  return (
    <div>
      <StepHeading
        eyebrow="Step 5"
        title={<>Define your market.</>}
        sub="This seeds the first research cycle. The agent expands from here on its own, finding competitors and keyword gaps you never told it about."
      />
      <div className="mt-8 grid gap-5">
        <Field
          label="Industry"
          placeholder="Custom pool construction"
          value={m.industry}
          onChange={(e) => set({ industry: e.target.value })}
        />
        <Field
          label="Core services"
          hint="Separated by commas. Each becomes a service page target."
          placeholder="New pool builds, remodeling, outdoor kitchens, spas"
          value={m.services}
          onChange={(e) => set({ services: e.target.value })}
        />
        <Field
          label="Priority locations"
          optional
          placeholder="Scottsdale, Paradise Valley, North Phoenix"
          value={m.locations}
          onChange={(e) => set({ locations: e.target.value })}
        />
        <Field
          label="Competitors you watch"
          optional
          hint="The agent maps their keyword coverage against yours. Every gap becomes a page in your queue. We will find the rest."
          placeholder="competitor1.com, competitor2.com"
          value={m.competitors}
          onChange={(e) => set({ competitors: e.target.value })}
        />
        <Field
          label="Average sale value"
          optional
          hint="What a typical customer is worth in dollars. Turns rankings into revenue projections on your dashboard."
          placeholder="4500"
          inputMode="numeric"
          value={m.avgSaleValue}
          onChange={(e) => set({ avgSaleValue: e.target.value })}
        />
        <Field
          label="Keyword wishlist"
          optional
          hint="Keywords you already know you want to win. The agent seeds its queue with these first — question phrasing works too, and gets built as an answer-first page for AI search."
          placeholder="pool remodeling scottsdale, how much does a pool remodel cost"
          value={m.wishlist}
          onChange={(e) => set({ wishlist: e.target.value })}
        />
      </div>
    </div>
  );
}

function LaunchStep({ data, update }: StepProps) {
  const l = data.launch;
  const set = (patch: Partial<typeof l>) => update({ launch: { ...l, ...patch } });
  // The same plan builder the dashboard runs — the preview below IS the
  // first cycle, not marketing copy about it.
  const plan = useMemo(() => buildPlan(data), [data]);
  const firstPage = plan.pages.find((p) => p.status !== "Rewriting") ?? plan.pages[0];
  const queuedCount = plan.keywords.filter((k) => k.status === "Queued").length;
  const totalGaps = plan.competitors.reduce((s, c) => s + c.gapCount, 0);
  const summary = [
    { label: "Business", value: data.business.name || "Not set" },
    { label: "Website", value: data.website.url || "Not set" },
    {
      label: "Publishing",
      value: data.website.platform === "wordpress" ? "WordPress REST API" : "GitHub repository",
    },
    {
      label: "Rankings",
      value: data.searchConsole.connected ? "Search Console connected" : "Internal tracking",
    },
    { label: "Industry", value: data.market.industry || "Not set" },
    { label: "Services", value: data.market.services || "Not set" },
  ];
  return (
    <div>
      <StepHeading
        eyebrow="Step 6"
        title={<>Ready for liftoff.</>}
        sub="Choose how the agent operates. You can change both settings whenever you like."
      />
      <div className="mt-8 grid gap-3">
        <span id="publish-mode-label" className="text-[13px] font-medium text-ink">Publishing mode</span>
        <div role="group" aria-labelledby="publish-mode-label" className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            selected={l.mode === "autopilot"}
            onClick={() => set({ mode: "autopilot" })}
            title="Autopilot"
            text="Pages that clear the audit publish automatically. Fully hands free."
          />
          <ChoiceCard
            selected={l.mode === "review"}
            onClick={() => set({ mode: "review" })}
            title="Review first"
            text="Every page waits in your queue until you approve it."
          />
        </div>
        <span id="cadence-label" className="mt-3 text-[13px] font-medium text-ink">Cadence</span>
        <div role="group" aria-labelledby="cadence-label" className="grid gap-3 sm:grid-cols-3">
          {(
            [
              { key: "daily", title: "Daily", text: "One page every day." },
              { key: "every3days", title: "Every 3 days", text: "Steady and measured." },
              { key: "weekly", title: "Weekly", text: "One page per week." },
            ] as const
          ).map((c) => (
            <ChoiceCard
              key={c.key}
              selected={l.cadence === c.key}
              onClick={() => set({ cadence: c.key })}
              title={c.title}
              text={c.text}
            />
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-line-dark bg-ink p-5 text-white">
          <p className="label-mono text-white/50">First cycle preview</p>
          {firstPage ? (
            <dl className="mt-3 grid gap-2">
              <div className="flex justify-between gap-6 text-[13px]">
                <dt className="text-white/50">First page</dt>
                <dd className="truncate font-medium">{firstPage.title}</dd>
              </div>
              <div className="flex justify-between gap-6 text-[13px]">
                <dt className="text-white/50">Keyword queue</dt>
                <dd className="font-medium">
                  {queuedCount} queued of {plan.keywords.length} tracked
                </dd>
              </div>
              <div className="flex justify-between gap-6 text-[13px]">
                <dt className="text-white/50">First 30 days</dt>
                <dd className="font-medium">{plan.roadmap[0]?.pages ?? 0} pages planned</dd>
              </div>
              {totalGaps > 0 && (
                <div className="flex justify-between gap-6 text-[13px]">
                  <dt className="text-white/50">Competitor gaps</dt>
                  <dd className="font-medium">{totalGaps} mapped, feeding the queue</dd>
                </div>
              )}
              {plan.projection && (
                <div className="flex justify-between gap-6 text-[13px]">
                  <dt className="text-white/50">Projected value</dt>
                  <dd className="font-medium text-accent">
                    ${plan.projection.monthlyValue.toLocaleString()}/mo at month 6
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-3 text-[13px] text-white/60">
              Add services and locations in the Market step and the agent will
              draft its first-cycle plan here.
            </p>
          )}
        </div>

        <div className="mt-1 rounded-xl border border-line bg-white p-5">
          <p className="label-mono text-muted/70">Configuration</p>
          <dl className="mt-3 grid gap-2">
            {summary.map((s) => (
              <div key={s.label} className="flex justify-between gap-6 text-[13px]">
                <dt className="text-muted">{s.label}</dt>
                <dd className="truncate font-medium text-ink">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

/* ---------- Launch animation ---------- */

function LaunchSequence({ data, onDone }: { data: OnboardingData; onDone: () => void }) {
  const [count, setCount] = useState(0);
  const [researchDone, setResearchDone] = useState(false);
  const started = useRef(false);

  // Built from the real plan so the launch narration matches what the
  // dashboard shows two seconds later.
  const launchLines = useMemo(() => {
    const plan = buildPlan(data);
    const firstPage = plan.pages.find((p) => p.status !== "Rewriting") ?? plan.pages[0];
    return [
      "Creating your workspace",
      "Ingesting your brand and design tokens",
      plan.competitors.length > 0
        ? `Mapping ${plan.competitors.length} competitor${plan.competitors.length > 1 ? "s" : ""} in your market`
        : "Mapping your market",
      `Prioritizing ${plan.keywords.length} keywords into a queue`,
      firstPage ? `Scheduling "${firstPage.title}" as your first page` : "Scheduling the first page",
    ];
  }, [data]);

  // The launch sequence is real: it provisions the tenant site in the
  // database (so the daily cron picks it up) and runs the agent's first
  // research cycle while the checklist animates. Provisioning is
  // fire-and-forget: keyless deployments keep working from localStorage.
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const ingest = loadIntel().ingest;
    fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        onboarding: data,
        brand: ingest
          ? {
              colors: ingest.colors,
              fonts: ingest.fonts,
              description: ingest.description || ingest.title || "",
            }
          : {},
      }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => {
      // Store offline or not signed in; the local demo path still works.
    });

    const finish = () => setResearchDone(true);
    fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business: data.business,
        market: data.market,
        websiteUrl: data.website.url,
      }),
      signal: AbortSignal.timeout(60_000),
    })
      .then((r) => r.json())
      .then((research) => {
        saveIntel({ research: { ...research, ranAt: new Date().toISOString() } });
        finish();
      })
      .catch(finish);
  }, [data]);

  useEffect(() => {
    if (count < launchLines.length) {
      // Hold on the research line until the live cycle returns.
      if (count === launchLines.length - 1 && !researchDone) return;
      const t = setTimeout(() => setCount((c) => c + 1), 750);
      return () => clearTimeout(t);
    }
    const t = setTimeout(onDone, 1100);
    return () => clearTimeout(t);
  }, [count, onDone, researchDone, launchLines.length]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-6 text-white">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease }}
        className="w-full max-w-sm"
      >
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-accent animate-livepulse" />
          <span className="label-mono text-white/60">{site.name} is starting</span>
        </div>
        <div className="mt-8 flex flex-col gap-4">
          {launchLines.map((line, i) => (
            <motion.div
              key={line}
              initial={{ opacity: 0, x: -10 }}
              animate={i < count ? { opacity: 1, x: 0 } : { opacity: 0.18, x: 0 }}
              transition={{ duration: 0.4 }}
              className="flex items-center gap-3 text-[14.5px]"
            >
              {i < count ? (
                <svg viewBox="0 0 16 16" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m3.5 8.5 3 3L12.5 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <span className="h-4 w-4 rounded-full border border-white/20" />
              )}
              <span className={i < count ? "text-white" : "text-white/40"}>{line}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
