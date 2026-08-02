"use client";

import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";

const included = [
  "Daily competitor and keyword research",
  "Complete pages with AI generated imagery",
  "SEO and AEO optimization on every page",
  "90 day roadmap, rebuilt every cycle",
  "Full audit before anything ships",
  "Publishing to WordPress or GitHub",
  "Search Console ranking sync",
  "Live dashboard and page monitoring",
  "Self improving content strategy",
];

export function Pricing() {
  return (
    <section id="pricing" className="border-t border-line bg-paper-warm">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="label-mono text-accent">Pricing</span>
          <h2 className="font-display mt-5 text-4xl leading-[1.08] tracking-tight sm:text-5xl">
            One plan.
            <br />
            <em className="text-muted">Everything included.</em>
          </h2>
          <p className="mt-5 text-[15.5px] leading-relaxed text-muted">
            An agency retainer starts around $3,000 a month, on a contract,
            after a sales call. This is $49 per website, month to month, and
            it publishes every day. Add as many websites as you want, each
            one gets its own agent.
          </p>
        </Reveal>

        <Reveal delay={0.15} className="mx-auto mt-14 max-w-2xl">
          <div className="overflow-hidden rounded-2xl border border-ink bg-paper shadow-2xl shadow-black/[0.08]">
            <div className="grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <div className="flex flex-col justify-between bg-ink p-8 text-on-ink">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-on-ink/15 px-3 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent animate-livepulse" />
                    <span className="label-mono text-on-ink/75">Per website</span>
                  </span>
                  <div className="mt-6 flex items-baseline gap-1.5">
                    <span className="font-display text-7xl tracking-tight">$49</span>
                    <span className="text-[14px] text-on-ink/75">/month</span>
                  </div>
                  <p className="mt-3 text-[13.5px] leading-relaxed text-on-ink/75">
                    Every website gets its own autonomous agent, its own
                    strategy and its own publishing schedule.
                  </p>
                </div>
                <Link
                  href="/signup"
                  className="group mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-paper px-6 py-3.5 text-[14.5px] font-medium text-ink transition-colors hover:bg-accent hover:text-on-ink"
                >
                  Get started
                  <span className="transition-transform duration-200 group-hover:translate-x-0.5">
                    &rarr;
                  </span>
                </Link>
              </div>

              <div className="p-8">
                <p className="label-mono text-muted">Everything included</p>
                <ul className="mt-5 grid gap-3">
                  {included.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13.5px]">
                      <svg
                        viewBox="0 0 16 16"
                        className="mt-0.5 h-4 w-4 shrink-0 text-accent"
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
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal className="mt-10 text-center">
          <p className="label-mono text-muted">
            Month to
            month, cancel anytime
          </p>
        </Reveal>
      </div>
    </section>
  );
}
