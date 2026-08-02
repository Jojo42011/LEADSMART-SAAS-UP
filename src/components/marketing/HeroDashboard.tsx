"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Counter } from "@/components/ui/Counter";

const ease = [0.21, 0.47, 0.32, 0.98] as const;

const kpis = [
  { label: "Pages live", value: 142, suffix: "", delta: "+31 this month", up: true },
  { label: "Avg position", value: 6, suffix: ".2", delta: "up from 18.4", up: true },
  { label: "AI citations", value: 37, suffix: "", delta: "+12 this month", up: true },
  { label: "Audit average", value: 96, suffix: "/100", delta: "grade A", up: true },
];

const pages = [
  { path: "/locations/paradise-valley", score: 98, pos: 3, move: "+9" },
  { path: "/services/pool-remodeling", score: 96, pos: 5, move: "+14" },
  { path: "/locations/scottsdale", score: 97, pos: 2, move: "+6" },
];

/** Product visual: an analytics view of what the agent delivers. */
export function HeroDashboard() {
  const reduced = useReducedMotion();

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-2xl shadow-black/[0.10]">
      {/* Window chrome */}
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent animate-livepulse" />
          <span className="label-mono text-muted">Agent active</span>
        </div>
        <span className="label-mono text-muted">Last publish 2h ago</span>
      </div>

      <div className="grid gap-px bg-line sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-paper px-5 py-4">
            <p className="label-mono text-muted">{k.label}</p>
            <p className="font-display mt-1 text-[28px] leading-none tracking-tight">
              <Counter to={k.value} suffix={k.suffix} />
            </p>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted">
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M2 9.5 6 4l4 5.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {k.delta}
            </p>
          </div>
        ))}
      </div>

      <div className="grid border-t border-line lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Traffic chart */}
        <div className="p-5 sm:p-6">
          <div className="flex items-baseline justify-between">
            <p className="text-[13px] font-medium">Organic clicks</p>
            <p className="label-mono text-muted">Six months</p>
          </div>
          <div className="mt-4">
            <svg viewBox="0 0 560 180" className="w-full" aria-hidden>
              {[0, 45, 90, 135].map((y) => (
                <line key={y} x1="0" x2="560" y1={y + 20} y2={y + 20} stroke="var(--line)" strokeWidth="1" />
              ))}
              <motion.path
                d="M0 168 C60 165, 90 160, 130 152 C180 142, 210 128, 260 112 C310 96, 340 84, 390 62 C440 42, 490 30, 560 14 L560 180 L0 180 Z"
                fill="var(--accent-dim)"
                initial={reduced ? { opacity: 1 } : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.2, delay: 1.2 }}
              />
              <motion.path
                d="M0 168 C60 165, 90 160, 130 152 C180 142, 210 128, 260 112 C310 96, 340 84, 390 62 C440 42, 490 30, 560 14"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
                initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.8, delay: 0.6, ease }}
              />
              <motion.circle
                cx="560"
                cy="14"
                r="4.5"
                fill="var(--accent)"
                initial={reduced ? { opacity: 1 } : { opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 2.3 }}
              />
            </svg>
            <div className="mt-2 flex justify-between">
              {["Feb", "Mar", "Apr", "May", "Jun", "Jul"].map((m) => (
                <span key={m} className="label-mono text-[9.5px] text-muted">{m}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Top pages */}
        <div className="border-t border-line p-5 sm:p-6 lg:border-l lg:border-t-0">
          <div className="flex items-baseline justify-between">
            <p className="text-[13px] font-medium">Top pages</p>
            <p className="label-mono text-muted">Published by agent</p>
          </div>
          <div className="mt-4 flex flex-col gap-2.5">
            {pages.map((p, i) => (
              <motion.div
                key={p.path}
                initial={reduced ? false : { opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 1 + i * 0.18, ease }}
                className="flex items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11.5px] text-ink">{p.path}</p>
                  <p className="mt-0.5 text-[10.5px] text-muted">
                    Position {p.pos} &middot; <span className="text-accent">{p.move}</span>
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 font-mono text-[10px] text-on-ink">
                  {p.score}
                </span>
              </motion.div>
            ))}
            <motion.div
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.8 }}
              className="flex items-center gap-2 rounded-lg bg-paper-warm px-3.5 py-2.5"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-livepulse" />
              <p className="text-[11px] text-muted">
                Cited in AI answers 37 times this month
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
