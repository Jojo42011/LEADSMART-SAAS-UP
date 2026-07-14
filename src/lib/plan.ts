/**
 * Derives the agent's working plan (keywords, page drafts, competitors)
 * from the onboarding answers. Deterministic on the inputs so the
 * dashboard renders the same plan on every visit. Replaced by real
 * agent output once the backend lands.
 */

import type { OnboardingData } from "./onboarding";

export type KeywordRow = {
  term: string;
  intent: "Service" | "Local" | "Near me";
  volume: number;
  difficulty: "Low" | "Medium" | "High";
  status: "Tracking" | "Queued";
};

export type PageDraft = {
  title: string;
  keyword: string;
  status: "Drafting" | "Queued" | "Researching";
  note: string;
};

export type CompetitorRow = {
  name: string;
  overlap: number;
  keywords: number;
  note: string;
};

export type Plan = {
  keywords: KeywordRow[];
  pages: PageDraft[];
  competitors: CompetitorRow[];
};

function parseList(raw: string): string[] {
  return raw
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Small deterministic hash so volumes/scores are stable per term. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function titleCase(s: string): string {
  return s.replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1));
}

export function buildPlan(data: OnboardingData): Plan {
  const services = parseList(data.market.services);
  const locations = Array.from(
    new Set(
      [...parseList(data.market.locations), data.business.city, data.business.serviceArea]
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );

  const keywords: KeywordRow[] = [];
  const seen = new Set<string>();
  const push = (term: string, intent: KeywordRow["intent"]) => {
    const key = term.toLowerCase();
    if (seen.has(key) || keywords.length >= 24) return;
    seen.add(key);
    const h = hash(key);
    keywords.push({
      term: key,
      intent,
      volume: 90 + (h % 38) * 30,
      difficulty: (["Low", "Low", "Medium", "Medium", "High"] as const)[h % 5],
      status: keywords.length < 8 ? "Queued" : "Tracking",
    });
  };

  for (const service of services) {
    for (const location of locations) push(`${service} ${location}`, "Local");
    push(`${service} near me`, "Near me");
    push(`best ${service}`, "Service");
  }

  const pages: PageDraft[] = keywords
    .filter((k) => k.intent === "Local")
    .slice(0, 6)
    .map((k, i) => {
      const words = k.term.split(" ");
      const service = services.find((s) => k.term.startsWith(s.toLowerCase())) ?? words[0];
      const location = k.term.slice(service.length).trim();
      return {
        title: location ? `${titleCase(service)} in ${titleCase(location)}` : titleCase(k.term),
        keyword: k.term,
        status: i === 0 ? "Drafting" : i < 3 ? "Queued" : "Researching",
        note:
          i === 0
            ? "Writing now, publishes after audit"
            : i < 3
              ? "Scheduled this cycle"
              : "Gathering competitor coverage",
      };
    });

  const competitors: CompetitorRow[] = parseList(data.market.competitors).map((name) => {
    const h = hash(name.toLowerCase());
    return {
      name,
      overlap: 42 + (h % 47),
      keywords: 18 + (h % 60),
      note: h % 2 === 0 ? "Strong local landing pages" : "Thin service coverage, gap to exploit",
    };
  });

  return { keywords, pages, competitors };
}
