import { gemini, geminiConfigured, parseJson } from "@/lib/gemini";

/**
 * Phase 1 of the cycle: live market research. Google Search grounded via
 * Gemini when configured; deterministic expansion of services and
 * locations otherwise, so the pipeline always produces targets.
 */

export type ResearchInput = {
  business: { name: string; city: string; region: string };
  market: { industry: string; services: string; locations: string; competitors: string };
  websiteUrl: string;
};

export type Keyword = {
  keyword: string;
  intent: "commercial" | "local" | "informational";
  difficulty: "low" | "medium" | "high";
  opportunity: number;
  reason: string;
};

export type Competitor = { domain: string; strength: string; weakness: string };

export type ResearchResult = {
  source: "live" | "deterministic";
  competitors: Competitor[];
  keywords: Keyword[];
  summary: string;
};

export function splitList(s: string): string[] {
  return s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
}

export function deterministicResearch(input: ResearchInput): ResearchResult {
  const services = splitList(input.market.services);
  const locations = [input.business.city, ...splitList(input.market.locations)].filter(Boolean);
  const seedCompetitors = splitList(input.market.competitors);

  const keywords: Keyword[] = [];
  for (const svc of services.slice(0, 6)) {
    for (const loc of locations.slice(0, 5)) {
      keywords.push({
        keyword: `${svc.toLowerCase()} ${loc.toLowerCase()}`,
        intent: "local",
        difficulty: "low",
        opportunity: 60 + ((svc.length + loc.length) % 30),
        reason: "Service and location pairing with direct commercial intent",
      });
    }
    keywords.push({
      keyword: `best ${svc.toLowerCase()} near me`,
      intent: "commercial",
      difficulty: "medium",
      opportunity: 55 + (svc.length % 25),
      reason: "Near me searches convert and feed AI answer recommendations",
    });
    keywords.push({
      keyword: `${svc.toLowerCase()} cost`,
      intent: "informational",
      difficulty: "low",
      opportunity: 50 + (svc.length % 20),
      reason: "Cost questions are what buyers ask AI assistants first",
    });
  }
  keywords.sort((a, b) => b.opportunity - a.opportunity);

  return {
    source: "deterministic",
    competitors: seedCompetitors.map((domain) => ({
      domain: domain.replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
      strength: "Named by you as a competitor to watch",
      weakness: "Will be profiled during the first live research cycle",
    })),
    keywords: keywords.slice(0, 30),
    summary: `Built ${Math.min(keywords.length, 30)} keyword targets from ${services.length} services across ${locations.length} locations. Live competitor discovery starts when the research engine is connected.`,
  };
}

export async function runResearch(input: ResearchInput): Promise<ResearchResult> {
  if (!geminiConfigured()) return deterministicResearch(input);

  const location = [input.business.city, input.business.region].filter(Boolean).join(", ");
  const prompt = `You are the research engine of an autonomous SEO and AEO platform.
Business: ${input.business.name} (${input.websiteUrl})
Industry: ${input.market.industry}
Location: ${location}
Services: ${input.market.services}
Extra target locations: ${input.market.locations || "none listed"}
Known competitors: ${input.market.competitors || "none listed"}

Using live Google Search, do this:
1. Find the 5 to 8 strongest competing websites ranking for "${input.market.industry} ${location}" and closely related commercial searches. Exclude directories, aggregators and national brands with no local presence where possible.
2. For each competitor: domain, one sentence on what makes them rank (strength), one sentence on a gap this business could exploit (weakness).
3. List 20 to 30 keyword targets this business could realistically win in 90 days. Prefer long tail, location and service specific, and question phrased searches that AI assistants answer. For each: keyword, intent (commercial, local or informational), difficulty (low, medium, high), opportunity score 0 to 100, one sentence reason.
4. A two sentence summary of the market situation.

Respond with ONLY a JSON object: {"competitors":[{"domain","strength","weakness"}], "keywords":[{"keyword","intent","difficulty","opportunity","reason"}], "summary"}`;

  const text = await gemini(prompt, { useSearch: true, temperature: 0.3 });
  const parsed = parseJson<Omit<ResearchResult, "source">>(text);

  if (!parsed || !Array.isArray(parsed.keywords) || parsed.keywords.length === 0) {
    return deterministicResearch(input);
  }
  return { ...parsed, source: "live" };
}
