import { assertPublicUrl, safeFetch } from "./safe-fetch";

/**
 * Reads a website the way the agent does before writing for it: brand
 * signals (title, description, phone, nav, colors, fonts) and platform.
 *
 * Lives here rather than inside the /api/ingest route so the engine can
 * call it too: generated pages are styled from the stored brand snapshot,
 * and when that snapshot is missing (wiped by a re-provision, or an
 * onboarding that skipped analysis) the cycle re-reads the live site
 * instead of shipping pages in default black-and-white.
 */

export type SiteIngest = {
  ok: boolean;
  url: string;
  platform: "wordpress" | "github" | "unknown";
  title: string;
  description: string;
  h1: string;
  phone: string;
  navLinks: string[];
  colors: string[];
  fonts: string[];
  pageCount: number | null;
};

/**
 * Whether a hex color can plausibly be a brand accent.
 *
 * The extractor originally ranked colors purely by frequency, and in
 * nearly every stylesheet the most frequent hexes are the neutrals — text
 * inks, borders, backgrounds. On the first real customer site it crowned
 * #17181a (the text color) as the brand while the actual golds sat three
 * entries down, and every generated page rendered black-and-white. A
 * brand accent has chroma: meaningful spread between its RGB channels,
 * and neither blinding lightness nor near-black darkness.
 */
export function isBrandColor(hex: string): boolean {
  const m = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return false;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const lum = (r + g + b) / 3;
  return chroma >= 24 && lum >= 24 && lum <= 232;
}

/** First color that can carry a brand, else the first color, else ink. */
export function pickAccent(colors: string[] | undefined, fallback = "#111111"): string {
  if (!colors || colors.length === 0) return fallback;
  return colors.find(isBrandColor) ?? colors[0] ?? fallback;
}

function extract(re: RegExp, html: string): string {
  const m = html.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

/** Throws on invalid/blocked URLs (see assertPublicUrl); network failures return ok:false. */
export async function ingestSite(rawUrl: string): Promise<SiteIngest> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  // Rejects non-http(s) schemes and any host that resolves into a private
  // or reserved range before a single request leaves the server.
  const origin = (await assertPublicUrl(url)).origin;

  const result: SiteIngest = {
    ok: false,
    url: origin,
    platform: "unknown",
    title: "",
    description: "",
    h1: "",
    phone: "",
    navLinks: [],
    colors: [],
    fonts: [],
    pageCount: null,
  };

  try {
    // safeFetch re-validates every redirect hop; "follow" would let a
    // public URL bounce the request to an internal address.
    const res = await safeFetch(origin, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AscentAgent/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const html = (await res.text()).slice(0, 500_000);

    result.ok = true;
    result.title = decodeEntities(extract(/<title[^>]*>([^<]*)<\/title>/i, html));
    result.description = decodeEntities(
      extract(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i, html) ||
        extract(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i, html)
    );
    result.h1 = decodeEntities(extract(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html).replace(/<[^>]+>/g, ""));

    const tel = html.match(/href=["']tel:([^"']+)["']/i);
    if (tel) result.phone = tel[1].trim();

    // Platform detection: generator meta, wp-content paths, then a wp-json probe.
    if (/wp-content|wp-includes|name=["']generator["'][^>]*wordpress/i.test(html)) {
      result.platform = "wordpress";
    } else {
      try {
        const probe = await safeFetch(`${origin}/wp-json/`, {
          signal: AbortSignal.timeout(4000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AscentAgent/1.0)" },
        });
        if (probe.ok) {
          const ct = probe.headers.get("content-type") || "";
          if (ct.includes("json")) result.platform = "wordpress";
        }
      } catch {
        // not wordpress, that is fine
      }
    }

    // Nav links: anchors inside the first <nav> or <header> block.
    const navBlock =
      html.match(/<nav[\s\S]{0,6000}?<\/nav>/i)?.[0] || html.match(/<header[\s\S]{0,8000}?<\/header>/i)?.[0] || "";
    const linkText = [...navBlock.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()))
      .filter((t) => t.length > 1 && t.length < 32);
    result.navLinks = [...new Set(linkText)].slice(0, 10);

    // Design tokens: hex colors and font families by frequency, from inline
    // styles plus the first linked stylesheet.
    let css = html;
    const sheet = html.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/i)?.[1];
    if (sheet) {
      try {
        const sheetUrl = new URL(sheet, origin).href;
        // The stylesheet href comes from attacker-controllable HTML.
        const cssRes = await safeFetch(sheetUrl, { signal: AbortSignal.timeout(6000) });
        if (cssRes.ok) css += (await cssRes.text()).slice(0, 300_000);
      } catch {
        // stylesheet unreachable; inline styles still give us signal
      }
    }
    const colorCounts = new Map<string, number>();
    for (const m of css.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
      const c = `#${m[1].toLowerCase()}`;
      if (["#fff", "#ffffff", "#000", "#000000"].includes(c)) continue;
      colorCounts.set(c, (colorCounts.get(c) || 0) + 1);
    }
    // Brand-capable colors first (each group still ordered by frequency),
    // neutrals after — so colors[0] is the site's accent, not its text ink.
    const byFreq = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    result.colors = [...byFreq.filter(isBrandColor), ...byFreq.filter((c) => !isBrandColor(c))].slice(0, 6);

    const fontCounts = new Map<string, number>();
    for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)[;}]/gi)) {
      const first = m[1].split(",")[0].replace(/["']/g, "").trim();
      if (!first || /inherit|initial|var\(/i.test(first)) continue;
      fontCounts.set(first, (fontCounts.get(first) || 0) + 1);
    }
    result.fonts = [...fontCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([f]) => f);

    // Rough indexed page count from the sitemap when it is reachable.
    try {
      const sm = await safeFetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(5000) });
      if (sm.ok) {
        const xml = (await sm.text()).slice(0, 400_000);
        const locs = xml.match(/<loc>/g);
        if (locs) result.pageCount = locs.length;
      }
    } catch {
      // no sitemap; leave null
    }

    return result;
  } catch {
    return result;
  }
}
