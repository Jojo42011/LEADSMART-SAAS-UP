import { Counter } from "@/components/ui/Counter";
import { Reveal } from "@/components/ui/Reveal";

// Each of these is a property of the system's design, not a measured
// outcome from a customer base that does not exist yet. The audit figure
// states the enforced publish threshold rather than an "average at
// publish", which would be a performance claim with nothing behind it.
const stats = [
  { value: 365, suffix: "", label: "Pages published per site per year, at daily cadence" },
  { value: 75, suffix: "/100", label: "Minimum audit score to publish — below it, pages are rewritten" },
  { value: 24, suffix: "h", label: "Full cycle, research to live page" },
  { value: 0, suffix: "", label: "Hours of your time required", literal: "Zero" },
];

export function StatStrip() {
  return (
    <section className="border-y border-line bg-paper-warm">
      <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-line md:grid-cols-4">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.08} className="px-6 py-10 md:px-10">
            <div className="font-display text-4xl tracking-tight sm:text-5xl">
              {s.literal ? (
                <span>{s.literal}</span>
              ) : (
                <Counter to={s.value} suffix={s.suffix} />
              )}
            </div>
            <p className="mt-2.5 text-[13px] leading-snug text-muted">
              {s.label}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
