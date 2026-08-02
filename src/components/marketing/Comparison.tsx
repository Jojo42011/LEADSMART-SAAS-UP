"use client";

import { Reveal, Stagger, StaggerItem } from "@/components/ui/Reveal";

const rows = [
  {
    label: "Monthly cost",
    agency: "$1,500 to $20,000 retainer",
    ascent: "$49 per website",
  },
  {
    label: "Contract",
    agency: "12 month contracts are standard",
    ascent: "Month to month, cancel anytime",
  },
  {
    label: "Pricing",
    agency: "Revealed on a sales call",
    ascent: "Public, on this page",
  },
  {
    label: "Time to first page",
    agency: "Weeks of onboarding first",
    ascent: "Within 24 hours",
  },
  {
    label: "Publishing pace",
    agency: "A handful of pages a month",
    ascent: "Up to a page every day",
  },
  {
    label: "Strategy refresh",
    agency: "Quarterly roadmap review",
    ascent: "Every cycle, from live data",
  },
  {
    label: "Reporting",
    agency: "Monthly PDF and a meeting",
    ascent: "Live dashboard, always current",
  },
  {
    label: "Key person risk",
    agency: "Your analyst can leave",
    ascent: "Software doesn't quit",
  },
];

export function Comparison() {
  return (
    <section id="compare" className="border-t border-line bg-paper">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="label-mono text-accent">The honest comparison</span>
          <h2 className="font-display mt-5 text-4xl leading-[1.08] tracking-tight sm:text-5xl">
            Agencies are good.
            <br />
            <em className="text-muted">The agency model isn&apos;t.</em>
          </h2>
          <p className="mt-5 text-[15.5px] leading-relaxed text-muted">
            Great agencies employ smart people. They are billed by the hour, shared
            across accounts, on contracts built for renewals, sometimes taking
            a cut of your ad spend on top. The most common reasons businesses
            fire agencies are missed targets and lack of transparency. Both
            are model problems. So we fixed the model.
          </p>
        </Reveal>

        <Stagger className="mx-auto mt-14 max-w-4xl" stagger={0.05}>
          {/* Header */}
          <StaggerItem className="hidden grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,5fr)] gap-4 px-6 pb-4 sm:grid">
            <span />
            <span className="label-mono text-muted">Traditional agency</span>
            <span className="label-mono text-accent">Ascent</span>
          </StaggerItem>

          {rows.map((r) => (
            <StaggerItem
              key={r.label}
              className="grid gap-2 border-t border-line px-6 py-5 last:border-b sm:grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,5fr)] sm:items-center sm:gap-4"
            >
              <span className="text-[13.5px] font-medium text-ink">{r.label}</span>
              {/* The column headers are hidden below sm, so each cell carries
                  its own attribution — otherwise the stacked mobile layout
                  reads as two unlabeled claims. */}
              <span className="flex items-center gap-2.5 text-[13.5px] text-muted">
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                </svg>
                <span className="sr-only">Traditional agency: </span>
                {r.agency}
              </span>
              <span className="flex items-center gap-2.5 text-[13.5px] font-medium text-ink">
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="m3 8.5 3.5 3.5L13 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="sr-only">Ascent: </span>
                {r.ascent}
              </span>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="mt-10 text-center">
          <p className="mx-auto max-w-xl text-[13px] leading-relaxed text-muted">
            Agency figures reflect published retainer guidance from leading US
            SEO agencies: typical minimums run $1,500 to $6,000 a month, with
            12 month commitments recommended to start. If you have an agency
            you love, keep them, and point Ascent at the work they don&apos;t
            have hours for.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
