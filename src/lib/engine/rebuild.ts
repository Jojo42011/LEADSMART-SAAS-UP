import { localBusinessSchema } from "@/lib/schema";
// The one \u-escaping serialiser, shared with the page generator. This
// file briefly had its own copy and immediately reproduced the exact
// U+2028 paste bug generate.ts's comment documents — the strongest
// possible argument for there being one copy.
import { jsonLd } from "./generate";
import { siteOrigin } from "@/lib/url";

/**
 * The one-click homepage rebuild: a complete, modern, server-rendered
 * homepage built from what the business actually told us and what the
 * ingest actually read.
 *
 * Two constraints shape everything here, both inherited from decisions
 * made when the feature was scoped:
 *
 * PREVIEW BEFORE PUBLISH, NEVER DELETE. This module only builds the
 * document. Publishing is a separate, explicitly approved step, and even
 * then nothing is removed — on GitHub and FTP the previous homepage's
 * bytes are captured before being replaced, and on WordPress the new
 * page lands as a DRAFT the owner activates themselves.
 *
 * REAL DATA ONLY. Every section renders from a fact the owner gave us
 * (services, locations, phone, address) or a signal the ingest read
 * (description, logo, colors). There are no invented testimonials, no
 * "licensed and insured" boilerplate nobody verified, no star ratings.
 * A homepage that opens with a fabricated five-star review is the
 * fastest possible way to make a customer's business look dishonest —
 * with their name on it, not ours.
 */

export type RebuildInput = {
  businessName: string;
  industry: string;
  city: string;
  region: string;
  serviceArea: string;
  phone: string;
  address: string;
  services: string[];
  locations: string[];
  siteUrl: string;
  /** From the ingest: what the site already says about itself. */
  description?: string;
  logo?: string;
  colors?: string[];
  /** The site's real navigation, preserved so nothing the owner links to is lost. */
  nav?: { label: string; href: string }[];
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}


function titleCase(s: string): string {
  return s.replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1));
}

const FALLBACK_ACCENT = "#155e4d";

function isUsableAccent(hex: string): boolean {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Near-white washes out and near-black is indistinguishable from ink.
  return lum > 24 && lum < 214;
}

export type RebuiltHomepage = {
  html: string;
  title: string;
  metaDescription: string;
};

