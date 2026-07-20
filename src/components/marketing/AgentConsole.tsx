"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

type Line = {
  time: string;
  phase: string;
  text: string;
  accent?: boolean;
};

const SCRIPT: Line[] = [
  { time: "06:00:02", phase: "research", text: "Scanning top results for custom pool builder scottsdale" },
  { time: "06:00:14", phase: "research", text: "12 competitors mapped, 84 keywords extracted" },
  { time: "06:00:31", phase: "plan", text: "Gap found: pool remodeling paradise valley has no coverage" },
  { time: "06:00:45", phase: "generate", text: "Writing page: Pool Remodeling in Paradise Valley" },
  { time: "06:02:10", phase: "generate", text: "4 images generated and placed" },
  { time: "06:02:38", phase: "enrich", text: "Schema, meta and 6 internal links injected" },
  { time: "06:02:47", phase: "score", text: "Information gain 0.68, AI retrievability 94 of 100" },
  { time: "06:02:51", phase: "score", text: "Audit score 98 of 100, grade A", accent: true },
  { time: "06:03:04", phase: "publish", text: "Committed to production and verified live", accent: true },
];

export function AgentConsole() {
  const reduced = useReducedMotion();
  // Start at 0 on both server and client so hydration matches; the effect
  // below jumps reduced-motion users straight to the full script.
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (reduced) {
      setCount(SCRIPT.length);
      return;
    }
    const timer = setInterval(() => {
      setCount((c) => {
        if (c >= SCRIPT.length) return c;
        return c + 1;
      });
    }, 900);
    return () => clearInterval(timer);
  }, [reduced]);

  useEffect(() => {
    if (reduced || count < SCRIPT.length) return;
    const reset = setTimeout(() => setCount(0), 5000);
    return () => clearTimeout(reset);
  }, [count, reduced]);

  return (
    <div className="overflow-hidden rounded-2xl border border-line-dark bg-ink shadow-2xl shadow-black/25">
      <div className="flex items-center justify-between border-b border-line-dark px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent animate-livepulse" />
          <span className="label-mono text-white/60">Agent running</span>
        </div>
        <span className="label-mono text-white/30">Daily cycle 142</span>
      </div>

      <div className="min-h-[296px] px-5 py-4 font-mono text-[12.5px] leading-relaxed sm:text-[13px]">
        <AnimatePresence>
          {SCRIPT.slice(0, count).map((line) => (
            <motion.div
              key={line.time}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex gap-3 py-[5px]"
            >
              <span className="shrink-0 text-white/25">{line.time}</span>
              <span
                className={`shrink-0 w-[72px] uppercase tracking-wider text-[10.5px] pt-[3px] ${
                  line.accent ? "text-accent" : "text-white/40"
                }`}
              >
                {line.phase}
              </span>
              <span className={line.accent ? "text-white" : "text-white/70"}>
                {line.text}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        {count < SCRIPT.length && (
          <div className="flex gap-3 py-[5px]">
            <span className="inline-block h-4 w-2 animate-pulse bg-white/50" />
          </div>
        )}
      </div>
    </div>
  );
}
