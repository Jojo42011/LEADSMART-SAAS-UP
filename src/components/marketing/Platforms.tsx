"use client";

import { Reveal } from "@/components/ui/Reveal";

const targets = [
  {
    name: "WordPress",
    detail: "Publishes through the REST API with an application password. Works with any theme.",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 1.5c2.13 0 4.08.79 5.57 2.09-.36-.02-.7.05-.7.05-.79.05-.9 1.12-.16 1.17 0 0 .74.06 1.22.1l1.72 4.7-2.17 6.49-3.61-10.74c.48-.03 1.16-.1 1.16-.1.75-.09.66-1.16-.09-1.12 0 0-1.64.13-2.7.13-1 0-2.67-.13-2.67-.13-.75-.04-.84 1.08-.09 1.12 0 0 .52.07 1.09.1l1.61 4.41-2.26 6.77L6.4 6.91c.49-.03 1.17-.1 1.17-.1.75-.09.66-1.16-.09-1.12 0 0-.5.04-.95.06A8.47 8.47 0 0 1 12 3.5Zm8.5 8.5c0 3.14-1.71 5.88-4.24 7.35l2.6-7.51c.44-1.21.64-2.17.64-3.03 0-.24-.01-.47-.04-.68.71 1.16 1.04 2.46 1.04 3.87Zm-12.66 7.72A8.5 8.5 0 0 1 3.5 12c0-1.24.26-2.42.74-3.48l3.6 9.2Zm4.36-3.55 2.53 6.51c-.86.27-1.77.42-2.73.42-.8 0-1.58-.11-2.32-.3l2.52-6.63Z" />
      </svg>
    ),
  },
  {
    name: "GitHub",
    detail: "Commits static pages straight into your repository and wires them into your navigation.",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-.89-.01-1.74-2.78.62-3.37-1.37-3.37-1.37-.45-1.19-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 2.5-.35c.85 0 1.71.12 2.5.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.05 10.05 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
      </svg>
    ),
  },
  {
    name: "More platforms",
    detail: "Shopify, Webflow and Framer are on the roadmap. Vote on what ships next.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

export function Platforms() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
      <Reveal className="max-w-2xl">
        <span className="label-mono text-accent">Publishing</span>
        <h2 className="font-display mt-5 text-4xl leading-[1.08] tracking-tight sm:text-5xl">
          It publishes to <em className="text-muted">your</em> site.
        </h2>
        <p className="mt-5 max-w-lg text-[15.5px] leading-relaxed text-muted">
          Not a hosted subdomain you rent. Real pages, committed to the site
          you own, building equity you keep even if you leave.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
        {targets.map((t, i) => (
          <Reveal key={t.name} delay={i * 0.1} className="bg-paper p-8">
            <span className="block h-7 w-7 text-ink [&>svg]:h-full [&>svg]:w-full">
              {t.icon}
            </span>
            <h3 className="mt-5 text-[16px] font-medium tracking-tight">
              {t.name}
            </h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              {t.detail}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
