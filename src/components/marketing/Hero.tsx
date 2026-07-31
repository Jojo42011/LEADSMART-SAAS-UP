import Link from "next/link";
import { HeroDashboard } from "./HeroDashboard";
import { site } from "@/lib/site";

/**
 * The hero animates entirely in CSS (.rise-in) rather than framer-motion.
 * Motion serializes initial={{opacity:0}} into the server-rendered HTML,
 * which left the headline, the product name and the description invisible
 * to any reader that does not execute JavaScript — including Google's
 * OAuth branding review, which reported the homepage as neither naming
 * the app nor explaining its purpose. CSS keeps the resting state visible
 * and honours prefers-reduced-motion in globals.css.
 *
 * No "use client" needed now: this is a static server component.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden pt-36 pb-20 sm:pt-44 sm:pb-28">
      {/* Faint grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(0,0,0,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.035)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black_30%,transparent_75%)]"
      />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          {/* The name and purpose ride CSS, not framer-motion: motion
              writes opacity:0 into the server-rendered HTML, which hid
              both from any reader that does not run JavaScript. */}
          <p className="rise-in label-mono text-accent" style={{ animationDelay: "0.05s" }}>
            {site.name} &middot; Autonomous SEO platform
          </p>

          <h1
            className="rise-in font-display mt-4 text-[44px] leading-[1.04] tracking-tight sm:text-[68px] md:text-[78px]"
            style={{ animationDelay: "0.1s" }}
          >
            Win the rankings.
            <br />
            <em className="text-accent">And the AI answers.</em>
          </h1>

          {/* Names the product and states plainly what it does. A visitor
              (or a reviewer) landing cold should not have to infer either
              from the headline's wordplay. */}
          <p
            className="rise-in mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-muted"
            style={{ animationDelay: "0.2s" }}
          >
            <strong className="font-medium text-ink">{site.name}</strong> is an
            autonomous SEO platform. It studies your market, writes pages built
            to rank on Google and get cited by ChatGPT, Perplexity and AI
            Overviews, then publishes them straight to your website on a
            schedule you set. No agency. No retainers. No busywork.
          </p>

          <div
            className="rise-in mt-9 flex flex-wrap items-center justify-center gap-3.5"
            style={{ animationDelay: "0.3s" }}
          >
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-accent"
            >
              Get started
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
          </div>

          <p className="rise-in label-mono mt-6 text-muted/70" style={{ animationDelay: "0.4s" }}>
            Month to month &middot; Cancel anytime
          </p>
        </div>

        <div className="rise-in mx-auto mt-16 max-w-4xl sm:mt-20" style={{ animationDelay: "0.5s" }}>
          <HeroDashboard />
        </div>
      </div>
    </section>
  );
}
