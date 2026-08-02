"use client";

import { Reveal, Stagger, StaggerItem } from "@/components/ui/Reveal";

const phases = [
  {
    period: "Days 1-30",
    title: "Coverage",
    text: "The agent maps 24 keywords, finds 11 locations with zero coverage, and publishes a page a day against the highest potential gaps first: the searches most likely to become jobs, not just traffic.",
    stat: "30 pages live",
  },
  {
    period: "Days 31-60",
    title: "Compounding",
    text: "Early pages start ranking for long tail searches while new ones target near me and comparison intent. Every page links into the others, so authority builds across the whole site.",
    stat: "Long tail rankings arrive",
  },
  {
    period: "Days 61-90",
    title: "Closing gaps",
    text: "With live ranking data flowing back in, the roadmap rebuilds itself: competitor gaps get closed, winning pages get refreshed and the strategy sharpens with every cycle.",
    stat: "Roadmap v2, from real data",
  },
];

export function FirstNinetyDays() {
  return (
    <section id="first-90-days" className="border-t border-line bg-paper-warm">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Reveal>
              <span className="label-mono text-accent">The first 90 days</span>
              <h2 className="font-display mt-5 text-4xl leading-[1.08] tracking-tight sm:text-5xl">
                What compounding
                <br />
                <em className="text-muted">actually looks like.</em>
              </h2>
              <p className="mt-6 max-w-sm text-[15.5px] leading-relaxed text-muted">
                Take a pool builder in Scottsdale. Ranked for their brand name
                and little else, invisible in every suburb they serve, losing
                those jobs to whoever shows up first.
              </p>
              <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-muted">
                Illustrative scenario using the agent&apos;s default
                assumptions, not a client result. Your dashboard projects
                these numbers from your own market and sale value.
              </p>
            </Reveal>
          </div>

          <div>
            <Stagger className="flex flex-col gap-4" stagger={0.12}>
              {phases.map((p) => (
                <StaggerItem
                  key={p.period}
                  className="rounded-2xl border border-line bg-paper p-7"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="label-mono text-accent">{p.period}</span>
                    <span className="label-mono text-muted">{p.stat}</span>
                  </div>
                  <h3 className="mt-3 text-xl font-medium tracking-tight">{p.title}</h3>
                  <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted">{p.text}</p>
                </StaggerItem>
              ))}

              {/* The math */}
              <StaggerItem className="overflow-hidden rounded-2xl border border-line-dark bg-fill-strong p-7 text-on-ink sm:p-8">
                <span className="label-mono text-accent">The math</span>
                <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-3">
                  {[
                    { value: "2,400", label: "monthly visits from 90 pages of coverage" },
                    { value: "60", label: "quote requests at a 2.5% conversion rate" },
                    { value: "$67,500", label: "monthly pipeline at a $4,500 average job, if 1 in 4 closes" },
                  ].map((m) => (
                    <div key={m.label}>
                      <p className="font-display text-3xl tracking-tight sm:text-4xl">{m.value}</p>
                      <p className="mt-1.5 text-[12.5px] leading-snug text-on-ink/75">{m.label}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-6 border-t border-line-dark pt-5 text-[13px] leading-relaxed text-on-ink/75">
                  An agency would charge $9,000 for those three months and
                  publish a fraction of the pages. The agent costs less than
                  one of those weeks, and it doesn&apos;t stop at 90 days.
                </p>
              </StaggerItem>
            </Stagger>
          </div>
        </div>
      </div>
    </section>
  );
}
