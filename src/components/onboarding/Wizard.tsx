"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Wordmark } from "@/components/ui/Wordmark";
import {
  type OnboardingData,
  emptyOnboarding,
  loadOnboarding,
  saveOnboarding,
} from "@/lib/onboarding";
import { site } from "@/lib/site";
import { ChoiceCard, Field, StepHeading } from "./fields";

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
  const [data, setData] = useState<OnboardingData>(emptyOnboarding);
  const [step, setStep] = useState(0);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    setData(loadOnboarding());
  }, []);

  const update = (patch: Partial<OnboardingData>) => {
    setData((prev) => {
      const next = { ...prev, ...patch };
      saveOnboarding(next);
      return next;
    });
  };

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
          return data.publishing.githubRepo.trim() !== "" && data.publishing.githubToken.trim() !== "";
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

  if (launching) return <LaunchSequence onDone={() => router.push("/dashboard")} />;

  return (
    <div className="flex min-h-screen bg-paper-warm">
      {/* Progress rail */}
      <aside className="hidden w-72 shrink-0 flex-col justify-between border-r border-line bg-white px-8 py-8 lg:flex">
        <div>
          <Wordmark />
          <nav className="mt-14 flex flex-col gap-1">
            {steps.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <button
                  key={s.key}
                  onClick={() => i < step && setStep(i)}
                  disabled={i > step}
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
                      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m3.5 8.5 3 3L12.5 5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
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
  return (
    <div>
      <StepHeading
        eyebrow="Step 2"
        title={<>Where do we publish?</>}
        sub="Point the agent at your live site and tell us what it runs on. Pages publish directly there, so the equity stays yours."
      />
      <div className="mt-8 grid gap-5">
        <Field
          label="Website URL"
          placeholder="https://summitcustompools.com"
          type="url"
          value={w.url}
          onChange={(e) => set({ url: e.target.value })}
        />
        <div className="grid gap-3">
          <span className="text-[13px] font-medium text-ink">Platform</span>
          <ChoiceCard
            selected={w.platform === "wordpress"}
            onClick={() => set({ platform: "wordpress" })}
            title="WordPress"
            text="We publish through the WordPress REST API. Works with any theme or page builder."
          />
          <ChoiceCard
            selected={w.platform === "github"}
            onClick={() => set({ platform: "github" })}
            title="Static site on GitHub"
            text="We commit pages straight into your repository and wire them into your navigation."
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
  return (
    <div>
      <StepHeading
        eyebrow="Step 3"
        title={<>Connect publishing.</>}
        sub={
          isWp
            ? "Create an application password in WordPress under Users, then Profile, then Application Passwords. It grants publish access without sharing your real password."
            : "Create a fine grained access token in GitHub with content write access to your site repository. We never touch anything else."
        }
      />
      <div className="mt-8 grid gap-5">
        {isWp ? (
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
              hint="Stored encrypted. Revoke it in WordPress at any time."
              value={p.wpAppPassword}
              onChange={(e) => set({ wpAppPassword: e.target.value })}
            />
          </>
        ) : (
          <>
            <Field
              label="Repository"
              placeholder="yourname/your-site"
              value={p.githubRepo}
              onChange={(e) => set({ githubRepo: e.target.value })}
            />
            <Field
              label="Access token"
              type="password"
              placeholder="github_pat_..."
              hint="Needs content write access to this one repository only. Stored encrypted."
              value={p.githubToken}
              onChange={(e) => set({ githubToken: e.target.value })}
            />
          </>
        )}
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-muted">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-ink/60" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 1 1 8 0v3" />
            </svg>
            Credentials are encrypted at rest and used for exactly one thing:
            publishing the pages you can see in your queue. Nothing is ever
            deleted or modified without a record.
          </p>
        </div>
      </div>
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
          onClick={() => set({ connected: true, skipped: false })}
          title="Connect Google Search Console"
          text="Recommended. One click of Google sign in when your workspace goes live."
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
          hint="We will find the rest."
          placeholder="competitor1.com, competitor2.com"
          value={m.competitors}
          onChange={(e) => set({ competitors: e.target.value })}
        />
      </div>
    </div>
  );
}

function LaunchStep({ data, update }: StepProps) {
  const l = data.launch;
  const set = (patch: Partial<typeof l>) => update({ launch: { ...l, ...patch } });
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
  ];
  return (
    <div>
      <StepHeading
        eyebrow="Step 6"
        title={<>Ready for liftoff.</>}
        sub="Choose how the agent operates. You can change both settings whenever you like."
      />
      <div className="mt-8 grid gap-3">
        <span className="text-[13px] font-medium text-ink">Publishing mode</span>
        <div className="grid gap-3 sm:grid-cols-2">
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
        <span className="mt-3 text-[13px] font-medium text-ink">Cadence</span>
        <div className="grid gap-3 sm:grid-cols-3">
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

        <div className="mt-4 rounded-xl border border-line bg-white p-5">
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

const launchLines = [
  "Creating your workspace",
  "Ingesting your brand and design tokens",
  "Mapping competitors in your market",
  "Building your first keyword gap analysis",
  "Scheduling the first page",
];

function LaunchSequence({ onDone }: { onDone: () => void }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (count < launchLines.length) {
      const t = setTimeout(() => setCount((c) => c + 1), 750);
      return () => clearTimeout(t);
    }
    const t = setTimeout(onDone, 1100);
    return () => clearTimeout(t);
  }, [count, onDone]);

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
