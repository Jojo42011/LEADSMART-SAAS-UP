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
import { scoreGeoTactics, scoreFreshness, suggestCitationPlatform, type GeoScore, type Freshness, type CitationPlatform } from "./geo";

export type KeywordRow = {
  term: string;
  intent: "Service" | "Local" | "Near me";
  volume: number;
  difficulty: "Low" | "Medium" | "High";
  /** Business potential 0-100: how likely this keyword converts, not just ranks. */
  potential: number;
  /** True when the owner asked for this keyword in their wishlist. */
  wishlisted: boolean;
  status: "Tracking" | "Queued";
  /** Off-site platform worth seeding for this keyword's citation profile. */
  citationPlatform: CitationPlatform;
};

export type PillarScores = {
  substance: number;
  signal: number;
  structure: number;
};

export type PriorityFix = {
  /** On-page factor priority group, causal not correlational (Kyle Roof / US Patent 10,540,263). */
  group: "A" | "B" | "C" | "D";
  label: string;
};

export type Veto = {
  triggered: boolean;
  reason: string | null;
};

export type PageDraft = {
  title: string;
  keyword: string;
  status: "Drafting" | "Queued" | "Researching";
  note: string;
  /** Target audit score the page must clear before publishing. Capped at 59 if vetoed. */
  audit: number;
  grade: "A" | "B";
  pillars: PillarScores;
  /** Information gain vs. the current top-ranking pages, 0-1. Must clear 0.50. */
  infoGain: number;
  /** AI retrievability 0-100: how citable the page is for AI answer engines. */
  retrievability: number;
  /** Which of the 9 GEO tactics this page satisfies, weighted and penalized. */
  geo: GeoScore;
  /** Content age and refresh status; fresher pages are more citable. */
  freshness: Freshness;
  /** Schema.org types this page carries. */
  schemaTypes: string[];
  /** How many required fields are populated across those schemas, 0-100. */
  schemaRichness: number;
  /** A single critical-failure check that caps the whole page's score when triggered. */
  veto: Veto;
  /** The one fix the agent works next, ordered by causal on-page priority. */
  priorityFix: PriorityFix;
  /** Hub pages are broad overviews; spokes are long-tail pages linking back to a hub. */
  role: "hub" | "spoke";
};

export type GapType = "Core" | "Differentiator" | "Commodity" | "Opportunity";

export type GapItem = {
  keyword: string;
  type: GapType;
  action: string;
};

