import { checkSimilarity, type SimilarityVerdict } from "./similarity";

/**
 * The deep audit engine: a deterministic, dependency free quality gate.
 * Ten dimensions matching the published scoring model, with the three
 * fixes the research demanded over first generation tooling:
 *  - originality is scored against sibling pages (doorway detection),
 *    not in isolation;
 *  - local signals require the city in ranking positions (title, h1,
 *    schema), not merely anywhere in the body;
 *  - trust is weighted toward Trust and first hand Experience over
 *    Expertise, per current E-E-A-T guidance.
 * Pass threshold 75. Pages below it are held, never published.
 */

export type Dimension = {
  key: string;
  name: string;
  score: number;
  max: number;
  issues: string[];
};

export type AuditReport = {
  score: number; // 0 to 100 normalized
  grade: "A" | "B" | "C" | "D" | "F";
  pass: boolean;
  veto: string | null; // hard block reason, independent of score
  wordCount: number;
  similarity: SimilarityVerdict;
  dimensions: Dimension[];
};

export type AuditInput = {
  html: string;
  keyword: string;
  city: string;
  region: string;
  phone: string;
  businessName: string;
  /** Sibling pages on the same site, for duplicate detection. */
  siblings?: { slug: string; html: string }[];
  /** Terms masked before similarity comparison (cities, service names). */
  maskTerms?: string[];
};

const lower = (s: string) => s.toLowerCase();

function extract(re: RegExp, html: string): string {
  const m = html.match(re);
  return m ? m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
}

