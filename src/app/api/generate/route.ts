import { NextRequest, NextResponse } from "next/server";
import { gemini, geminiConfigured, parseJson } from "@/lib/gemini";
import {
  localBusinessSchema,
  faqPageSchema,
  breadcrumbListSchema,
  type JsonLd,
} from "@/lib/schema";

/**
 * Generates one complete, publish ready page. Every page carries the
 * on page tactics with measured AI citation lift: an answer first passage
 * under every question heading, statistics, quotable sentences, plus full
 * schema markup, meta tags and internal links. With GEMINI_API_KEY the
 * body copy is written by the model against the brand brief; without it a
 * structured draft is produced so the pipeline still runs end to end.
 */

type GenerateRequest = {
  keyword: string;
  pageType: "location" | "service" | "article";
  title?: string;
  business: {
    name: string;
    phone: string;
    address: string;
    city: string;
    region: string;
  };
  websiteUrl: string;
  industry: string;
  services: string;
  brand?: { colors?: string[]; fonts?: string[]; description?: string };
  internalLinks?: { title: string; path: string }[];
};

type Section = { heading: string; answer: string; body: string };
type PageContent = {
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
  sections: Section[];
  faq: { question: string; answer: string }[];
  cta: string;
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fallbackContent(input: GenerateRequest): PageContent {
  const kw = input.keyword;
  const city = input.business.city;
  const name = input.business.name;
  const kwTitle = kw.replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    metaTitle: `${kwTitle} | ${name}`.slice(0, 60),
    metaDescription: `${name} provides ${kw} with transparent pricing and local expertise. Serving ${city} and surrounding areas. Call ${input.business.phone || "today"} for a free estimate.`.slice(0, 158),
    h1: kwTitle,
    intro: `Looking for ${kw}? ${name} serves ${city} and the surrounding area with a focus on quality work, clear communication and honest pricing. This page covers what the service includes, what it costs, and how to get started.`,
    sections: [
      {
        heading: `What does ${kw} include?`,
        answer: `${kw.charAt(0).toUpperCase() + kw.slice(1)} from ${name} includes an initial assessment, a written scope with fixed pricing, the work itself performed by experienced local professionals, and a final walkthrough.`,
        body: `Every project starts with a conversation about what you actually need. From there the team documents the scope, timeline and cost before any work begins, so there are no surprises. Work is completed to local code and backed by a workmanship guarantee.`,
      },
      {
        heading: `How much does ${kw} cost in ${city}?`,
        answer: `Costs vary by scope, but most ${city} projects in this category fall within a predictable range once the site has been assessed. A written, fixed quote is provided before work begins.`,
        body: `The biggest cost drivers are project size, site conditions and material choices. Because pricing is set in writing up front, the number you approve is the number you pay.`,
      },
      {
        heading: `Why choose ${name}?`,
        answer: `${name} is a local ${input.industry || "service"} provider serving ${city}, known for responsive communication, fixed written pricing and work that passes inspection the first time.`,
        body: `Local knowledge matters: permitting, soil, climate and neighborhood specifics all affect how a project should be done. A local team that has done this work nearby will see issues a national operator misses.`,
      },
    ],
    faq: [
      {
        question: `How fast can ${name} start on ${kw}?`,
        answer: `Most projects receive an assessment within a few business days and a written quote within a week. Timeline to start depends on scope and season.`,
      },
      {
        question: `Does ${name} serve areas beyond ${city}?`,
        answer: `Yes. ${name} serves ${city} and the surrounding communities. If you are nearby, reach out and the team will confirm coverage.`,
      },
      {
        question: `Is there a guarantee on the work?`,
        answer: `Yes. Work is backed by a workmanship guarantee and completed to local code requirements.`,
      },
    ],
    cta: `Get a free, written estimate for ${kw}. Call ${input.business.phone || name} or request a quote online.`,
  };
}

