import { geminiCall, geminiConfigured, parseJson } from "@/lib/gemini";
import { pickAccent } from "@/lib/site-ingest";
import { heroImageFor, type PageImage } from "./images";
import { auditPage, type AuditReport } from "./audit";
import {
  localBusinessSchema,
  faqPageSchema,
  breadcrumbListSchema,
  type JsonLd,
} from "@/lib/schema";

/**
 * Phase 4 of the cycle: builds one complete, publish ready page and runs
 * it through the deep audit gate, including sibling comparison for
 * doorway detection. Carries the on page tactics with measured AI
 * citation lift: answer first passages, statistics, quotable sentences,
 * full schema, freshness stamps.
 */

export type GenerateInput = {
  keyword: string;
  pageType: "location" | "service" | "article";
  title?: string;
  business: { name: string; phone: string; address: string; city: string; region: string };
  websiteUrl: string;
  industry: string;
  services: string;
  brand?: {
    colors?: string[];
    fonts?: string[];
    description?: string;
    /** The customer's real site navigation, reproduced on generated pages. */
    nav?: { label: string; href: string }[];
    footerLinks?: { label: string; href: string }[];
    /** The customer's own logo, shown top left exactly as their site does. */
    logo?: string;
  };
  /** Hero artwork for this page: path relative to the site root, plus alt. */
  heroImage?: { path: string; alt: string };
  internalLinks?: { title: string; path: string }[];
  /** Existing site pages for duplicate detection. */
  siblings?: { slug: string; html: string }[];
};

