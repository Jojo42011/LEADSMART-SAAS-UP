/**
 * Derives the agent's working plan from the onboarding answers:
 * keywords (scored for business potential), the page queue with
 * Ascent Method pillar scores and information-gain checks, competitor
 * gap analysis, a rolling 90-day roadmap, and a revenue projection.
 *
 * Deterministic on the inputs so the dashboard renders the same plan
 * on every visit. Replaced by real agent output once the backend lands.
 */

import type { Cadence, OnboardingData } from "./onboarding";

export type KeywordRow = {
  term: string;
  intent: "Service" | "Local" | "Near me";
  volume: number;
  difficulty: "Low" | "Medium" | "High";
  /** Business potential 0-100: how likely this keyword converts, not just ranks. */
  potential: number;
  status: "Tracking" | "Queued";
};

export type PillarScores = {
  substance: number;
  signal: number;
  structure: number;
};

export type PageDraft = {
  title: string;
  keyword: string;
  status: "Drafting" | "Queued" | "Researching";
  note: string;
  /** Target audit score the page must clear before publishing. */
  audit: number;
  grade: "A" | "B";
  pillars: PillarScores;
  /** Information gain vs. the current top-ranking pages, 0-1. Must clear 0.50. */
  infoGain: number;
};

export type CompetitorRow = {
  name: string;
  overlap: number;
  keywords: number;
  referringDomains: number;
  /** Keywords they cover that the site doesn't yet — each becomes a queued page. */
  gapKeywords: string[];
  gapCount: number;
  note: string;
};

export type RoadmapPeriod = {
  period: string;
  focus: string;
  pages: number;
  samples: string[];
};

export type Projection = {
  monthlyValue: number;
  clicks: number;
  leads: number;
  avgSaleValue: number;
};

export type Plan = {
  keywords: KeywordRow[];
  pages: PageDraft[];
  competitors: CompetitorRow[];
  roadmap: RoadmapPeriod[];
  /** Site-level Ascent Method scores, averaged across the queue. */
  pillars: PillarScores;
  /** Dollarized projection; null until an average sale value is set. */
  projection: Projection | null;
};

function parseList(raw: string): string[] {
  return raw
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Small deterministic hash so scores are stable per term. */
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

const PAGES_PER_MONTH: Record<Cadence, number> = {
  daily: 30,
  every3days: 10,
  weekly: 4,
};

export function buildPlan(data: OnboardingData): Plan {
  const services = parseList(data.market.services);
  const locations = Array.from(
    new Set(
      [...parseList(data.market.locations), data.business.city, data.business.serviceArea]
        .flatMap((s) => parseList(s))
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );

  /* ------------------------------ Keywords ------------------------------ */

  const keywords: KeywordRow[] = [];
  const seen = new Set<string>();
  const push = (term: string, intent: KeywordRow["intent"]) => {
    const key = term.toLowerCase();
    if (seen.has(key) || keywords.length >= 24) return;
    seen.add(key);
    const h = hash(key);
    const intentBase = intent === "Local" ? 68 : intent === "Near me" ? 62 : 48;
    keywords.push({
      term: key,
      intent,
      volume: 90 + (h % 38) * 30,
      difficulty: (["Low", "Low", "Medium", "Medium", "High"] as const)[h % 5],
      potential: Math.min(98, intentBase + (h % 28)),
      status: "Tracking",
    });
  };

  for (const service of services) {
    for (const location of locations) push(`${service} ${location}`, "Local");
    push(`${service} near me`, "Near me");
    push(`best ${service}`, "Service");
  }

  // The agent works highest business potential first.
  keywords.sort((a, b) => b.potential - a.potential);
  keywords.forEach((k, i) => {
    k.status = i < 8 ? "Queued" : "Tracking";
  });

  /* ------------------------------- Pages -------------------------------- */

  const pages: PageDraft[] = keywords
    .filter((k) => k.intent === "Local")
    .slice(0, 6)
    .map((k, i) => {
      const h = hash(k.term);
      const service = services.find((s) => k.term.startsWith(s.toLowerCase())) ?? k.term.split(" ")[0];
      const location = k.term.slice(service.length).trim();
      const pillars: PillarScores = {
        substance: 88 + (h % 11),
        signal: 84 + (h % 13),
        structure: 90 + (h % 9),
      };
      const audit = Math.round((pillars.substance + pillars.signal + pillars.structure) / 3);
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
        audit,
        grade: audit >= 92 ? "A" : "B",
        pillars,
        infoGain: Math.round((0.52 + (h % 34) / 100) * 100) / 100,
      };
    });

  const pillars: PillarScores =
    pages.length > 0
      ? {
          substance: Math.round(pages.reduce((s, p) => s + p.pillars.substance, 0) / pages.length),
          signal: Math.round(pages.reduce((s, p) => s + p.pillars.signal, 0) / pages.length),
          structure: Math.round(pages.reduce((s, p) => s + p.pillars.structure, 0) / pages.length),
        }
      : { substance: 0, signal: 0, structure: 0 };

  /* ----------------------------- Competitors ---------------------------- */

  const competitors: CompetitorRow[] = parseList(data.market.competitors).map((name) => {
    const h = hash(name.toLowerCase());
    const gapKeywords = keywords
      .filter((k) => hash(name.toLowerCase() + k.term) % 3 === 0)
      .slice(0, 4)
      .map((k) => k.term);
    return {
      name,
      overlap: 42 + (h % 47),
      keywords: 18 + (h % 60),
      referringDomains: 40 + (h % 380),
      gapKeywords,
      gapCount: gapKeywords.length + 2 + (h % 14),
      note: h % 2 === 0 ? "Strong local landing pages" : "Thin service coverage, gap to exploit",
    };
  });

  /* ------------------------------ Roadmap ------------------------------- */

  const perMonth = PAGES_PER_MONTH[data.launch.cadence];
  const sampleTitles = (rows: KeywordRow[], n: number) =>
    rows.slice(0, n).map((k) => titleCase(k.term));

  const roadmap: RoadmapPeriod[] = [
    {
      period: "Days 1-30",
      focus: "Service and location coverage",
      pages: perMonth,
      samples: sampleTitles(keywords.filter((k) => k.intent === "Local"), 3),
    },
    {
      period: "Days 31-60",
      focus: "Near-me and comparison intent",
      pages: perMonth,
      samples: sampleTitles(keywords.filter((k) => k.intent !== "Local"), 3),
    },
    {
      period: "Days 61-90",
      focus: "Competitor gap closure and refreshes",
      pages: perMonth,
      samples: competitors[0]?.gapKeywords.slice(0, 3).map(titleCase) ?? sampleTitles(keywords, 3),
    },
  ];

  /* ----------------------------- Projection ----------------------------- */

  const avgSaleValue = Number(data.market.avgSaleValue.replace(/[^0-9.]/g, ""));
  let projection: Projection | null = null;
  if (avgSaleValue > 0 && keywords.length > 0) {
    const totalVolume = keywords.reduce((s, k) => s + k.volume, 0);
    const clicks = Math.round(totalVolume * 0.12); // ~12% click share at month 6
    const leads = Math.max(1, Math.round(clicks * 0.025)); // 2.5% conversion
    projection = {
      monthlyValue: Math.round((leads * avgSaleValue) / 100) * 100,
      clicks,
      leads,
      avgSaleValue,
    };
  }

  return { keywords, pages, competitors, roadmap, pillars, projection };
}
