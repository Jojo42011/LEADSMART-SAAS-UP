import { gemini, geminiConfigured, parseJson } from "@/lib/gemini";
import { verifyLive } from "./publish";

/**
 * Editorial-placement outreach, the version that was chosen over the
 * alternatives on purpose (see the scoping decision): the agent finds
 * the real outlets worth pitching — the "best <service> in <city>"
 * roundups that already rank (which our own GEO data says are what AI
 * engines quote when recommending a local business), local press,
 * industry associations — and drafts a personal pitch for each. The
 * OWNER sends it, from their own address, in their own name. Nothing in
 * this module transmits anything to anyone.
 *
 * Two honesty rules, both mechanical:
 *
 * TARGETS MUST EXIST. A model asked for outlets will happily invent
 * plausible ones, and a fabricated target costs the owner a wasted
 * evening and their trust in every real row beside it. Every live-model
 * target URL is fetched before it is kept; the unreachable are dropped,
 * not flagged. When no model is configured, the fallback offers search
 * QUERIES — links to the searches worth running — because a query is
 * honest where an invented outlet name is not.
 *
 * PITCHES CARRY ONLY GIVEN FACTS. The draft may reference the business,
 * its city, its services, and the specific published page being offered
 * — and nothing else. No invented credentials, awards, or statistics:
 * the letter goes out under the owner's name, so a fabricated claim in
 * it would be the product putting words in a real person's mouth.
 */

export type OutreachKind = "roundup" | "press" | "association" | "search";

export type OutreachTarget = {
  name: string;
  url: string;
  kind: OutreachKind;
  /** Why this outlet is worth the owner's evening — must be true of it. */
  why: string;
  pitchSubject: string;
  pitchBody: string;
};

export type OutreachInput = {
  businessName: string;
  industry: string;
  city: string;
  region: string;
  services: string[];
  siteUrl: string;
  ownerName?: string;
  /** The best page the agent has published — the thing being pitched. */
  bestPage: { title: string; liveUrl: string } | null;
};

/** The per-run cap from the scoping guardrails: quality over volume. */
export const MAX_TARGETS_PER_RUN = 10;

function firstService(input: OutreachInput): string {
  return input.services[0] || input.industry || "local services";
}

/**
 * The deterministic pitch, used as the live prompt's floor and the
 * no-model fallback. Every sentence is checkable against the input.
 */
export function draftPitch(
  input: OutreachInput,
  target: { name: string; kind: OutreachKind }
): { subject: string; body: string } {
  const where = input.city ? ` in ${input.city}` : "";
  const service = firstService(input);
  const page = input.bestPage;

  const subject =
    target.kind === "roundup"
      ? `${input.businessName} — for your ${service}${where} roundup`
      : `A local ${service} source${where}: ${input.businessName}`;

  const lines = [
    `Hi,`,
    ``,
    target.kind === "roundup"
      ? `I run ${input.businessName}${where} and came across your roundup. If you update it, I'd be glad to be considered for inclusion.`
      : `I run ${input.businessName}, a ${service} business${where}. If you ever cover local businesses in this space, I'd be happy to be a source.`,
    ``,
    `A little about us: we provide ${input.services.slice(0, 3).join(", ") || service}${where}.`,
  ];
  if (page) {
    lines.push(
      ``,
      `If it's useful, here's a recent page of ours on the topic: ${page.liveUrl} ("${page.title}").`
    );
  }
  lines.push(
    ``,
    `Happy to answer questions or provide anything you need. Either way, thanks for the work you put into this.`,
    ``,
    input.ownerName || input.businessName,
    input.siteUrl
  );
  return { subject, body: lines.join("\n") };
}

/**
 * The no-model fallback: links to the SEARCHES worth running, never
 * invented outlets. Each row is a real query the owner can click, with
 * the drafted pitch ready for whatever they find.
 */
