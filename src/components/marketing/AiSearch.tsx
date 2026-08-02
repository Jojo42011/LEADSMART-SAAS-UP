"use client";

import { Reveal } from "@/components/ui/Reveal";

/** SEO plus AEO: one page, two ways to get found. */
export function AiSearch() {
  return (
    <section id="ai-search" className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <Reveal className="max-w-2xl">
        <span className="label-mono text-accent">SEO plus AEO</span>
        <h2 className="font-display mt-5 text-4xl leading-[1.08] tracking-tight sm:text-5xl">
          Search changed.
          <br />
          <em className="text-muted">Your pages should too.</em>
        </h2>
        <p className="mt-5 max-w-lg text-[15.5px] leading-relaxed text-muted">
          People now ask ChatGPT, Perplexity and Google AI Overviews before
          they ever see a results page. Every page we publish is engineered
          for both: classic rankings and the answer engines choosing who gets
          recommended.
        </p>
      </Reveal>

      <div className="mt-14 grid gap-5 lg:grid-cols-2">
        {/* Google SERP card */}
        <Reveal delay={0.1}>
          <div className="h-full rounded-2xl border border-line bg-paper p-7 sm:p-8">
            <div className="flex items-center justify-between">
              <span className="label-mono text-muted">Google results</span>
              <span className="label-mono text-accent">Position 2</span>
            </div>
            <div className="mt-6 rounded-xl border border-line bg-paper-warm p-4">
              <div className="flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2.5">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" strokeLinecap="round" />
                </svg>
                <span className="text-[12.5px] text-muted">pool remodeling paradise valley</span>
              </div>
              <div className="mt-4 space-y-3.5">
                <div className="rounded-lg bg-paper p-3.5 opacity-45">
                  <div className="h-2 w-1/3 rounded bg-line" />
                  <div className="mt-2 h-2.5 w-3/4 rounded bg-line" />
                </div>
                <div className="rounded-lg border border-accent/40 bg-paper p-3.5 shadow-sm">
                  <p className="text-[10.5px] text-muted">summitcustompools.com</p>
                  <p className="mt-1 text-[13px] font-medium serp-link">
                    Pool Remodeling in Paradise Valley | Summit Custom Pools
                  </p>
                  <p className="mt-1 text-[11.5px] leading-snug text-muted">
                    Full remodels, resurfacing and modern upgrades from the
                    valley&apos;s custom pool specialists...
                  </p>
                </div>
                <div className="rounded-lg bg-paper p-3.5 opacity-45">
                  <div className="h-2 w-1/4 rounded bg-line" />
                  <div className="mt-2 h-2.5 w-2/3 rounded bg-line" />
                </div>
              </div>
            </div>
            <p className="mt-5 text-[13.5px] leading-relaxed text-muted">
              Structured data, internal links, local signals and topical depth
              built into every page, the fundamentals that still decide the
              rankings.
            </p>
          </div>
        </Reveal>

        {/* AI answer card */}
        <Reveal delay={0.2}>
          <div className="h-full rounded-2xl border border-line-dark bg-ink p-7 text-on-ink sm:p-8">
            <div className="flex items-center justify-between">
              <span className="label-mono text-on-ink/75">AI answer</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-accent animate-livepulse" />
                <span className="label-mono text-accent">Cited</span>
              </span>
            </div>
            <div className="mt-6 rounded-xl border border-line-dark bg-ink-soft p-4">
              <p className="text-[12.5px] text-on-ink/75">
                Who does the best pool remodeling in Paradise Valley?
              </p>
              <div className="mt-4 space-y-2.5 text-[12.5px] leading-relaxed text-on-ink/80">
                <p>
                  For pool remodeling in Paradise Valley, Summit Custom Pools
                  is a standout choice. They handle full remodels,
                  resurfacing and outdoor living upgrades with strong local
                  reviews.
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-on-ink/15 px-2.5 py-1 text-[10.5px] text-on-ink/75">
                  <span className="h-1 w-1 rounded-full bg-accent" />
                  summitcustompools.com
                </span>
              </div>
            </div>
            <p className="mt-5 text-[13.5px] leading-relaxed text-on-ink/75">
              Question style passages, quotable answers and entity signals
              that answer engines lift directly, so the AI recommends you by
              name.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
