"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Reveal } from "@/components/ui/Reveal";

const faqs = [
  {
    q: "Will Google penalize AI generated pages?",
    a: "Google ranks pages on quality and usefulness, not on who wrote them. Every page here passes a ten dimension audit covering depth, structure, trust signals and local relevance before it ships, and pages below the bar never publish. Thin, duplicated content is what gets penalized, and the quality gate exists precisely to prevent it.",
  },
  {
    q: "Will my pages show up in ChatGPT, Perplexity and Google AI Overviews?",
    a: "That's what the GEO tactics in the Ascent Method are for. Every page cites real sources, includes real statistics and quotes, and is structured so AI answer engines can extract and cite it. We also publish an AI crawler allowlist and an llms.txt file so the pages are actually reachable by ChatGPT, Perplexity, Copilot and Claude, not just Google.",
  },
  {
    q: "Do I need to review pages before they go live?",
    a: "That is up to you. Autopilot mode publishes anything that clears the audit. Review mode holds every page in a queue until you approve it. You can switch between them at any time.",
  },
  {
    q: "What do you need access to?",
    a: "A publishing connection to your site, either a WordPress application password or a GitHub repository token. Connecting Google Search Console is optional but recommended, since it feeds real ranking data back into the strategy.",
  },
  {
    q: "How fast will I see results?",
    a: "New pages are typically indexed within days. Meaningful ranking movement for local and long tail keywords usually shows within four to eight weeks, and the agent compounds from there because it studies what worked and writes more of it.",
  },
  {
    q: "What happens if I cancel?",
    a: "Every page ever published lives on your site, in your repository or your WordPress install. You keep all of it. There is no hosted content to lose and no export to beg for.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="mx-auto max-w-3xl px-6 py-24 sm:py-28">
      <Reveal className="text-center">
        <span className="label-mono text-accent">Questions</span>
        <h2 className="font-display mt-5 text-4xl leading-[1.08] tracking-tight sm:text-5xl">
          Asked and answered.
        </h2>
      </Reveal>

      <div className="mt-12 border-t border-line">
        {faqs.map((f, i) => (
          <div key={f.q} className="border-b border-line">
            <button
              className="flex w-full items-center justify-between gap-6 py-6 text-left"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
            >
              <span className="text-[16px] font-medium tracking-tight">
                {f.q}
              </span>
              <span
                className={`shrink-0 text-xl leading-none text-muted transition-transform duration-300 ${
                  open === i ? "rotate-45 text-accent" : ""
                }`}
              >
                +
              </span>
            </button>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.21, 0.47, 0.32, 0.98] }}
                  className="overflow-hidden"
                >
                  <p className="pb-6 pr-10 text-[14.5px] leading-relaxed text-muted">
                    {f.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  );
}
