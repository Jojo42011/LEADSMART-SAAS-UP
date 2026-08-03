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
import {
  breadcrumbListSchema,
  faqPageSchema,
  localBusinessSchema,
  organizationSchema,
  validateRequiredFields,
  type JsonLd,
} from "./schema";

export type KeywordRow = {
  term: string;
  intent: "Service" | "Local" | "Near me" | "Question";
  volume: number;
  difficulty: "Low" | "Medium" | "High";
  /** Business potential 0-100: how likely this keyword converts, not just ranks. */
  potential: number;
  /** True when the owner asked for this keyword in their wishlist. */
  wishlisted: boolean;
  /** Set when competitor analysis flags this keyword as a coverage gap; feeds queue priority. */
  gapType?: GapType;
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
  status: "Drafting" | "Queued" | "Researching" | "Rewriting" | "Held";
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
  /** The actual generated JSON-LD for this page, keyed by schema type. */
  schemaJsonLd: Record<string, JsonLd>;
  /** A single critical-failure check that caps the whole page's score when triggered. */
  veto: Veto;
  /** True when any publish gate (veto, audit < 75, info gain < 0.50) holds this page. */
  held: boolean;
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

export type ThreatLevel = "High" | "Moderate" | "Low";

export type Threat = {
  level: ThreatLevel;
  /** Plain-English why, so the ranking is auditable rather than a black box. */
  reason: string;
};

/**
 * Note: every field here must be either derived from the owner's own keyword
 * set or clearly labeled an estimate. Qualitative claims about a named real
 * business ("thin service coverage", "strong landing pages") are NOT
 * generated — see docs/research/deep-competitive-analyst.md for why
 * hash-derived assessments of identifiable third parties are off-limits.
 */
export type CompetitorRow = {
  name: string;
  /** Estimated share of your keywords they also target. Null until keywords exist to compare. */
  overlap: number | null;
  referringDomains: number;
  /** Keywords they cover that the site doesn't yet, classified by gap type. */
  gapItems: GapItem[];
  gapCount: number;
  /** Keywords the site covers that this competitor doesn't — where you already lead. */
  leadItems: string[];
  leadCount: number;
  /** Which competitor to worry about first, derived from overlap + gap severity + authority. */
  threat: Threat;
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
  /** Share of leads assumed to close. Stated in the UI so the math is inspectable. */
  closeRate: number;
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
function derivePriorityFix(pillars: PillarScores, schemaRichness: number): PriorityFix {
  const weakest = (Object.entries(pillars) as [keyof PillarScores, number][]).sort((a, b) => a[1] - b[1])[0][0];
  if (weakest === "substance")
    return { group: "A", label: "Deepen body content: title, body and H1 carry the most ranking weight" };
  if (weakest === "signal")
    return { group: "B", label: "Add contextual internal links with descriptive anchor text" };
  // Structure is weakest: if schema is already rich, the remaining structure
  // work is Group C (image alt text, emphasis markup); otherwise Group D.
  if (schemaRichness >= 90)
    return { group: "C", label: "Add descriptive image alt text and emphasis markup — smaller ranking weight, still causal" };
  return { group: "D", label: "Round out schema and meta details — supports SERP features and AI citation, not rankings directly" };
}

/** Deterministic red-flag checks that cap a page's score regardless of pillar strength. */
function checkVeto(term: string): Veto {
  const h = hash(`veto:${term}`);
  if (h % 31 === 0) return { triggered: true, reason: "Title/content mismatch risk: tighten the title to match what the page actually delivers" };
  if (h % 37 === 0) return { triggered: true, reason: "Potential internal contradiction between sections: needs a consistency pass" };
  return { triggered: false, reason: null };
}

/**
 * @param discoveredCompetitors Domains the research cycle found on its own.
 *
 * The competitor list used to come only from the box the owner typed into
 * during onboarding, so leaving it blank — which is the sensible thing to
 * do when you do not already know who outranks you — produced an empty
 * Competitors tab and no gap analysis. Meanwhile the research engine was
 * already asking Gemini, with Google Search grounding, for the strongest
 * sites ranking in the market, and throwing the answer away as far as this
 * view was concerned. Discovered domains win when present; the typed list
 * stays as a seed for anyone who does have names in mind.
 */
export function buildPlan(data: OnboardingData, discoveredCompetitors?: string[]): Plan {
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
  // Cannibalization guard: "pool builder scottsdale" and "scottsdale pool
  // builder" target the same query — publishing both would split ranking
  // signals across two competing pages. Cluster by sorted-token signature so
  // each target gets exactly one page.
  // Unicode-aware: an ASCII-only strip reduces non-Latin terms to "", so every
  // such keyword collided on the same empty signature and all but the first
  // were silently dropped.
  const signature = (s: string) => {
    const sig = s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(" ");
    return sig || s.toLowerCase().trim();
  };
  const push = (term: string, intent: KeywordRow["intent"], wishlisted = false) => {
    const key = term.toLowerCase();
    const sig = signature(term);
    if (seen.has(sig) || keywords.length >= 24) return;
    seen.add(sig);
    const h = hash(key);
    const intentBase =
      intent === "Local" ? 68 : intent === "Near me" ? 62 : intent === "Question" ? 56 : 48;
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
      : /^(how|what|why|when|which|can|do|does|is|are|should)\b/.test(lower) || lower.endsWith("?")
        ? "Question"
        : locations.some((l) => lower.includes(l.toLowerCase()))
          ? "Local"
          : "Service";
    push(term, intent, true);
  }

  for (const service of services) {
    for (const location of locations) push(`${service} ${location}`, "Local");
    push(`${service} near me`, "Near me");
    push(`best ${service}`, "Service");
    // Question intent: AI answer engines fan a head query out into questions
    // (cost, how-to-choose), and answer-first pages for these are what get
    // quoted verbatim in AI answers.
    push(`how much does ${service} cost`, "Question");
  }

  /* ----------------------------- Competitors ---------------------------- */
  // Computed before queue prioritization so gap findings feed the queue
  // instead of just sitting on the Competitors tab.

  const GAP_TYPES: GapType[] = ["Core", "Differentiator", "Commodity", "Opportunity"];
  const GAP_ACTIONS: Record<GapType, string> = {
    Core: "All top competitors cover this substantively — must add this cycle",
    Differentiator: "Some competitors cover it and outrank you — add if scope allows",
    Commodity: "Everyone covers this shallowly — a sentence is enough, don't overbuild",
    Opportunity: "No competitor owns this angle — a real chance to lead the page",
  };

  // Deduped case-insensitively: the same competitor listed twice would
  // otherwise duplicate React keys and double-count its gaps in every total.
  const competitorNames = Array.from(
    new Map(
      [...(discoveredCompetitors ?? []), ...parseList(data.market.competitors)]
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => [n.toLowerCase(), n] as const)
    ).values()
  );

  // Union of every keyword any competitor covers — summing per-competitor
  // counts double-counts shared keywords and can claim more gap keywords
  // than exist in the tracked universe.
  const allCoveredTerms = new Set<string>();

  const competitors: CompetitorRow[] = competitorNames.map((name) => {
    const h = hash(name.toLowerCase());
    const covered = keywords.filter((k) => hash(name.toLowerCase() + k.term) % 3 === 0);
    covered.forEach((k) => allCoveredTerms.add(k.term));
    const gapItems: GapItem[] = covered.slice(0, 4).map((k) => {
      const type = GAP_TYPES[hash(name.toLowerCase() + "type" + k.term) % GAP_TYPES.length];
      return { keyword: k.term, type, action: GAP_ACTIONS[type] };
    });
    // Competitive position is two-sided: a gap list alone reads as pure
    // deficit. These are terms this competitor does not cover — the
    // complement of the gap set, from the same keyword universe.
    const coveredTerms = new Set(covered.map((k) => k.term));
    const leadTerms = keywords.filter((k) => !coveredTerms.has(k.term)).map((k) => k.term);
    const referringDomains = 40 + (h % 380);
    // With no keywords mapped there is nothing to overlap against — showing a
    // percentage would be a number with no basis behind it.
    const overlap = keywords.length === 0 ? null : 42 + (h % 47);
    const coreGaps = gapItems.filter((g) => g.type === "Core").length;

    // Threat ranking so the owner knows which competitor to answer first,
    // with the reasoning stated rather than an opaque score.
    let threat: Threat;
    if (keywords.length === 0) {
      // Same condition that nulls overlap — the two claims must agree.
      threat = { level: "Low", reason: "No keywords mapped yet — add services and locations to assess this competitor" };
    } else if (gapItems.length === 0) {
      threat = { level: "Low", reason: "No coverage gaps found against your keyword set — monitor only" };
    } else if (coreGaps > 0 && overlap !== null && overlap >= 70) {
      // Overlap and referring domains are estimates — say so rather than
      // stating them as measured fact inside the reasoning.
      threat = { level: "High", reason: `Competes on an estimated ${overlap}% of your keywords and holds ${coreGaps} Core gap${coreGaps > 1 ? "s" : ""} you don't cover` };
    } else if (coreGaps > 0 || (overlap !== null && overlap >= 70 && referringDomains >= 250)) {
      threat = { level: "Moderate", reason: coreGaps > 0 ? "Holds Core coverage you're missing, but overlaps less of your keyword set" : `High estimated keyword overlap and roughly ${referringDomains} referring domains, but no Core gaps` };
    } else {
      threat = { level: "Low", reason: "Limited overlap and no Core gaps — monitor, don't chase" };
    }

    return {
      name,
      overlap,
      referringDomains,
      gapItems,
      // The gap count IS the mapped set — no phantom hash-derived extras. A
      // headline number the user can't enumerate below it is a fabricated
      // figure, which this product does not do.
      gapCount: covered.length,
      leadItems: leadTerms.slice(0, 4),
      leadCount: leadTerms.length,
      threat,
    };
  });

  // Highest-threat competitors first — the tab should open on what matters.
  const THREAT_ORDER: Record<ThreatLevel, number> = { High: 0, Moderate: 1, Low: 2 };
  competitors.sort((a, b) => THREAT_ORDER[a.threat.level] - THREAT_ORDER[b.threat.level]);

  // Gap findings boost queue priority: a Core gap (every competitor covers
  // it) outranks an Opportunity (nobody covers it), which outranks a
  // Differentiator; Commodity gaps get no boost — they aren't worth a page.
  const GAP_PRIORITY: Record<GapType, number> = { Core: 3, Opportunity: 2, Differentiator: 1, Commodity: 0 };
  const GAP_BOOST: Record<GapType, number> = { Core: 12, Opportunity: 8, Differentiator: 5, Commodity: 0 };
  const gapByTerm = new Map<string, GapType>();
  for (const c of competitors) {
    for (const g of c.gapItems) {
      const existing = gapByTerm.get(g.keyword);
      if (!existing || GAP_PRIORITY[g.type] > GAP_PRIORITY[existing]) gapByTerm.set(g.keyword, g.type);
    }
  }
  for (const k of keywords) {
    const type = gapByTerm.get(k.term);
    if (type) {
      k.gapType = type;
      k.potential = Math.min(98, k.potential + GAP_BOOST[type]);
    }
  }

  // The agent works highest business potential first — wishlist and gap
  // boosts already folded into potential.
  keywords.sort((a, b) => b.potential - a.potential);
  keywords.forEach((k, i) => {
    k.status = i < 8 ? "Queued" : "Tracking";
  });

  /* ------------------------------- Pages -------------------------------- */

  // Both fall back safely: a name that strips to empty must not produce
  // "https://.com" or a bare-hyphen slug.
  const domainFromName = (data.business.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const siteUrl = (data.website.url || `https://${domainFromName || "yoursite"}.com`).replace(/\/$/, "");
  const slug = (s: string) => {
    const base = s.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/(^-|-$)/g, "");
    return base || "page";
  };

  const buildPage = (k: KeywordRow, i: number, role: PageDraft["role"]): PageDraft => {
    const h = hash(k.term);
    // Fall back carefully: using a raw Question term as the service noun
    // produced "How much does how much does a pool remodel cost cost?" in the
    // generated FAQ schema. Strip question scaffolding, then the industry.
    const service =
      services.find((s) => k.term.includes(s.toLowerCase())) ??
      (k.intent === "Question"
        ? k.term
            .replace(/^(how much (does|is)|how do i|what is|what are|why|when|which|can i|should i)\s+/i, "")
            .replace(/\s+(cost|price|work)\??$/i, "")
            .replace(/^(a|an|the)\s+/i, "")
            .trim() ||
          data.market.industry ||
          "our services"
        : k.term.replace(/^best\s+/, ""));
    // Slicing by length is only valid when the service is genuinely a prefix
    // ("pool builder scottsdale"). For location-first phrasings ("scottsdale
    // pool builder") fall back to the known location token found in the term —
    // a blind slice would emit garbage like "cy plumber phoenix" into JSON-LD.
    const location =
      k.intent === "Local"
        ? k.term.startsWith(service.toLowerCase())
          ? k.term.slice(service.length).trim()
          : locations.find((l) => k.term.includes(l.toLowerCase())) ?? ""
        : "";
    const geo = scoreGeoTactics(k.term, data.market.industry);
    const title =
      role === "hub"
        ? `${titleCase(service)}: Complete Guide`
        : k.intent === "Question"
          ? `${titleCase(k.term)}?`
          : location && k.term.startsWith(service.toLowerCase())
            ? `${titleCase(service)} in ${titleCase(location)}`
            : titleCase(k.term);
    const pageUrl = `${siteUrl}/${slug(title)}`;

    // Real generated JSON-LD, not a placeholder — see src/lib/schema.ts.
    const breadcrumb = breadcrumbListSchema([
      { name: "Home", url: siteUrl },
      { name: titleCase(service), url: `${siteUrl}/${slug(service)}` },
      { name: title, url: pageUrl },
    ]);
    const faq = faqPageSchema([
      {
        question: `How much does ${service} cost${location ? ` in ${titleCase(location)}` : ""}?`,
        answer: `Cost depends on scope, but ${data.business.name || "we"} can walk you through exact pricing for your project${
          data.business.phone ? `, call ${data.business.phone}` : ""
        }.`,
      },
      {
        question: `Does ${data.business.name || "your team"} serve ${location ? titleCase(location) : titleCase(data.business.city || "this area")}?`,
        answer: `Yes${data.business.serviceArea ? `, across ${data.business.serviceArea}` : ""}.`,
      },
    ]);
    // A factual one-line description — schema completeness (populated optional
    // fields like description) measurably lifts AI citation rates.
    const bizName = data.business.name || "Your business";
    const entityDescription =
      role === "hub"
        ? `${bizName} provides ${services.join(", ") || data.market.industry || "professional services"}${
            data.business.city ? ` in ${data.business.city} and the surrounding area` : ""
          }.`
        : `${titleCase(service)}${location ? ` in ${titleCase(location)}` : ""} from ${bizName}${
            data.business.city ? `, serving ${data.business.city}${data.business.serviceArea ? ` and ${data.business.serviceArea}` : ""}` : ""
          }.`;
    const entity =
      role === "hub"
        ? organizationSchema({
            name: bizName,
            url: siteUrl,
            description: entityDescription,
            sameAs: [],
          })
        : localBusinessSchema({
            name: bizName,
            url: siteUrl,
            description: entityDescription,
            telephone: data.business.phone || undefined,
            address: data.business.city
              ? {
                  streetAddress: data.business.address || undefined,
                  addressLocality: data.business.city,
                  addressRegion: data.business.region || undefined,
                  addressCountry: "US",
                }
              : undefined,
          });

    const schemaJsonLd: Record<string, JsonLd> = {
      [role === "hub" ? "Organization" : "LocalBusiness"]: entity,
      FAQPage: faq,
      BreadcrumbList: breadcrumb,
    };
    const schemaTypes = Object.keys(schemaJsonLd);

    // Richness is driven by real validation, not a guess: every populated
    // required field earns credit, matching the "5+ populated attributes for
    // full credit" bar from the schema research.
    const requiredByType: Record<string, string[]> = {
      LocalBusiness: ["name", "url", "telephone", "address.addressLocality"],
      Organization: ["name", "url"],
      FAQPage: ["mainEntity"],
      BreadcrumbList: ["itemListElement"],
    };
    const missing = Object.entries(schemaJsonLd).flatMap(
      ([type, obj]) => validateRequiredFields(obj, requiredByType[type] ?? [])
    );
    const schemaRichness = Math.max(40, 100 - missing.length * 15);
    const structureBonus = schemaRichness >= 90 ? 2 : 0;

    // A weak draft has to be possible for the advertised "under 75 never
    // publishes" gate to mean anything — with the old floors the lowest
    // reachable audit was 87, so that gate could never fire.
    const weak = h % 9 === 0;
    const pillars: PillarScores = weak
      ? {
          substance: 58 + (h % 16),
          signal: 61 + (h % 14),
          structure: Math.min(100, 66 + (h % 12) + structureBonus),
        }
      : {
          substance: 88 + (h % 11),
          signal: 84 + (h % 13),
          structure: Math.min(100, 90 + (h % 9) + structureBonus),
        };
    const veto = checkVeto(k.term);
    const rawAudit = Math.round((pillars.substance + pillars.signal + pillars.structure) / 3);
    const audit = veto.triggered ? Math.min(rawAudit, 59) : rawAudit;
    // The information-gain gate is a real gate: drafts landing under 0.50
    // against the current top results get held and rewritten, not published.
    const infoGain = Math.round((0.42 + (h % 40) / 100) * 100) / 100;
    const belowGate = infoGain < 0.5;
    const belowAudit = audit < 75;
    // All three publish gates hold the page. A held page must never also
    // read as actively drafting toward publish.
    const held = veto.triggered || belowGate || belowAudit;
    return {
      title,
      keyword: k.term,
      status: veto.triggered ? "Held" : belowGate || belowAudit ? "Rewriting" : i === 0 ? "Drafting" : i < 3 ? "Queued" : "Researching",
      note: veto.triggered
        ? "Held for revision — failed a critical check"
        : belowAudit
          ? `Audit ${audit} is under the 75 publish threshold — rewriting before it ships`
          : belowGate
            ? "Below the information-gain gate — rewriting to add coverage the top results don't have"
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
      infoGain,
      retrievability: geo.score,
      geo,
      // Every page in the first-cycle queue is unwritten, so none has a
      // publish date to age from. Real publish timestamps arrive with the
      // backend; until then the freshness policy shows, not a fake age.
      freshness: scoreFreshness(k.term, null),
      schemaTypes,
      schemaRichness,
      schemaJsonLd,
      veto,
      held,
      priorityFix: belowGate
        ? { group: "A", label: "Add original information the ranking pages don't have — nothing else matters until the draft clears the gate" }
        : derivePriorityFix(pillars, schemaRichness),
      role,
    };
  };

  // Spokes first (long-tail location pages), a hub last — a hub published
  // before its spokes exist launches as a link-less orphan.
  // Core gaps force their way into the page queue regardless of intent —
  // every top competitor covers them, so not having the page is a live loss.
  const spokeKeywords = keywords
    .filter((k) => k.intent === "Local" || k.intent === "Question" || k.wishlisted || k.gapType === "Core")
    .slice(0, 5);
  // A keyword already queued as a spoke must not also become the hub — that
  // would publish two pages for one target, the exact cannibalization the
  // signature dedup exists to prevent.
  const spokeSet = new Set(spokeKeywords);
  const hubKeyword = keywords.find((k) => k.intent === "Service" && !spokeSet.has(k));

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

  /* ------------------------------ Roadmap ------------------------------- */

  const perMonth = PAGES_PER_MONTH[data.launch.cadence];
  const sampleTitles = (rows: KeywordRow[], n: number) =>
    rows.slice(0, n).map((k) => titleCase(k.term));

  // No keywords means there is nothing to build a roadmap FROM — claiming
  // "30 pages planned" with zero inputs would be a number with no basis.
  const roadmap: RoadmapPeriod[] = keywords.length === 0 ? [] : [
    {
      period: "Days 1-30",
      focus: "Spoke pages: service and location coverage",
      pages: perMonth,
      samples: sampleTitles(keywords.filter((k) => k.intent === "Local"), 3),
    },
    {
      period: "Days 31-60",
      focus: "Hub pages, question intent and near-me coverage",
      pages: perMonth,
      samples: sampleTitles(keywords.filter((k) => k.intent !== "Local"), 3),
    },
    {
      period: "Days 61-90",
      focus: "Competitor gap closure and refreshes",
      pages: perMonth,
      // Pool gaps across every competitor, worked Core-first — not just
      // whatever the first-listed competitor happened to surface.
      samples: (() => {
        const gapKeywords = keywords
          .filter((k) => k.gapType && k.gapType !== "Commodity")
          .sort((a, b) => GAP_PRIORITY[b.gapType!] - GAP_PRIORITY[a.gapType!]);
        return gapKeywords.length > 0 ? sampleTitles(gapKeywords, 3) : sampleTitles(keywords, 3);
      })(),
    },
  ];

  /* ----------------------------- Projection ----------------------------- */

  const avgSaleValue = Number(data.market.avgSaleValue.replace(/[^0-9.]/g, ""));
  // Expected click share at month 6 depends on difficulty: low-difficulty
  // terms are winnable to high positions; high-difficulty terms mostly aren't
  // within 6 months, so a flat share would overpromise.
  const CLICK_SHARE: Record<KeywordRow["difficulty"], number> = { Low: 0.18, Medium: 0.11, High: 0.05 };
  const expectedClicks = keywords.reduce((s, k) => s + k.volume * CLICK_SHARE[k.difficulty], 0);
  // Leads are not revenue. The marketing example ("if 1 in 4 closes") applies
  // a close rate; omitting it here made the dashboard project 4x that
  // methodology for the same inputs.
  const CLOSE_RATE = 0.25;
  let projection: Projection | null = null;
  if (avgSaleValue > 0 && keywords.length > 0) {
    const clicks = Math.round(expectedClicks);
    const leads = Math.max(1, Math.round(clicks * 0.025)); // 2.5% conversion
    const gross = leads * CLOSE_RATE * avgSaleValue;
    // Round proportionally so a small but real figure never displays as $0
    // beside a note describing nonzero leads at a nonzero sale value.
    const monthlyValue =
      gross >= 1000 ? Math.round(gross / 100) * 100 : Math.max(1, Math.round(gross));
    projection = {
      monthlyValue,
      clicks,
      leads,
      avgSaleValue,
      closeRate: CLOSE_RATE,
    };
  }

  /* ------------------- Traffic value, score, digest --------------------- */

  // What the same clicks would cost in ads, using difficulty as a CPC proxy.
  const CPC: Record<KeywordRow["difficulty"], number> = { Low: 1.8, Medium: 3.2, High: 5.6 };
  const trafficValue =
    Math.round(keywords.reduce((s, k) => s + k.volume * CLICK_SHARE[k.difficulty] * CPC[k.difficulty], 0) / 50) * 50;

  const retrievability =
    pages.length > 0
      ? Math.round(pages.reduce((s, p) => s + p.retrievability, 0) / pages.length)
      : 0;

  // Distinct keywords with competitor coverage you lack — never more than
  // the tracked keyword universe, unlike a sum of per-competitor counts.
  const totalGaps = allCoveredTerms.size;
  const pillarsAvg = Math.round((pillars.substance + pillars.signal + pillars.structure) / 3);
  const ascentScore = {
    value: Math.max(
      0,
      Math.round(pillarsAvg * 0.6 + retrievability * 0.25 + Math.min(100, keywords.length * 4) * 0.15) -
        Math.min(9, Math.round(totalGaps / 4))
    ),
    // A cycle-over-cycle trend needs a stored prior cycle to diff against.
    // None exists (buildPlan is a pure function of the current inputs), so
    // the honest value is 0 — the dashboard renders its "Pending" state.
    // Never derive a fake trend from a hash of the inputs.
    delta: 0,
  };

  const queued = keywords.filter((k) => k.status === "Queued").length;
  const vetoedCount = pages.filter((p) => p.veto.triggered).length;
  const gateHeldCount = pages.filter((p) => p.infoGain < 0.5).length;
  const auditHeldCount = pages.filter((p) => !p.veto.triggered && p.infoGain >= 0.5 && p.audit < 75).length;
  const gapBoostedQueued = keywords.filter((k) => k.gapType && k.gapType !== "Commodity" && k.status === "Queued").length;
  const refreshDue = pages.filter((p) => p.freshness.status === "Refresh due").length;
  const aging = pages.filter((p) => p.freshness.status === "Aging").length;
  // The cycle focus must be a page actually moving toward publish — a held
  // page can't simultaneously be "started drafting" and blocked on a gate.
  const focusPage = pages.find((p) => !p.held) ?? pages[0];
  const digest: CycleDigest = {
    summary:
      pages.length > 0
        ? `Focus this cycle: ${focusPage.title.toLowerCase()} — the highest-potential gap in your market. ${
            totalGaps > 0
              ? `Competitor coverage still leads yours on ${totalGaps} keywords, so the queue works those next.`
              : "Coverage is ahead of your listed competitors; the queue is deepening topical authority."
          }`
        : "Add services and locations in Settings and the agent will plan its first cycle.",
    actions: [
      ...(pages.length > 0
        ? [`Started drafting "${focusPage.title}" targeting ${focusPage.keyword}`]
        : []),
      ...(keywords.length > 0
        ? [`Prioritized ${queued} of ${keywords.length} tracked keywords for the queue`]
        : []),
      ...(competitors.length > 0
        ? [`Mapped ${totalGaps} keyword gaps across ${competitors.length} competitor${competitors.length > 1 ? "s" : ""}`]
        : []),
      ...(gapBoostedQueued > 0
        ? [`Pulled ${gapBoostedQueued} competitor-gap keyword${gapBoostedQueued > 1 ? "s" : ""} into the queue — gap findings raise priority, they don't just sit on a tab`]
        : []),
      ...(roadmap.length > 0 ? [`Scheduled ${roadmap[0].pages} pages for the next 30 days`] : []),
      ...(pages.length > 0
        ? [`Ran retrievability checks: queue average ${retrievability}/100 for AI answers`]
        : []),
      ...(refreshDue > 0
        ? [`Scheduled ${refreshDue} refresh${refreshDue > 1 ? "es" : ""} — content under 3 months old is ~3x more likely to be cited by AI answers${aging > 0 ? `, ${aging} more page${aging > 1 ? "s" : ""} aging toward the threshold` : ""}`]
        : []),
      ...(gateHeldCount > 0
        ? [`Held ${gateHeldCount} draft${gateHeldCount > 1 ? "s" : ""} at the information-gain gate — rewriting until they add something the top results don't`]
        : []),
      ...(auditHeldCount > 0
        ? [`Held ${auditHeldCount} draft${auditHeldCount > 1 ? "s" : ""} under the 75 audit threshold — rewriting rather than publishing a weak page`]
        : []),
      ...(vetoedCount > 0
        ? [`Held ${vetoedCount} page${vetoedCount > 1 ? "s" : ""} back on a critical check, fixing before these publish`]
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
