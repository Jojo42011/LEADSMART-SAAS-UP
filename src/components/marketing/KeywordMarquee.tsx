const keywords = [
  "kitchen remodeling austin",
  "divorce attorney denver",
  "custom pool builder scottsdale",
  "hvac repair phoenix",
  "wedding photographer seattle",
  "roof replacement dallas",
  "personal injury lawyer miami",
  "landscape design portland",
  "med spa near me",
  "solar installation san diego",
];

/** Slow scrolling strip of the kinds of searches the agent wins. */
export function KeywordMarquee() {
  const row = [...keywords, ...keywords];
  return (
    <div className="overflow-hidden border-b border-line bg-white py-5">
      <div className="flex w-max animate-marquee gap-3">
        {row.map((k, i) => (
          <span
            key={`${k}-${i}`}
            className="label-mono flex items-center gap-3 whitespace-nowrap text-muted/60"
          >
            <span className="text-accent">&#9642;</span>
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}