export type CompetitorRow = {
  name: string;
  overlap: number;
  keywords: number;
  referringDomains: number;
  /** Keywords they cover that the site doesn't yet, classified by gap type. */
  gapItems: GapItem[];
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

export type CycleDigest = {
  summary: string;
  actions: string[];
};

export type Plan = {
  keywords: KeywordRow[];
  pages: PageDraft[];
  competitors: CompetitorRow[];
  roadmap: RoadmapPeriod[];
  /** Site-level Ascent Method scores, averaged across the queue. */
  pillars: PillarScores;
  /** Site-level AI retrievability, averaged across the queue. */
  retrievability: number;
  /** One 0-100 site health number, trending cycle over cycle. */
  ascentScore: { value: number; delta: number };
  /** What the same organic clicks would cost in ads, per month. */
  trafficValue: number;
  /** Agent-written plain-English digest of the current cycle. */
  digest: CycleDigest;
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

/**
 * Causal on-page fix priority (Group A > B > C > D, Kyle Roof / US Patent
 * 10,540,263): title/body/URL/H1 first, then headings and internal-link
 * anchors, then bold/alt-text, then schema/meta description last — schema
 * and meta description have no direct ranking effect, only SERP-feature/CTR
 * effect. Derived from whichever pillar is weakest for this page.
 */
function derivePriorityFix(pillars: PillarScores): PriorityFix {
  const weakest = (Object.entries(pillars) as [keyof PillarScores, number][]).sort((a, b) => a[1] - b[1])[0][0];
  if (weakest === "substance")
    return { group: "A", label: "Deepen body content — title, body and H1 carry the most ranking weight" };
  if (weakest === "signal")
    return { group: "B", label: "Add contextual internal links with descriptive anchor text" };
  return { group: "D", label: "Round out schema and meta details — supports SERP features and AI citation, not rankings directly" };
}

/** Deterministic red-flag checks that cap a page's score regardless of pillar strength. */
function checkVeto(term: string): Veto {
  const h = hash(`veto:${term}`);
  if (h % 31 === 0) return { triggered: true, reason: "Title/content mismatch risk — tighten the title to match what the page actually delivers" };
  if (h % 37 === 0) return { triggered: true, reason: "Potential internal contradiction between sections — needs a consistency pass" };
  return { triggered: false, reason: null };
}

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
  const push = (term: string, intent: KeywordRow["intent"], wishlisted = false) => {
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
      potential: Math.min(98, intentBase + (h % 28) + (wishlisted ? 14 : 0)),
      wishlisted,
      status: "Tracking",
      citationPlatform: suggestCitationPlatform(intent),
    });
  };

  // Owner's wishlist seeds the queue first.
  for (const term of parseList(data.market.wishlist)) {
    const lower = term.toLowerCase();
    const intent: KeywordRow["intent"] = lower.includes("near me")
      ? "Near me"
      : locations.some((l) => lower.includes(l.toLowerCase()))
        ? "Local"
        : "Service";
    push(term, intent, true);
  }

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

  const buildPage = (k: KeywordRow, i: number, role: PageDraft["role"]): PageDraft => {
    const h = hash(k.term);
    const service =
      services.find((s) => k.term.startsWith(s.toLowerCase()) || k.term.endsWith(s.toLowerCase())) ??
      k.term.replace(/^best\s+/, "");
    const location = k.intent === "Local" ? k.term.slice(service.length).trim() : "";
    const geo = scoreGeoTactics(k.term, data.market.industry);
    const schemaTypes =
      role === "hub" ? ["Organization", "FAQPage", "BreadcrumbList"] : ["LocalBusiness", "FAQPage", "BreadcrumbList"];
    const schemaRichness = 70 + (h % 31); // 5+ populated attributes is the bar for full credit
    const structureBonus = schemaRichness >= 90 ? 2 : 0;
    const pillars: PillarScores = {
      substance: 88 + (h % 11),
      signal: 84 + (h % 13),
      structure: Math.min(100, 90 + (h % 9) + structureBonus),
    };
    const veto = checkVeto(k.term);
    const rawAudit = Math.round((pillars.substance + pillars.signal + pillars.structure) / 3);
    const audit = veto.triggered ? Math.min(rawAudit, 59) : rawAudit;
    return {
      title:
        role === "hub"
          ? `${titleCase(service)}: Complete Guide`
          : location && k.term.startsWith(service.toLowerCase())
            ? `${titleCase(service)} in ${titleCase(location)}`
            : titleCase(k.term),
      keyword: k.term,
      status: i === 0 ? "Drafting" : i < 3 ? "Queued" : "Researching",
      note: veto.triggered
        ? "Held for revision — failed a critical check"
        : i === 0
          ? "Writing now, publishes after audit"
          : i < 3
            ? "Scheduled this cycle"
            : role === "hub"
              ? "Hub page — publishes after its spokes are live and linking to it"
              : "Gathering competitor coverage",
      audit,
      grade: audit >= 92 ? "A" : "B",
      pillars,
      infoGain: Math.round((0.52 + (h % 34) / 100) * 100) / 100,
      retrievability: geo.score,
      geo,
      freshness: scoreFreshness(k.term, i),
      schemaTypes,
      schemaRichness,
      veto,
      priorityFix: derivePriorityFix(pillars),
      role,
    };
  };

  // Spokes first (long-tail location pages), a hub last — a hub published
  // before its spokes exist launches as a link-less orphan.
  const spokeKeywords = keywords.filter((k) => k.intent === "Local" || k.wishlisted).slice(0, 5);
  const hubKeyword = keywords.find((k) => k.intent === "Service");

  const pages: PageDraft[] = [
    ...spokeKeywords.map((k, i) => buildPage(k, i, "spoke")),
    ...(hubKeyword ? [buildPage(hubKeyword, spokeKeywords.length, "hub")] : []),
  ];

  const pillars: PillarScores =
    pages.length > 0
      ? {
          substance: Math.round(pages.reduce((s, p) => s + p.pillars.substance, 0) / pages.length),
          signal: Math.round(pages.reduce((s, p) => s + p.pillars.signal, 0) / pages.length),
          structure: Math.round(pages.reduce((s, p) => s + p.pillars.structure, 0) / pages.length),
        }
      : { substance: 0, signal: 0, structure: 0 };

  /* ----------------------------- Competitors ---------------------------- */

  const GAP_TYPES: GapType[] = ["Core", "Differentiator", "Commodity", "Opportunity"];
  const GAP_ACTIONS: Record<GapType, string> = {
    Core: "All top competitors cover this substantively — must add this cycle",
    Differentiator: "Some competitors cover it and outrank you — add if scope allows",
    Commodity: "Everyone covers this shallowly — a sentence is enough, don't overbuild",
    Opportunity: "No competitor owns this angle — a real chance to lead the page",
  };

  const competitors: CompetitorRow[] = parseList(data.market.competitors).map((name) => {
    const h = hash(name.toLowerCase());
    const gapItems: GapItem[] = keywords
      .filter((k) => hash(name.toLowerCase() + k.term) % 3 === 0)
      .slice(0, 4)
      .map((k) => {
        const type = GAP_TYPES[hash(name.toLowerCase() + "type" + k.term) % GAP_TYPES.length];
        return { keyword: k.term, type, action: GAP_ACTIONS[type] };
      });
    return {
      name,
      overlap: 42 + (h % 47),
      keywords: 18 + (h % 60),
      referringDomains: 40 + (h % 380),
      gapItems,
      gapCount: gapItems.length + 2 + (h % 14),
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
      focus: "Spoke pages: service and location coverage",
      pages: perMonth,
      samples: sampleTitles(keywords.filter((k) => k.intent === "Local"), 3),
    },
    {
      period: "Days 31-60",
      focus: "Hub pages and near-me / comparison intent",
      pages: perMonth,
      samples: sampleTitles(keywords.filter((k) => k.intent !== "Local"), 3),
    },
    {
      period: "Days 61-90",
      focus: "Competitor gap closure and refreshes",
      pages: perMonth,
      samples: competitors[0]?.gapItems.slice(0, 3).map((g) => titleCase(g.keyword)) ?? sampleTitles(keywords, 3),
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

  /* ------------------- Traffic value, score, digest --------------------- */

  // What the same clicks would cost in ads, using difficulty as a CPC proxy.
  const CPC: Record<KeywordRow["difficulty"], number> = { Low: 1.8, Medium: 3.2, High: 5.6 };
  const trafficValue =
    Math.round(keywords.reduce((s, k) => s + k.volume * 0.12 * CPC[k.difficulty], 0) / 50) * 50;

  const retrievability =
    pages.length > 0
      ? Math.round(pages.reduce((s, p) => s + p.retrievability, 0) / pages.length)
      : 0;

  const totalGaps = competitors.reduce((s, c) => s + c.gapCount, 0);
  const pillarsAvg = Math.round((pillars.substance + pillars.signal + pillars.structure) / 3);
  const ascentScore = {
    value: Math.max(
      0,
      Math.round(pillarsAvg * 0.6 + retrievability * 0.25 + Math.min(100, keywords.length * 4) * 0.15) -
        Math.min(9, Math.round(totalGaps / 4))
    ),
    delta: pages.length > 0 ? 2 + (hash(data.market.services) % 4) : 0,
  };

  const queued = keywords.filter((k) => k.status === "Queued").length;
  const vetoedCount = pages.filter((p) => p.veto.triggered).length;
  const digest: CycleDigest = {
    summary:
      pages.length > 0
        ? `Focus this cycle: ${pages[0].title.toLowerCase()} — the highest-potential gap in your market. ${
            totalGaps > 0
              ? `Competitor coverage still leads yours on ${totalGaps} keywords, so the queue works those next.`
              : "Coverage is ahead of your listed competitors; the queue is deepening topical authority."
          }`
        : "Add services and locations in Settings and the agent will plan its first cycle.",
    actions: [
      ...(pages.length > 0
        ? [`Started drafting "${pages[0].title}" targeting ${pages[0].keyword}`]
        : []),
      `Prioritized ${queued} of ${keywords.length} tracked keywords for the queue`,
      ...(competitors.length > 0
        ? [`Mapped ${totalGaps} keyword gaps across ${competitors.length} competitor${competitors.length > 1 ? "s" : ""}`]
        : []),
      ...(roadmap.length > 0 ? [`Scheduled ${roadmap[0].pages} pages for the next 30 days`] : []),
      ...(pages.length > 0
        ? [`Ran retrievability checks: queue average ${retrievability}/100 for AI answers`]
        : []),
      ...(vetoedCount > 0
        ? [`Held ${vetoedCount} page${vetoedCount > 1 ? "s" : ""} back on a critical check — fixing before these publish`]
        : []),
    ],
  };

  return {
    keywords,
    pages,
    competitors,
    roadmap,
    pillars,
    retrievability,
    ascentScore,
    trafficValue,
    digest,
    projection,
  };
}
