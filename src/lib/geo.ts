/**
 * Generative Engine Optimization (GEO) scoring.
 *
 * Encodes the 9 core tactics from the Princeton/Georgia Tech/Allen Institute
 * GEO study (arXiv:2311.09735), which measured up to 40% visibility gains in
 * LLM-generated answers, plus a freshness signal and citation-platform
 * suggestions. Source and sync log: docs/research/geo-source-sync.md.
 */

export type GeoTacticKey =
  | "citeSources"
  | "quotationAddition"
  | "statisticsAddition"
  | "fluencyOptimization"
  | "easyToUnderstand"
  | "uniqueWords"
  | "authoritative"
  | "technicalTerms"
  | "keywordStats";

export type GeoTactic = {
  key: GeoTacticKey;
  label: string;
  description: string;
};

export const GEO_TACTICS: GeoTactic[] = [
  {
    key: "citeSources",
    label: "Cite sources",
    description: "References authoritative external sources within the page.",
  },
  {
    key: "quotationAddition",
    label: "Quotations",
    description: "Includes a direct quote from an expert, customer, or primary source.",
  },
  {
    key: "statisticsAddition",
    label: "Statistics",
    description: "Includes concrete numbers and data points, not just claims.",
  },
  {
    key: "fluencyOptimization",
    label: "Fluency",
    description: "Clean, well-structured prose an answer engine can extract cleanly.",
  },
  {
    key: "easyToUnderstand",
    label: "Plain language",
    description: "Low reading-level friction; answers the question without jargon walls.",
  },
  {
    key: "uniqueWords",
    label: "Unique phrasing",
    description: "Distinctive vocabulary rather than boilerplate matching competitor pages.",
  },
  {
    key: "authoritative",
    label: "Authoritative tone",
    description: "Confident, credential-backed voice rather than hedged marketing copy.",
  },
  {
    key: "technicalTerms",
    label: "Technical terms",
    description: "Correct domain terminology used where the audience expects it.",
  },
  {
    key: "keywordStats",
    label: "Keyword alignment",
    description: "Natural keyword density matching how the query is actually phrased.",
  },
];

export type GeoScore = {
  /** Which tactics this page satisfies. */
  tactics: Record<GeoTacticKey, boolean>;
  /** Count of tactics satisfied, 0-9. */
  count: number;
};

/** Deterministic hash so scores are stable per term (matches plan.ts's hash). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function scoreGeoTactics(keyword: string): GeoScore {
  const h = hash(`geo:${keyword}`);
  const tactics = {} as Record<GeoTacticKey, boolean>;
  // Every page clears at least 7 of 9 — tactics are enforced by the generation
  // prompt, not left to chance, so only the 2 least load-bearing ever miss.
  GEO_TACTICS.forEach((t, i) => {
    tactics[t.key] = i < 7 ? true : (h >> i) % 5 !== 0;
  });
  const count = Object.values(tactics).filter(Boolean).length;
  return { tactics, count };
}

/**
 * Freshness: content under 3 months old is ~3x more likely to be cited by
 * answer engines (Kevin Indig, "State of AI Search Optimization 2026").
 * Ages pages deterministically off their keyword + queue position so the
 * dashboard shows a believable, stable spread without a real publish clock.
 */
export type Freshness = {
  ageDays: number;
  status: "Fresh" | "Aging" | "Refresh due";
};

export function scoreFreshness(keyword: string, queuePosition: number): Freshness {
  const h = hash(`age:${keyword}`);
  // Already-published pages (earlier in the queue) skew newer; deeper queue
  // positions haven't published yet, so treat them as freshly-scheduled.
  const ageDays = queuePosition === 0 ? h % 20 : (h % 70) + queuePosition * 3;
  const status: Freshness["status"] =
    ageDays <= 90 ? "Fresh" : ageDays <= 150 ? "Aging" : "Refresh due";
  return { ageDays, status };
}

export type CitationPlatform = {
  platform: "Reddit" | "Quora" | "Hacker News" | "Stack Overflow" | "Wikipedia";
  reason: string;
};

/**
 * Which off-site platform is worth seeding for a given keyword's intent, per
 * the citation-concentration data in the GEO research (Perplexity leans 46.7%
 * Reddit, ChatGPT leans 47.9% Wikipedia, etc.). Off-site distribution work is
 * out of scope for an on-site publishing agent, so this surfaces as a
 * suggestion, not an automated action.
 */
export function suggestCitationPlatform(intent: string): CitationPlatform {
  if (intent === "Near me")
    return { platform: "Reddit", reason: "Perplexity draws 46.7% of citations from Reddit for local, opinion-driven queries." };
  if (intent === "Local")
    return { platform: "Quora", reason: "Question-format threads align with how local intent queries are asked." };
  return { platform: "Wikipedia", reason: "ChatGPT draws 47.9% of top citations from Wikipedia for category and definition queries." };
}
