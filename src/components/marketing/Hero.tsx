"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { HeroDashboard } from "./HeroDashboard";

const ease = [0.21, 0.47, 0.32, 0.98] as const;

export function Hero() {
  const reduced = useReducedMotion();

  const fade = (delay: number) => ({
    initial: reduced ? false : { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, delay, ease },
  });

  return (
    <section className="relative overflow-hidden pt-36 pb-20 sm:pt-44 sm:pb-28">
      {/* Faint grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(0,0,0,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.035)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black_30%,transparent_75%)]"
      />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div {...fade(0)}>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-livepulse" />
              <span className="label-mono text-muted">
                Autonomous SEO and AEO platform
              </span>
            </span>
          </motion.div>

          <motion.h1
            {...fade(0.1)}
            className="font-display text-[44px] leading-[1.04] tracking-tight sm:text-[68px] md:text-[78px]"
          >
            Win the rankings.
            <br />
            <em className="text-accent">And the AI answers.</em>
          </motion.h1>

          <motion.p
            {...fade(0.2)}
            className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-muted"
          >
            An autonomous agent that studies your market, writes pages built
            to rank on Google and get cited by ChatGPT, Perplexity and AI
            Overviews, then publishes them to your live site every day. No
            agency. No retainers. No busywork.
          </motion.p>

          <motion.div
            {...fade(0.3)}
            className="mt-9 flex flex-wrap items-center justify-center gap-3.5"
          >
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-accent"
            >
              Start ranking free
              <span className="transition-transform duration-200 group-hover:translate-x-1">
                &rarr;
              </span>
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-7 py-3.5 text-[15px] font-medium text-ink transition-colors hover:border-ink"
            >
              See how it works
            </a>
          </motion.div>

          <motion.p {...fade(0.4)} className="label-mono mt-6 text-muted/70">
            14 day free trial &middot; No card required
          </motion.p>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 48 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5, ease }}
          className="mx-auto mt-16 max-w-4xl sm:mt-20"
        >
          <HeroDashboard />
        </motion.div>
      </div>
    </section>
  );
}