export function auditPage(input: AuditInput): AuditReport {
  const html = input.html;
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
  const words = body.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const kw = lower(input.keyword);
  const kwHead = kw.split(" ").slice(0, 3).join(" ");
  const city = input.city.trim();

  const title = extract(/<title[^>]*>([^<]*)<\/title>/i, html);
  const metaDesc =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || "";
  const h1 = extract(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html);
  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim()
  );
  const h3Count = (html.match(/<h3[\s>]/gi) || []).length;
  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  const schemaTypes = new Set<string>();
  for (const b of ldBlocks) {
    for (const m of b[1].matchAll(/"@type"\s*:\s*"([^"]+)"/g)) schemaTypes.add(m[1]);
  }
  const internalLinks = [...html.matchAll(/<a[^>]+href=["'](\/[^"']*|\.\.?\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const imgs = [...html.matchAll(/<img[^>]*>/gi)].map((m) => m[0]);
  const answers = (html.match(/class="answer"/g) || []).length;
  const questionH2s = h2s.filter((h) => h.includes("?")).length;
  const stats = (body.match(/\b\d+(\.\d+)?\s?(%|percent|years|days|hours|weeks|customers|projects|of 100)\b/gi) || []).length;

  const dims: Dimension[] = [];
  const dim = (key: string, name: string, max: number, score: number, issues: string[]) =>
    dims.push({ key, name, max, score: Math.max(0, Math.min(max, Math.round(score))), issues });

  // Meta tags (18)
  {
    const issues: string[] = [];
    let s = 0;
    if (title) s += 4; else issues.push("Missing <title>");
    if (title.length >= 30 && title.length <= 62) s += 3; else issues.push("Title length outside 30 to 62 chars");
    if (lower(title).includes(kwHead)) s += 4; else issues.push("Keyword missing from title");
    if (metaDesc) s += 3; else issues.push("Missing meta description");
    if (metaDesc.length >= 70 && metaDesc.length <= 160) s += 2; else issues.push("Description length outside 70 to 160 chars");
    if (/canonical/.test(html)) s += 2; else issues.push("Missing canonical link");
    dim("meta", "Meta tags", 18, s, issues);
  }

  // Content depth (16)
  {
    const issues: string[] = [];
    let s = 0;
    if (wordCount >= 400) s += 5; else issues.push("Under 400 words");
    if (wordCount >= 700) s += 4;
    if (wordCount >= 1000) s += 2;
    const kwMentions = (lower(body).match(new RegExp(kwHead.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    if (kwMentions >= 2) s += 3; else issues.push("Keyword appears fewer than twice in body");
    if (kwMentions <= Math.max(8, wordCount / 90)) s += 2; else issues.push("Keyword density too high");
    dim("depth", "Content depth", 16, s, issues);
  }

  // Originality / information gain (8) — sibling similarity plus concrete specifics
  const similarity = checkSimilarity(html, input.siblings ?? [], input.maskTerms ?? [city, input.region]);
  {
    const issues: string[] = [];
    let s = 8;
    if (similarity.doorwayRisk === "elevated") {
      s = 3;
      issues.push(`Content ${Math.round(similarity.maxSimilarity * 100)}% similar to /${similarity.nearestSlug}`);
    }
    if (similarity.doorwayRisk === "veto") {
      s = 0;
      issues.push(`Near duplicate of /${similarity.nearestSlug}: doorway page risk`);
    }
    if (stats < 2) {
      s = Math.max(0, s - 2);
      issues.push("Fewer than two concrete statistics or numeric specifics");
    }
    dim("originality", "Originality (info gain)", 8, s, issues);
  }

  // Structured data (16)
  {
    const issues: string[] = [];
    let s = 0;
    if (ldBlocks.length > 0) s += 5; else issues.push("No JSON-LD structured data");
    if (schemaTypes.has("LocalBusiness") || schemaTypes.has("Service")) s += 4; else issues.push("No LocalBusiness or Service schema");
    if (schemaTypes.has("FAQPage")) s += 4; else issues.push("No FAQPage schema");
    if (schemaTypes.has("BreadcrumbList")) s += 3; else issues.push("No BreadcrumbList schema");
    dim("schema", "Structured data", 16, s, issues);
  }

  // Internal links (14)
  {
    const issues: string[] = [];
    let s = 0;
    if (internalLinks.length >= 1) s += 5; else issues.push("Orphan page: no internal links out");
    if (internalLinks.length >= 3) s += 4;
    if (internalLinks.length >= 5) s += 2;
    const descriptive = internalLinks.filter((l) => l[2].replace(/<[^>]+>/g, "").trim().length > 8).length;
    if (internalLinks.length > 0 && descriptive >= internalLinks.length / 2) s += 3;
    else if (internalLinks.length > 0) issues.push("Anchor text not descriptive");
    dim("links", "Internal links", 14, s, issues);
  }

  // Headings (12)
  {
    const issues: string[] = [];
    let s = 0;
    if (h1Count === 1) s += 4; else issues.push(h1Count === 0 ? "No <h1>" : "Multiple <h1> elements");
    if (lower(h1).includes(kwHead.split(" ")[0])) s += 3; else issues.push("Keyword absent from h1");
    if (h2s.length >= 3) s += 3; else issues.push("Fewer than three h2 sections");
    if (h3Count >= 1 || h2s.length >= 5) s += 2;
    dim("headings", "Headings", 12, s, issues);
  }

  // Local signals (10) — city must appear in ranking positions, not merely anywhere
  {
    const issues: string[] = [];
    let s = 0;
    const cl = lower(city);
    if (city && lower(title).includes(cl)) s += 3; else issues.push("City missing from title");
    if (city && lower(h1 + " " + h2s.join(" ")).includes(cl)) s += 2; else issues.push("City missing from headings");
    if (city && ldBlocks.some((b) => lower(b[1]).includes(cl))) s += 2; else issues.push("City missing from schema address");
    if (/href=["']tel:/.test(html)) s += 2; else issues.push("No clickable phone number");
    if (input.region && lower(body).includes(lower(input.region))) s += 1; else issues.push("Region not mentioned");
    dim("local", "Local signals", 10, s, issues);
  }

  // Trust signals (10) — E-E-A-T reweighted: trust 4, experience 3, authority 1.5, expertise 1.5
  {
    const issues: string[] = [];
    let s = 0;
    if (/guarantee|warranty|licensed|insured|written (quote|estimate|pricing)|transparent pricing/i.test(body)) s += 4;
    else issues.push("No trust markers (guarantee, licensing, written pricing)");
    if (/we (built|installed|completed|remodeled|served)|our (team|crew|projects)|years (of|in)/i.test(body)) s += 3;
    else issues.push("No first hand experience signals");
    if (input.businessName && body.includes(input.businessName)) s += 1.5; else issues.push("Business name absent from body");
    if (/certified|award|association|accredited|member/i.test(body)) s += 1.5;
    dim("trust", "Trust signals", 10, s, issues);
  }

  // Images and alt text (8) — pages may legitimately ship text first
  {
    const issues: string[] = [];
    let s = 0;
    if (imgs.length === 0) {
      s = 4; // neutral: no broken slots, no missing alts
      issues.push("No images on page");
    } else {
      s += 4;
      const withAlt = imgs.filter((i) => /alt=["'][^"']+["']/.test(i)).length;
      if (withAlt === imgs.length) s += 4; else issues.push(`${imgs.length - withAlt} images missing alt text`);
    }
    dim("images", "Images and alt text", 8, s, issues);
  }

  // AI search readiness (6) — GEO/AEO: liftable, quotable, question shaped
  {
    const issues: string[] = [];
    let s = 0;
    if (questionH2s >= 2) s += 2; else issues.push("Fewer than two question style headings");
    if (answers >= 2) s += 2; else issues.push("Fewer than two answer first passages");
    if (schemaTypes.has("FAQPage")) s += 1;
    if (stats >= 2) s += 1;
    dim("ai", "AI search readiness", 6, s, issues);
  }

  const totalMax = dims.reduce((a, d) => a + d.max, 0);
  const total = dims.reduce((a, d) => a + d.score, 0);
  const score = Math.round((total / totalMax) * 100);
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";

  let veto: string | null = null;
  if (wordCount < 150) veto = "Thin content: under 150 words";
  else if (h1Count === 0) veto = "No h1 heading";
  else if (similarity.doorwayRisk === "veto")
    veto = `Near duplicate of existing page /${similarity.nearestSlug}`;

  return {
    score,
    grade,
    pass: score >= 75 && !veto,
    veto,
    wordCount,
    similarity,
    dimensions: dims,
  };
}
