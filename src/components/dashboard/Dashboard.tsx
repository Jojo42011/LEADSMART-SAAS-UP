"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Wordmark } from "@/components/ui/Wordmark";
import { loadOnboarding, type OnboardingData } from "@/lib/onboarding";

const navItems = [
  {
    label: "Overview",
    active: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    label: "Content",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 8h6M9 12h6M9 16h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Keywords",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="m4 17 5-5 3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 7h5v5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Competitors",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Settings",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1m0-14.2-2.1 2.1m-10 10-2.1 2.1" strokeLinecap="round" />
      </svg>
    ),
  },
];

const firstRunTasks = [
  { label: "Workspace created", done: true },
  { label: "Brand and design ingest", done: true },
  { label: "Competitor mapping", done: false, active: true },
  { label: "Keyword gap analysis", done: false },
  { label: "First page draft", done: false },
];

export function Dashboard() {
  const [data, setData] = useState<OnboardingData | null>(null);

  useEffect(() => {
    setData(loadOnboarding());
  }, []);

  const siteName = data?.business.name || "Your site";
  const siteUrl = data?.website.url?.replace(/^https?:\/\//, "") || "";

  return (
    <div className="flex min-h-screen bg-paper-warm">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white px-5 py-7 md:flex">
        <div className="px-2">
          <Wordmark href="/dashboard" />
        </div>
        <nav className="mt-10 flex flex-col gap-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13.5px] transition-colors ${
                item.active
                  ? "bg-paper-warm font-medium text-ink"
                  : "text-muted hover:bg-paper-warm hover:text-ink"
              }`}
            >
              <span className="h-4.5 w-4.5 [&>svg]:h-full [&>svg]:w-full">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-xl border border-line p-4">
          <p className="label-mono text-muted/70">Plan</p>
          <p className="mt-1 text-[13.5px] font-medium">Free trial</p>
          <p className="mt-0.5 text-[12px] text-muted">13 days remaining</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-white px-6 py-4">
          <div>
            <h1 className="text-[16px] font-medium tracking-tight">{siteName}</h1>
            {siteUrl && <p className="text-[12.5px] text-muted">{siteUrl}</p>}
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-livepulse" />
            <span className="label-mono text-muted">Agent active</span>
          </span>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
          >
            {/* First run banner */}
            <div className="overflow-hidden rounded-2xl border border-line-dark bg-ink p-7 text-white sm:p-9">
              <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <span className="label-mono text-accent">First cycle in progress</span>
                  <h2 className="font-display mt-3 text-3xl tracking-tight sm:text-4xl">
                    Your agent is studying the market.
                  </h2>
                  <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-white/55">
                    The first research cycle maps your competitors and finds
                    the gaps worth writing into. Your first page lands here
                    when it clears the audit.
                  </p>
                </div>
                <div className="w-full max-w-[240px] shrink-0">
                  {firstRunTasks.map((t) => (
                    <div key={t.label} className="flex items-center gap-3 py-1.5 text-[13px]">
                      {t.done ? (
                        <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="m3.5 8.5 3 3L12.5 5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : t.active ? (
                        <span className="h-4 w-4 shrink-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                      ) : (
                        <span className="h-4 w-4 shrink-0 rounded-full border border-white/20" />
                      )}
                      <span className={t.done || t.active ? "text-white" : "text-white/40"}>
                        {t.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* KPI placeholders */}
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                { label: "Pages published", value: "0", note: "First page within 24 hours" },
                { label: "Keywords tracked", value: "0", note: "Populates after research" },
                { label: "Average audit score", value: "—", note: "Scored at publish time" },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-2xl border border-line bg-white p-6">
                  <p className="label-mono text-muted/70">{kpi.label}</p>
                  <p className="font-display mt-2 text-4xl tracking-tight">{kpi.value}</p>
                  <p className="mt-1.5 text-[12.5px] text-muted">{kpi.note}</p>
                </div>
              ))}
            </div>

            {/* Queue placeholder */}
            <div className="mt-6 rounded-2xl border border-line bg-white p-6">
              <div className="flex items-center justify-between">
                <p className="text-[14.5px] font-medium">Content queue</p>
                <span className="label-mono text-muted/60">Updates live</span>
              </div>
              <div className="mt-5 grid gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 rounded-xl border border-line p-4">
                    <div className="h-10 w-10 shrink-0 rounded-lg animate-shimmer" />
                    <div className="flex-1">
                      <div className="h-3 w-2/5 rounded animate-shimmer" />
                      <div className="mt-2 h-2.5 w-1/4 rounded animate-shimmer" />
                    </div>
                    <div className="h-6 w-16 rounded-full animate-shimmer" />
                  </div>
                ))}
              </div>
              <p className="mt-5 text-center text-[12.5px] text-muted/70">
                Drafts appear here as the agent writes them.
              </p>
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
