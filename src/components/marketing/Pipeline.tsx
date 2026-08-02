"use client";

import { Reveal, Stagger, StaggerItem } from "@/components/ui/Reveal";

const phases = [
  {
    num: "01",
    title: "Research",
    text: "Scans live search results in your market, maps every competitor that outranks you, and extracts the keywords carrying their traffic.",
  },
  {
    num: "02",
    title: "Plan",
    text: "Finds the gaps: locations you have no page for, services competitors cover and you do not, keywords with intent and no owner. Then builds a content calendar around them.",
  },
  {
    num: "03",
    title: "Generate",
    text: "Writes a complete page in your brand voice with correct heading structure, original imagery, and enough topical depth to earn the ranking.",
  },
  {
    num: "04",
    title: "Enrich",
    text: "Injects structured data, optimized meta tags, internal links, and answer ready passages that AI engines can cite, so every page works both channels at once.",
  },
  {
    num: "05",
    title: "Score",
    text: "Audits the page across ten ranking dimensions before it ships. Anything below the bar gets rewritten, not published.",
  },
  {
    num: "06",
    title: "Publish",
    text: "Commits the page to your live site, wires it into your navigation, and verifies it resolves. Then it starts tracking the ranking.",
  },
];

export function Pipeline() {
  return (
    <section id="how-it-works" className="bg-ink text-on-ink">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
          {/* Sticky intro */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Reveal>
              <span className="label-mono text-accent">The daily cycle</span>
              <h2 className="font-display mt-5 text-4xl leading-[1.08] tracking-tight sm:text-5xl">
                Six phases.
                <br />
                Every day.
                <br />
                <em className="text-on-ink/75">While you sleep.</em>
              </h2>
              <p className="mt-6 max-w-sm text-[15.5px] leading-relaxed text-on-ink/75">
                Most SEO work dies in the handoff between strategy, writing,
                and publishing. Here there is no handoff. One agent owns the
                entire loop and closes it daily.
              </p>
            </Reveal>
          </div>

          {/* Steps */}
          <Stagger className="flex flex-col" stagger={0.1}>
            {phases.map((p) => (
              <StaggerItem
                key={p.num}
                className="group border-t border-line-dark py-9 first:border-t-0 first:pt-0 last:pb-0"
              >
                <div className="flex gap-6 sm:gap-10">
                  <span className="label-mono pt-1.5 text-on-ink/75 transition-colors duration-300 group-hover:text-accent">
                    {p.num}
                  </span>
                  <div>
                    <h3 className="text-xl font-medium tracking-tight sm:text-2xl">
                      {p.title}
                    </h3>
                    <p className="mt-2.5 max-w-lg text-[15px] leading-relaxed text-on-ink/75">
                      {p.text}
                    </p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}
