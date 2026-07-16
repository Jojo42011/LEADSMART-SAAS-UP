"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/ui/Reveal";
import { Counter } from "@/components/ui/Counter";

const dimensions = [
  { name: "Meta tags", score: 18, max: 18 },
  { name: "Content depth", score: 16, max: 16 },
  { name: "Originality (info gain)", score: 8, max: 8 },
  { name: "Structured data", score: 16, max: 16 },
  { name: "Internal links", score: 14, max: 14 },
  { name: "Headings", score: 12, max: 12 },
  { name: "Local signals", score: 10, max: 10 },
  { name: "Trust signals", score: 8, max: 10 },
  { name: "Images and alt text", score: 8, max: 8 },
  { name: "AI search readiness", score: 6, max: 6 },
];

export function Scoring() {
  const reduced = useReducedMotion();

  return (
    <section id="scoring" className="border-y border-line bg-paper-warm">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 sm:py-32 lg:grid-cols-2 lg:gap-20">
        <Reveal>
          <span className="label-mono text-accent">Quality gate</span>
          <h2 className="font-display mt-5 text-4xl leading-[1.08] tracking-tight sm:text-5xl">
            Nothing ships
            <br />
            <em className="text-muted">below the bar.</em>
          </h2>
          <p className="mt-6 max-w-md text-[15.5px] leading-relaxed text-muted">
            Every page is audited across ten ranking dimensions — the Ascent
            Method pillars broken down into checks: meta quality, content
            depth, originality, structured data, internal linking, headings,
            local signals, trust signals, images, and readiness for AI search.
          </p>
          <p className="mt-4 max-w-md text-[15.5px] leading-relaxed text-muted">
            A page that scores under 75 never publishes. It goes back through
            the loop until it earns its place.
          </p>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="rounded-2xl border border-line bg-white p-7 shadow-xl shadow-black/[0.04] sm:p-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="label-mono text-muted">Page audit</p>
                <p className="mt-1.5 text-[15px] font-medium tracking-tight">
                  /locations/paradise&#8209;valley
                </p>
              </div>
              <div className="text-right">
                <div className="font-display text-5xl leading-none">
                  <Counter to={98} />
                </div>
                <p className="label-mono mt-1 text-accent">Grade A</p>
              </div>
            </div>

            <div className="mt-7 space-y-3.5">
              {dimensions.map((d, i) => (
                <div key={d.name} className="flex items-center gap-4">
                  <span className="w-36 shrink-0 text-[12.5px] text-muted">
                    {d.name}
                  </span>
                  <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-line">
                    <motion.div
                      className={`h-full rounded-full ${d.score === d.max ? "bg-ink" : "bg-accent"}`}
                      initial={reduced ? { width: `${(d.score / d.max) * 100}%` } : { width: 0 }}
                      whileInView={{ width: `${(d.score / d.max) * 100}%` }}
                      viewport={{ once: true, margin: "-60px" }}
                      transition={{ duration: 0.9, delay: 0.15 + i * 0.07, ease: [0.21, 0.47, 0.32, 0.98] }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-[11.5px] text-muted">
                    {d.score}/{d.max}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-7 flex items-center justify-between border-t border-line pt-5">
              <span className="label-mono text-muted">Verdict</span>
              <span className="inline-flex items-center gap-2 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Cleared to publish
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
