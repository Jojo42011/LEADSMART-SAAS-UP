"use client";

import { Reveal, Stagger, StaggerItem } from "@/components/ui/Reveal";

const pillars = [
  {
    name: "Substance",
    question: "Does this page deserve to exist?",
    text: "Topical depth matched to what the searcher actually wants, written to answer the question better than anything currently ranking. Thin pages are the reason most SEO fails; the agent refuses to write them.",
    checks: ["Search intent match", "Topical depth", "Original information", "Answer-first structure"],
  },
  {
    name: "Signal",
    question: "Does the rest of the web agree?",
    text: "Every page is wired into your site so authority flows both ways: internal links, consistent business details, trust signals and entity clarity that search engines and AI answers can verify.",
    checks: ["Internal link mesh", "Business data consistency", "Trust signals", "Entity clarity"],
  },
  {
    name: "Structure",
    question: "Can machines read it perfectly?",
    text: "Clean headings, structured data, optimized meta and fast delivery. The technical layer is the foundation, not an afterthought, and it is handled on every single page automatically.",
    checks: ["Structured data", "Meta and headings", "Speed and indexation", "AI search readiness"],
  },
];

export function Method() {
  return (
    <section id="method" className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <Reveal className="max-w-2xl">
          <span className="label-mono text-accent">The Ascent Method</span>
          <h2 className="font-display mt-5 text-4xl leading-[1.08] tracking-tight sm:text-5xl">
            Three pillars.
            <br />
            <em className="text-muted">Every page, every time.</em>
          </h2>
          <p className="mt-6 text-[15.5px] leading-relaxed text-muted">
            Agencies sell methodology decks. We compiled ours into software.
            Every page the agent produces is engineered and scored against the
            same three pillars, so results are repeatable instead of
            personality-dependent.
          </p>
        </Reveal>

        <Stagger className="mt-14 grid gap-5 lg:grid-cols-3" stagger={0.12}>
          {pillars.map((p, i) => (
            <StaggerItem
              key={p.name}
              className="flex flex-col rounded-2xl border border-line bg-paper-warm p-8"
            >
              <span className="label-mono text-muted/60">0{i + 1}</span>
              <h3 className="font-display mt-4 text-2xl tracking-tight">{p.name}</h3>
              <p className="mt-1.5 text-[13.5px] font-medium text-accent">{p.question}</p>
              <p className="mt-4 text-[14px] leading-relaxed text-muted">{p.text}</p>
              <ul className="mt-6 flex flex-col gap-2.5 border-t border-line pt-6">
                {p.checks.map((c) => (
                  <li key={c} className="flex items-center gap-2.5 text-[13px] text-ink/80">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-ink/50" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="m3 8.5 3.5 3.5L13 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {c}
                  </li>
                ))}
              </ul>
            </StaggerItem>
          ))}
        </Stagger>

        {/* Information gain gate */}
        <Reveal delay={0.1}>
          <div className="mt-5 overflow-hidden rounded-2xl border border-line-dark bg-ink p-8 text-white sm:p-10">
            <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <div>
                <span className="label-mono text-accent">The originality gate</span>
                <h3 className="font-display mt-3 text-2xl tracking-tight sm:text-3xl">
                  If it says nothing new, it doesn&apos;t ship.
                </h3>
                <p className="mt-4 max-w-lg text-[14.5px] leading-relaxed text-white/55">
                  Before publishing, every draft is compared against the pages
                  already ranking for its keyword. If it isn&apos;t measurably
                  different from what&apos;s out there — new specifics, new
                  angles, new answers — it goes back through the loop. Search
                  engines and AI answers cite sources that add information,
                  not echoes.
                </p>
              </div>
              <div className="rounded-xl border border-line-dark bg-white/[0.03] p-6 font-mono text-[12.5px]">
                <p className="text-white/40">// information gain check</p>
                <p className="mt-3 text-white/70">
                  draft vs. top 10 ranking pages
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-white/50">similarity ceiling</span>
                  <span className="text-white">0.32</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-white/50">information gain</span>
                  <span className="text-accent">0.68</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-white/50">threshold</span>
                  <span className="text-white/70">0.50</span>
                </div>
                <div className="mt-4 border-t border-line-dark pt-4">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1.5 text-[11.5px] text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    Cleared to publish
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
