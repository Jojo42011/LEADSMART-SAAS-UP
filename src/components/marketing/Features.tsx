"use client";

import { Reveal, Stagger, StaggerItem } from "@/components/ui/Reveal";

const features = [
  {
    title: "Competitor intelligence",
    text: "Reads the sites outranking you, extracts their structure, keywords, and selling points, and turns their playbook into your plan.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Keyword gap discovery",
    text: "Surfaces searches your competitors rank for and you do not, then prioritizes the ones with commercial intent you can actually win.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 19V5m0 14h16" strokeLinecap="round" />
        <path d="m7 14 4-4 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Complete page generation",
    text: "Full location and service pages with original imagery, correct heading structure, and depth that earns rankings. Not thin templates.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 8h6M9 12h6M9 16h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Ranking tracking",
    text: "Syncs real position data from Google Search Console daily, records movement over time, and spots pages gaining traction.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="m4 17 5-5 3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 7h5v5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "AI answer optimization",
    text: "Quotable, question style passages, real citations and real schema markup, structured so ChatGPT, Perplexity and AI Overviews cite you by name.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V6Z" strokeLinejoin="round" />
        <path d="M8.5 9h7M8.5 12.5h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Self improving strategy",
    text: "Studies which pages climb and which stall, then adjusts what it writes next. The longer it runs, the sharper it gets.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M20 12a8 8 0 1 1-2.34-5.66" strokeLinecap="round" />
        <path d="M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <Reveal className="max-w-2xl">
        <span className="label-mono text-accent">What you get</span>
        <h2 className="font-display mt-5 text-4xl leading-[1.08] tracking-tight sm:text-5xl">
          A full SEO team,
          <br />
          <em className="text-muted">condensed into software.</em>
        </h2>
      </Reveal>

      <Stagger
        className="mt-14 grid grid-cols-1 border-t border-l border-line sm:grid-cols-2 lg:grid-cols-3"
        stagger={0.06}
      >
        {features.map((f, i) => (
          <StaggerItem
            key={f.title}
            className="group relative border-b border-r border-line p-8 transition-colors duration-300 hover:bg-paper-warm sm:p-10"
          >
            <span className="label-mono absolute right-8 top-8 text-line transition-colors duration-300 group-hover:text-accent">
              0{i + 1}
            </span>
            <span className="block h-6 w-6 text-ink/70 [&>svg]:h-full [&>svg]:w-full">
              {f.icon}
            </span>
            <h3 className="mt-6 text-[17px] font-medium tracking-tight">
              {f.title}
            </h3>
            <p className="mt-2.5 text-[14px] leading-relaxed text-muted">
              {f.text}
            </p>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