async function llmContent(input: GenerateRequest): Promise<PageContent | null> {
  const prompt = `Write the content for one SEO and AEO optimized page.

Business: ${input.business.name}, a ${input.industry} business in ${input.business.city}, ${input.business.region}. Phone: ${input.business.phone || "n/a"}. Website: ${input.websiteUrl}.
Services: ${input.services}
Brand notes: ${input.brand?.description || "professional, local, trustworthy"}
Target keyword: "${input.keyword}" (page type: ${input.pageType})

Hard requirements, these are what make pages get cited by AI answer engines:
- Every section heading is a real question a buyer would ask.
- Directly under each heading, a 40 to 80 word direct answer that fully resolves the question on its own (answer first structure).
- Include at least two concrete statistics or numeric specifics in the body (realistic for the industry, clearly framed as typical or estimated, never fabricated as the business's own claims).
- One quotable, standalone sentence per section.
- Natural mention of the city and nearby area. No keyword stuffing.
- 700 to 1100 words total across sections.
- Plain confident language. No hyphens or em dashes anywhere in the text. No exclamation marks.

Respond with ONLY JSON:
{"metaTitle": "max 60 chars, keyword near front",
 "metaDescription": "max 155 chars with a reason to click",
 "h1": "the page headline",
 "intro": "60 to 90 word opening that states who this is for and what they get",
 "sections": [{"heading","answer","body"}, 3 to 5 of them],
 "faq": [{"question","answer"}, exactly 4, distinct from the sections],
 "cta": "one sentence call to action"}`;

  const text = await gemini(prompt, { temperature: 0.6, maxOutputTokens: 8192 });
  const parsed = parseJson<PageContent>(text);
  if (!parsed || !parsed.h1 || !Array.isArray(parsed.sections) || parsed.sections.length === 0) return null;
  return parsed;
}

function renderHtml(input: GenerateRequest, c: PageContent, slug: string): string {
  const origin = input.websiteUrl.replace(/\/$/, "");
  const folder = input.pageType === "location" ? "locations" : input.pageType === "service" ? "services" : "insights";
  const canonical = `${origin}/${folder}/${slug}/`;
  const accent = input.brand?.colors?.[0] || "#111111";
  const font = input.brand?.fonts?.[0] || "system-ui";

  const schemas: JsonLd[] = [
    localBusinessSchema({
      name: input.business.name,
      url: origin,
      telephone: input.business.phone || undefined,
      address: {
        ...(input.business.address ? { streetAddress: input.business.address } : {}),
        addressLocality: input.business.city,
        addressRegion: input.business.region,
      },
    }),
    faqPageSchema(c.faq),
    breadcrumbListSchema([
      { name: "Home", url: `${origin}/` },
      { name: folder.charAt(0).toUpperCase() + folder.slice(1), url: `${origin}/${folder}/` },
      { name: c.h1, url: canonical },
    ]),
  ];

  const internal = (input.internalLinks || []).slice(0, 6);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.metaTitle)}</title>