export function buildHomepage(input: RebuildInput): RebuiltHomepage {
  const origin = siteOrigin(input.siteUrl);
  const name = input.businessName.trim() || "This business";
  const city = input.city.trim();
  const industry = input.industry.trim();
  const services = input.services.map((s) => s.trim()).filter(Boolean).slice(0, 8);
  const locations = Array.from(
    new Set([city, ...input.locations.map((l) => l.trim())].filter(Boolean))
  ).slice(0, 10);
  const accent =
    (input.colors || []).map((c) => c.trim()).find(isUsableAccent) || FALLBACK_ACCENT;

  const title = [name, industry && titleCase(industry), city].filter(Boolean).join(" — ").slice(0, 60);
  // The pitch is assembled from given facts, so it is always true.
  const metaDescription = [
    name,
    industry ? `provides ${industry.toLowerCase()}` : "serves customers",
    city ? `in ${city}${input.region ? `, ${input.region}` : ""}` : "",
    services.length ? `— ${services.slice(0, 3).join(", ")}.` : ".",
    input.phone ? ` Call ${input.phone}.` : "",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 158);

  const heroLine = industry
    ? `${titleCase(industry)}${city ? ` in ${city}` : ""}`
    : name;
  const heroSub =
    input.description?.trim() ||
    [
      services.length
        ? `${name} handles ${services.slice(0, 3).map((s) => s.toLowerCase()).join(", ")}${services.length > 3 ? " and more" : ""}`
        : `${name} serves ${city || "its local area"}`,
      locations.length > 1 ? `across ${locations.slice(0, 4).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" ") + ".";

  // The real navigation survives the rebuild. A homepage that severs every
  // link the owner already had would lose readers and rankings both.
  const nav = (input.nav || []).slice(0, 6);
  const navHtml = nav.length
    ? nav.map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join("")
    : `<a href="#services">Services</a><a href="#areas">Service area</a><a href="#contact">Contact</a>`;

  const schema = localBusinessSchema({
    name,
    url: origin || input.siteUrl,
    description: metaDescription,
    telephone: input.phone || undefined,
    address: city
      ? {
          streetAddress: input.address || undefined,
          addressLocality: city,
          addressRegion: input.region || undefined,
        }
      : undefined,
  });

  const phoneCta = input.phone
    ? `<a class="cta" href="tel:${esc(input.phone.replace(/[^+\d]/g, ""))}">Call ${esc(input.phone)}</a>`
    : `<a class="cta" href="#contact">Get in touch</a>`;

  const servicesSection = services.length
    ? `<section id="services" class="wrap">
<h2>What we do</h2>
<div class="grid">
${services
  .map(
    (s) => `<div class="card"><h3>${esc(titleCase(s))}</h3><p>${esc(name)} provides ${esc(s.toLowerCase())}${city ? ` in ${esc(city)} and the surrounding area` : ""}.</p></div>`
  )
  .join("\n")}
</div>
</section>`
    : "";

  const areasSection =
    locations.length > 0
      ? `<section id="areas" class="wrap alt">
<h2>Where we work</h2>
<p class="areas">${locations.map((l) => `<span>${esc(titleCase(l))}</span>`).join("")}</p>
${input.serviceArea ? `<p class="muted">Serving ${esc(input.serviceArea)}.</p>` : ""}
</section>`
      : "";

  const contactBits = [
    input.phone ? `<p class="big"><a href="tel:${esc(input.phone.replace(/[^+\d]/g, ""))}">${esc(input.phone)}</a></p>` : "",
    input.address || city
      ? `<p class="muted">${esc([input.address, city, input.region].filter(Boolean).join(", "))}</p>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(metaDescription)}">
${origin ? `<link rel="canonical" href="${origin}/">` : ""}
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(metaDescription)}">
<script type="application/ld+json">${jsonLd(schema)}</script>
<style>
:root{--accent:${accent};--ink:#16181d;--muted:#5c6270;--line:#e7e8ec;--soft:#f6f7f9}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);line-height:1.7;background:#fff;font-size:16.5px}
a{color:var(--accent)}
.bar{border-bottom:1px solid var(--line);background:rgba(255,255,255,.94);position:sticky;top:0;z-index:20}
.bar-in{max-width:1140px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;gap:22px}
.brand{font-weight:700;font-size:1.06rem;color:var(--ink);text-decoration:none;display:flex;align-items:center;gap:10px;white-space:nowrap}
.brand img{height:34px;width:auto;max-width:180px;object-fit:contain}
.topnav{margin-left:auto;display:flex;flex-wrap:wrap;gap:4px}
.topnav a{color:var(--ink);text-decoration:none;font-size:.93rem;font-weight:500;padding:7px 12px;border-radius:8px}
.topnav a:hover{color:var(--accent)}
@media(max-width:740px){.topnav{display:none}}
.hero{background:linear-gradient(180deg,var(--soft),#fff);border-bottom:1px solid var(--line)}
.hero-in{max-width:1140px;margin:0 auto;padding:72px 24px 64px}
h1{font-size:clamp(1.9rem,4.5vw,3.1rem);letter-spacing:-.02em;line-height:1.12;max-width:17ch}
.sub{margin-top:18px;max-width:56ch;color:var(--muted);font-size:1.05rem}
.cta{display:inline-block;margin-top:28px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:999px}
.wrap{max-width:1140px;margin:0 auto;padding:56px 24px}
.alt{background:var(--soft);max-width:none}
.alt h2,.alt .areas,.alt .muted{max-width:1092px;margin-left:auto;margin-right:auto}
h2{font-size:1.5rem;letter-spacing:-.01em;margin-bottom:18px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.card{border:1px solid var(--line);border-radius:14px;padding:20px}
.card h3{font-size:1.02rem;margin-bottom:6px}
.card p{color:var(--muted);font-size:.95rem}
.areas{display:flex;flex-wrap:wrap;gap:8px}
.areas span{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 14px;font-size:.92rem}
.muted{color:var(--muted);margin-top:14px}
.big{font-size:1.4rem;font-weight:700}
.big a{color:var(--ink);text-decoration:none}
footer{border-top:1px solid var(--line);margin-top:24px}
.foot{max-width:1140px;margin:0 auto;padding:26px 24px;display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;color:var(--muted);font-size:.9rem}
</style>
</head>
<body>
<header class="bar"><div class="bar-in">
<a class="brand" href="/">${input.logo ? `<img src="${esc(input.logo)}" alt="${esc(name)}">` : esc(name)}</a>
<nav class="topnav" aria-label="Primary">${navHtml}</nav>
</div></header>
<section class="hero"><div class="hero-in">
<h1>${esc(heroLine)}</h1>
<p class="sub">${esc(heroSub)}</p>
${phoneCta}
</div></section>
${servicesSection}
${areasSection}
<section id="contact" class="wrap">
<h2>Contact ${esc(name)}</h2>
${contactBits || `<p class="muted">Reach out through the site's existing contact page.</p>`}
</section>
<footer><div class="foot">
<span>${esc(name)}${city ? ` — ${esc(city)}${input.region ? `, ${esc(input.region)}` : ""}` : ""}</span>
<span>${new Date().getFullYear()}</span>
</div></footer>
</body>
</html>`;

  return { html, title, metaDescription };
}
