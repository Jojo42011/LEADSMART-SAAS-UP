"use client";

import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";

export function ClosingCta() {
  return (
    <section className="relative overflow-hidden bg-ink text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_60%_70%_at_50%_50%,black_20%,transparent_75%)]"
      />
      <div className="relative mx-auto max-w-4xl px-6 py-28 text-center sm:py-36">
        <Reveal>
          <h2 className="font-display text-4xl leading-[1.06] tracking-tight sm:text-6xl">
            Your competitors published
            <br />
            <em className="text-accent">a page today.</em>
          </h2>
          <p className="mx-auto mt-6 max-w-md text-[16px] leading-relaxed text-white/55">
            Every day without new pages is a day someone else takes the
            ranking. Turn the agent on and stop giving them the head start.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-[15px] font-medium text-ink transition-colors hover:bg-accent hover:text-white"
            >
              Start ranking free
              <span className="transition-transform duration-200 group-hover:translate-x-1">
                &rarr;
              </span>
            </Link>
          </div>
          <p className="label-mono mt-7 text-white/35">
            Live in under five minutes
          </p>
        </Reveal>
      </div>
    </section>
  );
}