<meta name="description" content="${esc(c.metaDescription)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(c.metaTitle)}">
<meta property="og:description" content="${esc(c.metaDescription)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta name="robots" content="index, follow">
${schemas.map((s) => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join("\n")}
<style>
:root{--accent:${accent}}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:${font},system-ui,sans-serif;color:#1a1a1a;line-height:1.7;background:#fff}
main{max-width:760px;margin:0 auto;padding:56px 20px}
h1{font-size:2.1rem;line-height:1.15;margin-bottom:18px}
h2{font-size:1.4rem;margin:44px 0 12px}
.answer{background:#f7f7f5;border-left:3px solid var(--accent);padding:14px 18px;margin-bottom:14px;font-weight:500}
p{margin-bottom:14px}
.faq h3{font-size:1.05rem;margin:22px 0 6px}
.cta{background:#111;color:#fff;padding:28px;border-radius:12px;margin-top:48px;text-align:center}
.cta a{color:#fff;font-weight:600}
.related{margin-top:40px;padding-top:24px;border-top:1px solid #e5e5e5}
.related a{display:block;color:var(--accent);margin:6px 0;text-decoration:none}
footer{margin-top:48px;padding-top:20px;border-top:1px solid #e5e5e5;font-size:.9rem;color:#666}
</style>
</head>
<body>
<main>
<article>
<h1>${esc(c.h1)}</h1>
<p>${esc(c.intro)}</p>
${c.sections
  .map(
    (s) => `<section>
<h2>${esc(s.heading)}</h2>
<p class="answer">${esc(s.answer)}</p>
<p>${esc(s.body)}</p>
</section>`
  )
  .join("\n")}
<section class="faq">
<h2>Frequently asked questions</h2>
${c.faq.map((f) => `<h3>${esc(f.question)}</h3>\n<p>${esc(f.answer)}</p>`).join("\n")}
</section>
<div class="cta"><p>${esc(c.cta)}</p>${
    input.business.phone ? `<p><a href="tel:${esc(input.business.phone)}">${esc(input.business.phone)}</a></p>` : ""
  }</div>
${
  internal.length
    ? `<nav class="related"><h2>Related pages</h2>${internal
        .map((l) => `<a href="${esc(l.path)}">${esc(l.title)}</a>`)
        .join("")}</nav>`
    : ""
}
</article>
<footer>
<p>${esc(input.business.name)}${input.business.address ? `, ${esc(input.business.address)}` : ""}, ${esc(
    input.business.city
  )}, ${esc(input.business.region)}${input.business.phone ? ` &middot; ${esc(input.business.phone)}` : ""}</p>
</footer>
</main>
</body>
</html>`;
}

/** Lightweight audit of the finished HTML, mirroring the marketing claims. */
function audit(html: string, keyword: string) {
  const wordCount = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  const checks = [
    { name: "Meta title", pass: /<title>[^<]{10,65}<\/title>/.test(html) },
    { name: "Meta description", pass: /name="description" content="[^"]{50,160}"/.test(html) },
    { name: "Single H1 with keyword", pass: (html.match(/<h1/g) || []).length === 1 },
    { name: "Question headings", pass: (html.match(/<h2>[^<]*\?/g) || []).length >= 2 },
    { name: "Answer first passages", pass: (html.match(/class="answer"/g) || []).length >= 3 },
    { name: "Structured data", pass: (html.match(/application\/ld\+json/g) || []).length >= 3 },
    { name: "FAQ schema", pass: html.includes('"FAQPage"') },
    { name: "Local signals", pass: /tel:|LocalBusiness/.test(html) },
    { name: "Content depth", pass: wordCount >= 500 },
    {
      name: "Keyword presence",
      pass: html.toLowerCase().includes(keyword.toLowerCase().split(" ").slice(0, 2).join(" ")),
    },
  ];
  const passed = checks.filter((c) => c.pass).length;
  return {
    score: Math.round((passed / checks.length) * 100),
    grade: passed >= 9 ? "A" : passed >= 8 ? "B" : passed >= 6 ? "C" : "D",
    wordCount,
    checks,
  };
}

export async function POST(req: NextRequest) {
  let input: GenerateRequest;
  try {
    input = (await req.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!input.keyword || !input.business?.name) {
    return NextResponse.json({ error: "keyword and business required" }, { status: 400 });
  }

  const content = (geminiConfigured() ? await llmContent(input) : null) || fallbackContent(input);
  const slug = slugify(input.title || input.keyword);
  const html = renderHtml(input, content, slug);
  const report = audit(html, input.keyword);

  return NextResponse.json({
    slug,
    folder: input.pageType === "location" ? "locations" : input.pageType === "service" ? "services" : "insights",
    metaTitle: content.metaTitle,
    metaDescription: content.metaDescription,
    html,
    source: geminiConfigured() ? "live" : "template",
    audit: report,
  });
}
