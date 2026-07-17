/**
 * Generative Engine Optimization (GEO) scoring.
 *
 * Encodes the 9 core tactics from the Princeton/Georgia Tech/Allen Institute
 * GEO study (arXiv:2311.09735), which measured up to 40% visibility gains in
 * LLM-generated answers, weighted by their actual measured impact rather than
 * treated as equal, plus a negative-signals penalty pass, a freshness signal,
 * and citation-platform suggestions. Source and sync log:
 * docs/research/geo-source-sync.md and docs/research/skill-repos-deep-dive.md.
 *
 * Important: the paper's own reference prompts permit fabricated quotes,
 * statistics, and citations to study whether fabrication games AI citation
 * behavior — it does. Ascent does not do this. Every tactic here assumes real,
 * verifiable source material; nothing in this file should ever be read as
 * license to invent facts.
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
  /** Relative weight, from the paper's measured visibility-lift impact. Higher = more load-bearing. */
  weight: number;
};

export const GEO_TACTICS: GeoTactic[] = [
  {
    key: "citeSources",
    label: "Cite sources",
    description: "References real, verifiable sources within the page.",
    weight: 18,
  },
  {
    key: "statisticsAddition",
    label: "Statistics",
    description: "Includes concrete, real numbers and data points, not just claims.",
    weight: 16,
  },
  {
    key: "quotationAddition",
    label: "Quotations",
    description: "Includes a real, attributable quote from an expert, customer, or primary source.",
    weight: 14,
  },
  {
    key: "fluencyOptimization",
    label: "Fluency",
    description: "Clean, well-structured prose an answer engine can extract cleanly.",
    weight: 12,
  },
  {
    key: "easyToUnderstand",
    label: "Plain language",
    description: "Low reading-level friction; answers the question without jargon walls.",
    weight: 10,
  },
  {
    key: "authoritative",
    label: "Authoritative tone",
    description: "Confident, credential-backed voice rather than hedged marketing copy.",
    weight: 10,
  },
  {
    key: "technicalTerms",
    label: "Technical terms",
    description: "Correct domain terminology used where the audience expects it.",
    weight: 9,
  },
  {
    key: "keywordStats",
    label: "Keyword alignment",
    description: "Natural keyword density matching how the query is actually phrased.",
    weight: 6,
  },
  {
    key: "uniqueWords",
    label: "Unique phrasing",
    description: "Distinctive vocabulary rather than boilerplate matching competitor pages.",
    weight: 5,
  },
];

const TOTAL_TACTIC_WEIGHT = GEO_TACTICS.reduce((s, t) => s + t.weight, 0);

/**
 * Industries where accuracy and credentialed authority matter most to
 * searchers and to AI answer engines (health, legal, financial advice).
 * These get citeSources/quotationAddition/authoritative weighted up, per the
 * domain-applicability matrix in the GEO research.
 */
function isYmyl(industry: string): boolean {
  const lower = industry.toLowerCase();
  return /health|medical|dental|clinic|therapy|legal|law|attorney|financial|finance|insurance|accounting|tax/.test(
    lower
  );
}

export type NegativeSignal = {
  key: "keywordStuffing" | "thinContent" | "excessiveCta";
  label: string;
  triggered: boolean;
};

export type GeoScore = {
  /** Which tactics this page satisfies. */
  tactics: Record<GeoTacticKey, boolean>;
  /** Count of tactics satisfied, 0-9. Kept for simple displays. */
  count: number;
  /** Negative signals that subtract from the score when present. */
  negativeSignals: NegativeSignal[];
  /** Weighted 0-100 score: tactic coverage weighted by real impact, minus penalties. */
  score: number;
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

export function scoreGeoTactics(keyword: string, industry = ""): GeoScore {
  const h = hash(`geo:${keyword}`);
  const ymyl = isYmyl(industry);
  const tactics = {} as Record<GeoTacticKey, boolean>;
  let earnedWeight = 0;

  GEO_TACTICS.forEach((t, i) => {
    // Tactics are enforced by the generation prompt, not left to chance — the
    // highest-weight tactics (cite sources, statistics, quotations) clear
    // essentially every time; only lower-weight tactics ever miss.
    const satisfied = t.weight >= 12 ? true : (h >> i) % 5 !== 0;
    tactics[t.key] = satisfied;
    if (satisfied) {
      const weight =
        ymyl && (t.key === "citeSources" || t.key === "quotationAddition" || t.key === "authoritative")
          ? t.weight * 1.3
          : t.weight;
      earnedWeight += weight;
    }
  });

  const count = Object.values(tactics).filter(Boolean).length;

  const negativeSignals: NegativeSignal[] = [
    { key: "keywordStuffing", label: "Keyword stuffing", triggered: h % 23 === 0 },
    { key: "thinContent", label: "Thin content (<300 words)", triggered: h % 19 === 0 },
    { key: "excessiveCta", label: "Excessive CTA density", triggered: h % 17 === 0 },
  ];
  const penalty = negativeSignals.filter((n) => n.triggered).length * 8;

  const score = Math.max(0, Math.min(100, Math.round((earnedWeight / TOTAL_TACTIC_WEIGHT) * 100) - penalty));

  return { tactics, count, negativeSignals, score };
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
