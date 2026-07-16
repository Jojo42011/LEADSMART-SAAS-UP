"use client";

import Link from "next/link";
import { Reveal, Stagger, StaggerItem } from "@/components/ui/Reveal";

const tiers = [
  {
    name: "Starter",
    price: 49,
    cadence: "A page every 3 days",
    blurb: "For one site that needs to start climbing.",
    features: [
      "1 website",
      "Up to 10 pages per month",
      "Full keyword and competitor research",
      "90 day roadmap, rebuilt every cycle",
      "Ascent Method audits on every page",
      "Live dashboard and Search Console sync",
    ],
    cta: "Start free trial",
    featured: false,
  },
  {
    name: "Growth",
    price: 129,
    cadence: "A page every day",
    blurb: "For businesses serious about owning their market.",
    features: [
      "1 website at full daily cadence",
      "Up to 31 pages per month",
      "Everything in Starter",
      "AI image generation on every page",
      "Revenue projections from your sale value",
      "Priority publish scheduling",
    ],
    cta: "Start free trial",
    featured: true,
  },
  {
    name: "Scale",
    price: 299,
    cadence: "Daily, across your roster",
    blurb: "For agencies running SEO across many clients.",
    features: [
      "10 websites, daily cadence on each",
      "Unlimited page generation",
      "Everything in Growth",
      "White label reports",
      "API access",
      "Dedicated support",
    ],
    cta: "Talk to us",
    featured: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="border-t border-line bg-paper-warm">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="label-mono text-accent">Pricing</span>
          <h2 className="font-display mt-5 text-4xl leading-[1.08] tracking-tight sm:text-5xl">
            Priced by pace,
            <br />
            <em className="text-muted">not by the hour.</em>
          </h2>
          <p className="mt-5 text-[15.5px] leading-relaxed text-muted">
            An agency retainer starts around $3,000 a month, on a contract,
            after a sales call. Every Ascent plan is public, month to month,
            and costs less than one of those days. Pick how fast you want to
            publish.
          </p>
        </Reveal>

        <Stagger className="mt-14 grid gap-5 lg:grid-cols-3" stagger={0.1}>
          {tiers.map((t) => (
            <StaggerItem
              key={t.name}
              className={`relative flex flex-col rounded-2xl border bg-white p-8 ${
                t.featured
                  ? "border-ink shadow-2xl shadow-black/[0.08] lg:-translate-y-3"
                  : "border-line"
              }`}
            >
              {t.featured && (
                <span className="absolute -top-3 left-8 rounded-full bg-accent px-3 py-1 text-[11px] font-medium tracking-wide text-white">
                  Most popular
                </span>
              )}
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] font-medium tracking-tight">{t.name}</h3>
                <span className="label-mono text-[10.5px] text-muted/70">{t.cadence}</span>
              </div>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="font-display text-5xl tracking-tight">
                  ${t.price}
                </span>
                <span className="text-[13px] text-muted">/month</span>
              </div>
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                {t.blurb}
              </p>

              <ul className="mt-7 flex flex-col gap-3 border-t border-line pt-7">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13.5px]">
                    <svg
                      viewBox="0 0 16 16"
                      className={`mt-0.5 h-4 w-4 shrink-0 ${t.featured ? "text-accent" : "text-ink/50"}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="m3 8.5 3.5 3.5L13 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-ink/80">{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className={`mt-8 inline-flex items-center justify-center rounded-full px-6 py-3 text-[14px] font-medium transition-colors ${
                  t.featured
                    ? "bg-ink text-white hover:bg-accent"
                    : "border border-line text-ink hover:border-ink"
                }`}
              >
                {t.cta}
              </Link>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="mt-10 text-center">
          <p className="label-mono text-muted/70">
            14 day free trial &middot; No card required &middot; Month to month, cancel anytime
          </p>
        </Reveal>
      </div>
    </section>
  );
}