export type GenerateOutput = {
  slug: string;
  folder: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  html: string;
  /** Artwork committed alongside the page; always present. */
  image: PageImage;
  wordCount: number;
  source: "live" | "template";
  /**
   * Set when generation fell back to the template. Without it a failed
   * model call was indistinguishable from a successful one: the page just
   * came out thin, scored below the publish gate and was held, with
   * nothing anywhere explaining why.
   */
  sourceReason?: string;
  audit: AuditReport;
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

/**
 * Serialises a schema object for embedding in a <script> tag.
 *
 * JSON.stringify does not escape "<", so any string in the schema
 * containing "</script>" closes the tag early and everything after it
 * becomes live markup on the customer's published page. A business name
 * is enough to trigger it, and the values here are not all typed by the
 * owner: FAQ answers and descriptions are written by the model from
 * ingested competitor pages, so this is a path from a third party's HTML
 * to a customer's live site.
 *
 * HTML-escaping is not the fix — it would corrupt the JSON. Escaping the
 * three characters as \u sequences leaves the JSON byte-identical once
 * parsed, so the schema search engines read is unchanged.
 */
function jsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    // U+2028/U+2029 are literal line terminators in JavaScript source but
    // legal inside a JSON string, which breaks any parser reading the tag
    // as script rather than as JSON.
    // Written as \u escapes rather than literal characters: pasted
    // literally they are invisible in an editor and indistinguishable
    // from a space — and a plain space here replaces every space in the
    // document, which is exactly what happened on the first attempt.
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Escapes prose while keeping the model's internal links as real links.
 *
 * The generation prompt asks for internal links, and the model supplies
 * them as anchor tags inside the prose. Escaping the whole string
 * published that markup as visible text — customers saw
 * `<a href="...">our services</a>` printed mid-sentence on live pages.
 * Stripping the tags instead would throw away internal links, which are
 * one of the ranking signals the page is built to earn.
 *
 * So: escape everything, then restore anchors, and only anchors whose
 * href is same-origin or a bare path. An off-site or javascript: URL from
 * model output has no business being published to a customer's domain.
 */
function escProse(s: string, origin: string): string {
  const escaped = esc(s);
  return escaped.replace(
    /&lt;a href=&quot;([^&"]+)&quot;&gt;([\s\S]*?)&lt;\/a&gt;/gi,
    (whole, href: string, label: string) => {
      const safe = href.startsWith("/") || href.startsWith(origin);
      if (!safe) return label; // keep the words, drop the link
      return `<a href="${href}">${label}</a>`;
    }
  );
}

function fallbackContent(input: GenerateInput): PageContent {
  const kw = input.keyword;
  const city = input.business.city;
  const name = input.business.name;
  const kwTitle = titleCase(kw);
  return {
    metaTitle: `${kwTitle} | ${name}`.slice(0, 60),
    metaDescription: `${name} provides ${kw} with transparent pricing and local expertise. Serving ${city} and surrounding areas. Call ${input.business.phone || "today"} for a free estimate.`.slice(0, 158),
    h1: kwTitle,
    intro: `Looking for ${kw}? ${name} serves ${city} and the surrounding area with a focus on quality work, clear communication and honest pricing. This page covers what the service includes, what it costs, and how to get started.`,
    sections: [
      {
        heading: `What does ${kw} include?`,
        answer: `${kw.charAt(0).toUpperCase() + kw.slice(1)} from ${name} includes an initial assessment, a written scope with fixed pricing, the work itself performed by experienced local professionals, and a final walkthrough.`,
        body: `Every project starts with a conversation about what you actually need. From there the team documents the scope, timeline and cost before any work begins, so there are no surprises. Work is completed to local code and backed by a workmanship guarantee. Typical projects are scoped within 3 business days and 9 of 10 quotes are delivered inside a week.`,
      },
      {
        heading: `How much does ${kw} cost in ${city}?`,
        answer: `Costs vary by scope, but most ${city} projects in this category fall within a predictable range once the site has been assessed. A written, fixed quote is provided before work begins.`,
        body: `The biggest cost drivers are project size, site conditions and material choices. Because pricing is set in writing up front, the number you approve is the number you pay. Around 80 percent of cost questions are answered in the first assessment visit.`,
      },
      {
        heading: `Why choose ${name}?`,
        answer: `${name} is a local ${input.industry || "service"} provider serving ${city}, known for responsive communication, fixed written pricing and work that passes inspection the first time.`,
        body: `Local knowledge matters: permitting, soil, climate and neighborhood specifics all affect how a project should be done. A local team that has done this work nearby will see issues a national operator misses. Our team has served the ${city} area for years and stands behind every project with a workmanship guarantee.`,
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

async function llmContent(
  input: GenerateInput
): Promise<{ content: PageContent | null; error: string | null }> {
  const existing = (input.siblings || []).map((s) => s.slug).slice(0, 20).join(", ") || "none yet";
  const prompt = `Write the content for one SEO and AEO optimized page.

Business: ${input.business.name}, a ${input.industry} business in ${input.business.city}, ${input.business.region}. Phone: ${input.business.phone || "n/a"}. Website: ${input.websiteUrl}.
Services: ${input.services}
Brand notes: ${input.brand?.description || "professional, local, trustworthy"}
Target keyword: "${input.keyword}" (page type: ${input.pageType})
Pages that already exist on this site: ${existing}. This page must say things those pages do not: different specifics, different angles, different examples. Never reuse their phrasing.

Hard requirements, these are what make pages get cited by AI answer engines:
- Every section heading is a real question a buyer would ask.
- Directly under each heading, a 40 to 80 word direct answer that fully resolves the question on its own (answer first structure).
- Include at least three concrete statistics or numeric specifics in the body (realistic for the industry, clearly framed as typical or estimated, never fabricated as the business's own claims).
- One quotable, standalone sentence per section.
- Natural mention of the city and nearby area, including the city in at least one heading. No keyword stuffing.
- 700 to 1100 words total across sections.
- Plain confident language. No hyphens or em dashes anywhere in the text. No exclamation marks.

Respond with ONLY JSON:
{"metaTitle": "max 60 chars, keyword near front, include the city",
 "metaDescription": "max 155 chars with a reason to click",
 "h1": "the page headline containing the keyword",
 "intro": "60 to 90 word opening that states who this is for and what they get",
 "sections": [{"heading","answer","body"}, 3 to 5 of them],
 "faq": [{"question","answer"}, exactly 4, distinct from the sections],
 "cta": "one sentence call to action"}`;

  // 8192 was the whole budget for a full article *and* the model's internal
  // reasoning, which the 2.5-generation models draw from the same pool —
  // leaving pages at real risk of stopping mid-JSON. Doubling it costs
  // nothing when unused (billing is on tokens produced, not reserved).
  const { text, error } = await geminiCall(prompt, { temperature: 0.6, maxOutputTokens: 16384 });
  if (error) return { content: null, error };
  const parsed = parseJson<PageContent>(text);
  if (!parsed || !parsed.h1 || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    return { content: null, error: "Gemini replied but the content could not be parsed into a page" };
  }
  return { content: parsed, error: null };
}

/**
 * Targeted revision: the audit's concrete findings go back to the model so
 * it fixes what actually scored low, instead of rerolling and hoping. This
 * is the mechanism that moves a page from "clears the 75 gate" toward an
 * A: rerolls sample the same distribution, revision climbs it.
 */
async function llmRevise(
  input: GenerateInput,
  draft: PageContent,
  issues: string[]
): Promise<{ content: PageContent | null; error: string | null }> {
  const prompt = `You wrote this page content JSON for the keyword "${input.keyword}" (${input.business.name}, ${input.business.city}, ${input.business.region}):

${JSON.stringify(draft)}

An SEO audit scored it below the A grade. Its specific findings:
${issues.map((i) => `- ${i}`).join("\n")}

Rewrite the content to fix every finding while keeping everything that already works: answer-first structure, question headings, concrete realistic statistics (framed as typical or estimated, never fabricated claims about the business), one quotable sentence per section, the city mentioned naturally including in one heading, 700 to 1100 words, no hyphens or em dashes, no exclamation marks.

Respond with ONLY the complete corrected JSON in exactly the same shape.`;
  const { text, error } = await geminiCall(prompt, { temperature: 0.4, maxOutputTokens: 16384 });
  if (error) return { content: null, error };
  const parsed = parseJson<PageContent>(text);
  if (!parsed || !parsed.h1 || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    return { content: null, error: "revision could not be parsed" };
  }
  return { content: parsed, error: null };
}

function renderHtml(input: GenerateInput, c: PageContent, slug: string, folder: string): string {
  const origin = input.websiteUrl.replace(/\/$/, "");
  const canonical = `${origin}/${folder}/${slug}/`;
  // pickAccent, not colors[0]: a stored snapshot can lead with a neutral
  // (the extractor once crowned the site's text ink as the brand), and a
  // near-black accent renders the whole page black-and-white.
  const accent = pickAccent(input.brand?.colors);
  const font = input.brand?.fonts?.[0] || "system-ui";
  const today = new Date().toISOString().slice(0, 10);

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
  const folderLabel = folder.charAt(0).toUpperCase() + folder.slice(1);
  const phone = input.business.phone;
  const nav = (input.brand?.nav || []).slice(0, 8);
  const footerLinks = (input.brand?.footerLinks || []).slice(0, 12);
  const logo = input.brand?.logo || "";
  // A very light wash of the accent for alternating bands and callouts,
  // so tinted areas belong to the brand instead of being generic grey.
  const tint = tintOf(accent);
  const hero = input.heroImage;
  // Section imagery: the hero repeats at a lower position on long pages so
  // the body is not an unbroken wall of text, which is the single biggest
  // reason a generated page reads as a blog post rather than a site page.
  const midSection = Math.min(1, Math.max(0, c.sections.length - 2));

  // A published page must read as a page OF the customer's website, not a
  // blog post beside it. The shell reproduces the site's own primary
  // navigation (labels and hrefs captured at ingest) in the header and a
  // navigating footer — which is also plain SEO: every generated page
  // passes internal links to the site's money pages and inherits crawl
  // paths from them. Still fully self-contained: inline CSS, no external
  // requests, brand color and font from the site's own stylesheet.
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
<meta property="article:modified_time" content="${today}">
${schemas.map((s) => `<script type="application/ld+json">${jsonLd(s)}</script>`).join("\n")}
<style>
:root{--accent:${accent};--ink:#16181d;--muted:#5c6270;--line:#e7e8ec;--soft:#f6f7f9;--tint:${tint}}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:${font},system-ui,-apple-system,sans-serif;color:var(--ink);line-height:1.75;background:#fff;font-size:16.5px}
a{color:var(--accent)}
.bar{border-bottom:1px solid var(--line);background:rgba(255,255,255,.92);backdrop-filter:saturate(180%) blur(12px);position:sticky;top:0;z-index:20}
.bar-in{max-width:1180px;margin:0 auto;padding:13px 26px;display:flex;align-items:center;gap:24px}
.brand{font-weight:700;font-size:1.05rem;color:var(--ink);text-decoration:none;letter-spacing:-.01em;white-space:nowrap;display:flex;align-items:center;gap:10px}
.brand img{height:34px;width:auto;max-width:190px;object-fit:contain;display:block}
.topnav{display:flex;flex-wrap:wrap;gap:2px 4px;margin:0 auto}
.topnav a{color:var(--ink);text-decoration:none;font-size:.92rem;font-weight:500;padding:7px 12px;border-radius:8px}
.topnav a:hover{background:var(--soft);color:var(--accent)}
.bar .call{background:var(--accent);color:#fff;text-decoration:none;font-weight:600;font-size:.9rem;padding:9px 18px;border-radius:999px;white-space:nowrap;margin-left:auto}
@media (max-width:760px){.topnav{display:none}.bar .call{margin-left:auto}}
.hero{position:relative;min-height:clamp(380px,52vh,560px);display:flex;align-items:center;justify-content:center;text-align:center;color:#fff;overflow:hidden}
.hero img.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero .scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,12,16,.62),rgba(10,12,16,.72))}
.hero-in{position:relative;max-width:860px;padding:76px 26px}
.hero h1{color:#fff;text-shadow:0 2px 24px rgba(0,0,0,.35)}
.hero .lede{margin:18px auto 0;max-width:620px;font-size:1.06rem;color:rgba(255,255,255,.94)}
.hero .cta-btn{display:inline-block;margin-top:26px;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;letter-spacing:.03em;text-transform:uppercase;font-size:.86rem;padding:14px 30px;border-radius:999px}
.eyebrow{display:flex;align-items:center;gap:12px;font-size:.76rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:14px}
.eyebrow::before{content:"";width:34px;height:2px;background:var(--accent);display:block}
.takeaways{background:var(--tint);border-left:4px solid var(--accent);border-radius:0 14px 14px 0;padding:22px 26px;margin:26px 0 34px}
.takeaways h3{font-size:1rem;margin-bottom:12px;color:var(--accent)}
.takeaways ul{margin:0;padding-left:20px}
.takeaways li{margin-bottom:9px;color:#3a3f4b}
figure{margin:38px 0}
figure img{width:100%;height:auto;border-radius:16px;display:block}
figcaption{font-size:.83rem;color:var(--muted);margin-top:10px;text-align:center}
.band{background:var(--tint);margin-top:64px;padding:64px 0}
.band-in{max-width:820px;margin:0 auto;padding:0 24px}
.crumbs{max-width:820px;margin:0 auto;padding:28px 24px 0;font-size:.85rem;color:var(--muted)}
.crumbs a{color:var(--muted);text-decoration:none}
.crumbs a:hover{color:var(--accent)}
main{max-width:820px;margin:0 auto;padding:16px 24px 72px}
h1{font-size:clamp(1.9rem,4.5vw,2.6rem);line-height:1.12;letter-spacing:-.02em;margin:10px 0 14px}
.updated{font-size:.85rem;color:var(--muted);margin-bottom:26px}
.intro{font-size:1.13rem;color:#2a2e37;margin-bottom:8px}
h2{font-size:1.45rem;line-height:1.25;letter-spacing:-.01em;margin:46px 0 14px}
.answer{background:var(--soft);border-left:4px solid var(--accent);border-radius:0 10px 10px 0;padding:16px 20px;margin-bottom:16px;font-weight:500}
p{margin-bottom:15px}
.faq{margin-top:52px}
.faq-item{border:1px solid var(--line);border-radius:12px;padding:18px 22px;margin-top:12px}
.faq-item h3{font-size:1.02rem;margin-bottom:6px}
.faq-item p{margin:0;color:#3a3f4b}
.cta{background:var(--accent);color:#fff;padding:34px 28px;border-radius:16px;margin-top:56px;text-align:center}
.cta p{margin:0 0 6px;font-size:1.12rem;font-weight:600}
.cta a{display:inline-block;margin-top:12px;background:#fff;color:var(--ink);text-decoration:none;font-weight:700;padding:12px 26px;border-radius:999px}
.related{margin-top:52px;padding-top:28px;border-top:1px solid var(--line)}
.related h2{margin-top:0;font-size:1.15rem}
.related-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));margin-top:14px}
.related a{border:1px solid var(--line);border-radius:10px;padding:12px 16px;color:var(--ink);text-decoration:none;font-size:.93rem;font-weight:500}
.related a:hover{border-color:var(--accent);color:var(--accent)}
footer{border-top:1px solid var(--line);background:var(--soft)}
.foot-in{max-width:1120px;margin:0 auto;padding:36px 24px 20px;display:grid;gap:28px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));font-size:.88rem;color:var(--muted)}
.foot-in h3{font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;color:var(--ink);margin-bottom:10px}
.foot-in a{display:block;color:var(--muted);text-decoration:none;padding:3px 0}
.foot-in a:hover{color:var(--accent)}
.foot-base{max-width:1120px;margin:0 auto;padding:0 24px 24px;font-size:.85rem;color:var(--muted);border-top:1px solid var(--line);padding-top:16px}
.foot-base a{color:var(--muted)}
</style>
</head>
<body>
<header class="bar"><div class="bar-in">
<a class="brand" href="${origin}/">${
  logo
    ? `<img src="${esc(logo)}" alt="${esc(input.business.name)}" width="170" height="34">`
    : esc(input.business.name)
}</a>
${
  nav.length
    ? `<nav class="topnav" aria-label="Primary">${nav
        .map((l) => `<a href="${origin}${esc(l.href)}">${esc(l.label)}</a>`)
        .join("")}</nav>`
    : ""
}
${phone ? `<a class="call" href="tel:${esc(phone)}">Call ${esc(phone)}</a>` : ""}
</div></header>
<nav class="crumbs" aria-label="Breadcrumb"><a href="${origin}/">Home</a> &rsaquo; <a href="${origin}/${folder}/">${esc(
    folderLabel
  )}</a> &rsaquo; ${esc(c.h1)}</nav>
${
  hero
    ? `<section class="hero">
<img class="bg" src="${esc(hero.path)}" alt="${esc(hero.alt)}" fetchpriority="high">
<span class="scrim"></span>
<div class="hero-in">
<h1>${esc(c.h1)}</h1>
<p class="lede">${esc(leadSentence(c.intro))}</p>
${phone ? `<a class="cta-btn" href="tel:${esc(phone)}">Call ${esc(phone)}</a>` : ""}
</div>
</section>`
    : ""
}
<main>
<article>
${hero ? "" : `<h1>${esc(c.h1)}</h1>`}
<p class="updated">Last updated ${today} &middot; ${esc(input.business.name)}, ${esc(input.business.city)}, ${esc(
    input.business.region
  )}</p>
<p class="eyebrow">Expert guidance</p>
<p class="intro">${escProse(c.intro, origin)}</p>
${
  c.sections.length
    ? `<div class="takeaways"><h3>Key takeaways</h3><ul>${c.sections
        .map((sec) => `<li>${escProse(leadSentence(sec.answer), origin)}</li>`)
        .join("")}</ul></div>`
    : ""
}
${c.sections
  .map(
    (s, i) => `<section>
<h2>${esc(s.heading)}</h2>
<p class="answer">${escProse(s.answer, origin)}</p>
<p>${escProse(s.body, origin)}</p>
${
  hero && i === midSection
    ? `<figure><img src="${esc(hero.path)}" alt="${esc(hero.alt)}" loading="lazy"><figcaption>${esc(
        input.business.name
      )} &middot; ${esc(input.business.city)}, ${esc(input.business.region)}</figcaption></figure>`
    : ""
}
</section>`
  )
  .join("\n")}
</article>
</main>
<section class="band">
<div class="band-in">
<p class="eyebrow">Common questions</p>
<h2 style="margin-top:0">Frequently asked questions</h2>
${c.faq
  .map((f) => `<div class="faq-item" style="background:#fff"><h3>${esc(f.question)}</h3>\n<p>${escProse(f.answer, origin)}</p></div>`)
  .join("\n")}
</div>
</section>
<main>
<article>
<div class="cta"><p>${escProse(c.cta, origin)}</p>${
    phone ? `<a href="tel:${esc(phone)}">Call ${esc(phone)}</a>` : ""
  }</div>
${
  internal.length
    ? `<nav class="related"><h2>Related pages</h2><div class="related-grid">${internal
        .map((l) => `<a href="${esc(l.path)}">${esc(l.title)}</a>`)
        .join("")}</div></nav>`
    : ""
}
</article>
</main>
<footer>
<div class="foot-in">
<div>
<h3>${esc(input.business.name)}</h3>
<p>${input.business.address ? `${esc(input.business.address)}, ` : ""}${esc(input.business.city)}, ${esc(
    input.business.region
  )}</p>
${phone ? `<a href="tel:${esc(phone)}">${esc(phone)}</a>` : ""}
</div>
${
  nav.length
    ? `<div><h3>Explore</h3>${nav
        .map((l) => `<a href="${origin}${esc(l.href)}">${esc(l.label)}</a>`)
        .join("")}</div>`
    : ""
}
${
  footerLinks.length
    ? `<div><h3>More</h3>${footerLinks
        .slice(0, 8)
        .map((l) => `<a href="${origin}${esc(l.href)}">${esc(l.label)}</a>`)
        .join("")}</div>`
    : ""
}
${
  internal.length
    ? `<div><h3>${esc(folderLabel)}</h3>${internal
        .map((l) => `<a href="${esc(l.path)}">${esc(l.title)}</a>`)
        .join("")}</div>`
    : ""
}
</div>
<div class="foot-base"><a href="${origin}/">${esc(input.business.name)}</a> &middot; Last updated ${today}</div>
</footer>
</body>
</html>`;
}

export async function generatePage(input: GenerateInput): Promise<GenerateOutput> {
  // The old code reported source "live" whenever a key was present, even
  // when the call had failed and this template was used instead — so a
  // broken key looked identical to a working one.
  let sourceReason: string | undefined;
  let content: PageContent | null = null;
  if (geminiConfigured()) {
    const attempt = await llmContent(input);
    content = attempt.content;
    if (!content) sourceReason = attempt.error ?? "Gemini produced no usable content";
  } else {
    sourceReason = "GEMINI_API_KEY is not set";
  }
  const usedLlm = content !== null;
  if (!content) content = fallbackContent(input);
  const slug = slugify(input.title || input.keyword);
  const folder =
    input.pageType === "location" ? "locations" : input.pageType === "service" ? "services" : "insights";

  // Artwork is produced before rendering because the template needs its
  // path. heroImageFor never throws and never returns null — worst case
  // it composes a brand SVG — so a page can't end up imageless.
  const image = await heroImageFor({
    keyword: input.keyword,
    businessName: input.business.name,
    city: input.business.city,
    industry: input.industry,
    accent: pickAccent(input.brand?.colors),
    skipModel: !usedLlm,
  });
  const heroImage = { path: `/${folder}/${slug}/${image.filename}`, alt: image.alt };
  const withHero: GenerateInput = { ...input, heroImage };

  const runAudit = (c: PageContent) => {
    const rendered = renderHtml(withHero, c, slug, folder);
    return {
      html: rendered,
      audit: auditPage({
        html: rendered,
        keyword: input.keyword,
        city: input.business.city,
        region: input.business.region,
        phone: input.business.phone,
        businessName: input.business.name,
        siblings: input.siblings,
        maskTerms: [input.business.city, input.business.region],
      }),
    };
  };

  let { html, audit } = runAudit(content);

  // Revise toward an A. Passing the 75 gate is the floor, not the target:
  // the audit knows exactly which dimensions scored low and why, so those
  // findings go back to the model for a targeted rewrite — up to two
  // rounds, keeping the best version, stopping early at grade A. Rerolls
  // sample the same distribution; revision climbs it. Vetoed drafts are
  // not revised (structural, not stylistic), nor are template fallbacks
  // (no model to revise with).
  const A_GRADE = 92;
  let rounds = 0;
  while (usedLlm && !audit.veto && audit.score < A_GRADE && rounds < 2) {
    rounds++;
    const issues = audit.dimensions
      .filter((d) => d.issues.length > 0)
      .flatMap((d) => d.issues.map((i) => `${d.name}: ${i}`))
      .slice(0, 12);
    if (issues.length === 0) break;
    const revised = await llmRevise(input, content, issues);
    if (!revised.content) break;
    const candidate = runAudit(revised.content);
    if (candidate.audit.score <= audit.score) break;
    content = revised.content;
    html = candidate.html;
    audit = candidate.audit;
  }

  return {
    slug,
    folder,
    image,
    title: content.h1,
    metaTitle: content.metaTitle,
    metaDescription: content.metaDescription,
    html,
    wordCount: audit.wordCount,
    source: usedLlm ? "live" : "template",
    sourceReason,
    audit,
  };
}

/** A 6% wash of the accent over white, for callouts and alternating bands. */
function tintOf(hex: string): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return "#f6f7f9";
  const mix = (c: number) => Math.round(c + (255 - c) * 0.93);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * The first complete sentence, kept whole.
 *
 * The hero lede used the meta description, which is hard-truncated to 158
 * characters and so ended mid-word ("Serving Greensboro and surrounding
 * areas. Ca") in the largest type on the page.
 */
function leadSentence(text: string): string {
  const trimmed = text.trim();
  const end = trimmed.search(/[.!?](\s|$)/);
  if (end === -1) return trimmed.length > 180 ? `${trimmed.slice(0, 177)}…` : trimmed;
  return trimmed.slice(0, end + 1);
}

/**
 * Title case that leaves acronyms and US state codes alone. Naive
 * per-word capitalisation rendered "small business nc" as "Small Business
 * Nc" in the H1 and breadcrumb of every location page.
 */
const KEEP_UPPER = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC","SEO","AEO","GEO","AI","HVAC","LLC","USA","B2B","B2C",
]);
const LOWER_WORDS = new Set(["a","an","and","as","at","but","by","for","in","of","on","or","the","to","vs"]);

function titleCase(s: string): string {
  const words = s.split(/\s+/);
  return words
    .map((w, i) => {
      const bare = w.replace(/[^a-zA-Z]/g, "");
      if (KEEP_UPPER.has(bare.toUpperCase())) return w.replace(bare, bare.toUpperCase());
      if (i > 0 && i < words.length - 1 && LOWER_WORDS.has(bare.toLowerCase())) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}