export function fallbackTargets(input: OutreachInput): OutreachTarget[] {
  const service = firstService(input);
  const city = input.city || input.region;
  const q = (query: string) => `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const searches: { name: string; query: string; why: string }[] = [
    {
      name: `"Best ${service}${city ? ` in ${city}` : ""}" roundups`,
      query: `best ${service} ${city}`.trim(),
      why: "The curated roundups ranking for this exact phrase are what AI answer engines quote when recommending a local business — the highest-value placements there are.",
    },
    {
      name: city ? `${city} local press` : "Local press",
      query: `${city} news local business ${input.industry || service}`.trim(),
      why: "A local news mention is a high-authority citation engines trust, and reporters genuinely need local sources.",
    },
    {
      name: `${input.industry || service} associations`,
      query: `${input.industry || service} association member directory ${input.region || ""}`.trim(),
      why: "Industry-association member listings are the unstructured citations local ranking studies keep finding near the top.",
    },
  ];
  return searches.map((s) => {
    const pitch = draftPitch(input, { name: s.name, kind: "search" });
    return {
      name: s.name,
      url: q(s.query),
      kind: "search" as const,
      why: s.why,
      pitchSubject: pitch.subject,
      pitchBody: pitch.body,
    };
  });
}

type ModelTarget = {
  name?: string;
  url?: string;
  kind?: string;
  why?: string;
  pitchSubject?: string;
  pitchBody?: string;
};

/**
 * Finds real outlets via Google-grounded research, drafts a pitch per
 * outlet, and keeps only targets whose URL actually answers. Falls back
 * to search suggestions when no model is configured or the call fails.
 */
export async function runOutreachResearch(
  input: OutreachInput
): Promise<{ targets: OutreachTarget[]; source: "live" | "fallback"; dropped: number }> {
  if (!geminiConfigured()) {
    return { targets: fallbackTargets(input), source: "fallback", dropped: 0 };
  }

  const location = [input.city, input.region].filter(Boolean).join(", ");
  const prompt = `You are the outreach researcher of an SEO platform. Using live Google Search, find up to ${MAX_TARGETS_PER_RUN} REAL editorial placement targets for this business:

Business: ${input.businessName} (${input.siteUrl})
Industry: ${input.industry}
Location: ${location || "not specified"}
Services: ${input.services.join(", ")}

Find, in priority order:
1. "Best ${firstService(input)}${location ? ` in ${input.city}` : ""}"-style curated roundup articles that currently rank — pages that list recommended local businesses.
2. Local press outlets that cover local businesses in this area.
3. Industry associations or chambers of commerce with member directories.

Rules:
- ONLY outlets you actually found via search, with their REAL URLs. Never invent or guess a URL.
- Exclude the business's own site and direct competitors' sites.
- For each target draft a short, personal pitch email FROM the business owner asking to be considered/included. The pitch may use ONLY the facts above plus this page the business can show: ${input.bestPage ? `${input.bestPage.liveUrl} ("${input.bestPage.title}")` : "none published yet"}. No invented credentials, awards, statistics or claims. Plain, human, three short paragraphs maximum.

Respond with ONLY a JSON object:
{"targets":[{"name","url","kind":"roundup|press|association","why","pitchSubject","pitchBody"}]}`;

  const text = await gemini(prompt, { useSearch: true, temperature: 0.3 });
  const parsed = parseJson<{ targets?: ModelTarget[] }>(text);
  if (!parsed || !Array.isArray(parsed.targets) || parsed.targets.length === 0) {
    return { targets: fallbackTargets(input), source: "fallback", dropped: 0 };
  }

  const candidates = parsed.targets
    .filter(
      (t): t is Required<ModelTarget> =>
        typeof t.name === "string" &&
        typeof t.url === "string" &&
        /^https?:\/\//i.test(t.url) &&
        typeof t.why === "string"
    )
    .slice(0, MAX_TARGETS_PER_RUN);

  // The existence gate. Sequentially with a small cap — this is a
  // background research action, not a latency-critical path, and a
  // burst of parallel fetches from our IP against ten strange hosts is
  // the shape of traffic that gets an IP reputation-flagged.
  const kept: OutreachTarget[] = [];
  let dropped = 0;
  for (const t of candidates) {
    const status = await verifyLive(t.url);
    if (!status.startsWith("live:")) {
      dropped++;
      continue;
    }
    const fallback = draftPitch(input, {
      name: t.name,
      kind: (["roundup", "press", "association"].includes(t.kind) ? t.kind : "press") as OutreachKind,
    });
    kept.push({
      name: t.name.slice(0, 160),
      url: t.url,
      kind: (["roundup", "press", "association"].includes(t.kind) ? t.kind : "press") as OutreachKind,
      why: t.why.slice(0, 400),
      pitchSubject: (t.pitchSubject || fallback.subject).slice(0, 160),
      pitchBody: (t.pitchBody || fallback.body).slice(0, 4000),
    });
  }

  if (kept.length === 0) {
    // Every model target failed the existence check — fall back rather
    // than reporting an empty success that reads as "no opportunities".
    return { targets: fallbackTargets(input), source: "fallback", dropped };
  }
  return { targets: kept, source: "live", dropped };
}
