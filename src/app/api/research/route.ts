import { NextRequest, NextResponse } from "next/server";
import { gemini, geminiConfigured, parseJson } from "@/lib/gemini";

/**
 * The first phase of the agent's cycle: live market research.
 * With GEMINI_API_KEY set, runs Google Search grounded queries to find
 * real competitors and the keywords carrying their traffic. Without it,
 * returns a deterministic expansion of services and locations so the
 * product remains fully usable end to end.
 */

type ResearchRequest = {
  business: { name: string; city: string; region: string };
  market: { industry: string; services: string; locations: string; competitors: string };
  websiteUrl: string;
};

type Keyword = {
  keyword: string;
  intent: "commercial" | "local" | "informational";
  difficulty: "low" | "medium" | "high";
  opportunity: number;
  reason: string;
};

type Competitor = {
  domain: string;
  strength: string;
  weakness: string;
};

type ResearchResult = {
  source: "live" | "deterministic";
  competitors: Competitor[];
  keywords: Keyword[];
  summary: string;
};

function splitList(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function deterministicResearch(input: ResearchRequest): ResearchResult {
  const services = splitList(input.market.services);
  const locations = [
    input.business.city,
    ...splitList(input.market.locations),
  ].filter(Boolean);
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

export async function POST(req: NextRequest) {
  let input: ResearchRequest;
  try {
    input = (await req.json()) as ResearchRequest;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (!geminiConfigured()) {
    return NextResponse.json(deterministicResearch(input));
  }

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
    return NextResponse.json(deterministicResearch(input));
  }

  return NextResponse.json({ ...parsed, source: "live" } satisfies ResearchResult);
}
