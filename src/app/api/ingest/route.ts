import { NextRequest, NextResponse } from "next/server";

/**
 * Studies a website the way the agent does before its first cycle:
 * fetches the homepage, extracts brand signals (title, description, headings,
 * phone, nav structure, colors, fonts) and detects the platform. The wizard
 * uses this to auto select WordPress and to show the owner that the agent
 * has actually read their site.
 */

type Ingest = {
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

export async function POST(req: NextRequest) {
  let url = "";
  try {
    const body = (await req.json()) as { url?: string };
    url = (body.url || "").trim();
  } catch {
    // fall through to validation
  }
  if (!url) return NextResponse.json({ ok: false, error: "url required" }, { status: 400 });
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid url" }, { status: 400 });
  }

  const result: Ingest = {
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
    const res = await fetch(origin, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AscentAgent/1.0)" },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
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
        const probe = await fetch(`${origin}/wp-json/`, {
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
    const navBlock = html.match(/<nav[\s\S]{0,6000}?<\/nav>/i)?.[0] || html.match(/<header[\s\S]{0,8000}?<\/header>/i)?.[0] || "";
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
        const cssRes = await fetch(sheetUrl, { signal: AbortSignal.timeout(6000) });
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
    result.colors = [...colorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([c]) => c);

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
      const sm = await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(5000) });
      if (sm.ok) {
        const xml = (await sm.text()).slice(0, 400_000);
        const locs = xml.match(/<loc>/g);
        if (locs) result.pageCount = locs.length;
      }
    } catch {
      // no sitemap; leave null
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ...result, ok: false, error: e instanceof Error ? e.message : "fetch failed" },
      { status: 200 }
    );
  }
}
