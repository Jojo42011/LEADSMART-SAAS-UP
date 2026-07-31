import { geminiImage } from "@/lib/gemini";

/**
 * Imagery for generated pages.
 *
 * Every published page must carry an image — a page of unbroken text
 * reads as a blog post, not as part of a real website, and image search
 * is a discovery surface a text-only page forfeits entirely. "Must" is
 * the hard part: an LLM image call can fail, rate-limit, or be
 * unavailable on a given key, so this is layered.
 *
 *   1. Gemini generates a bespoke image from the page topic and the
 *      customer's own palette.
 *   2. If that yields nothing, a deterministic SVG is composed from the
 *      brand colors. It needs no network, cannot fail, and is different
 *      for every keyword, so pages never repeat the same artwork.
 *
 * Layer 2 is what makes the guarantee real. Images are returned as files
 * to commit rather than data URIs on purpose: a real file at a real path
 * can be indexed by image search, cached, and given a descriptive
 * filename, none of which a base64 blob gets.
 */

export type PageImage = {
  /** File name only; the publisher decides the directory. */
  filename: string;
  /** Base64 payload ready to commit. */
  base64: string;
  /** Written into the img tag; real descriptive text, never keyword soup. */
  alt: string;
  /** "generated" when a model drew it, "brandmark" for the SVG fallback. */
  source: "generated" | "brandmark";
  mimeType: string;
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Mixes a hex colour toward white (amount > 0) or black (amount < 0). */
function shade(hex: string, amount: number): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const num = parseInt(full, 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((num >> 16) & 255) + 255 * amount);
  const g = clamp(((num >> 8) & 255) + 255 * amount);
  const b = clamp((num & 255) + 255 * amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * An abstract editorial panel built from the site's own accent.
 *
 * Deterministic per keyword — same page, same artwork; different pages,
 * different artwork — and vector, so it stays crisp on any display and
 * weighs about a kilobyte. Four distinct compositions rather than one
 * parameterised shape: a single layout with jittered numbers still reads
 * as the same stock blob on every page, which is exactly the "obviously
 * placeholder" look this has to avoid.
 *
 * The palette is deliberately deep rather than tinted-pale. Washing the
 * accent out toward white produces muddy, low-contrast artwork; anchoring
 * on a dark ink ground with the accent at full strength reads as
 * intentional design.
 */
function brandmarkSvg(keyword: string, accent: string): string {
  const h = hash(keyword);
  const seed = (n: number) => ((h >> (n * 3)) % 1000) / 1000;
  const W = 1200;
  const H = 630;

  const ink = shade(accent, -0.62);
  const deep = shade(accent, -0.34);
  const bright = shade(accent, 0.22);
  const pale = shade(accent, 0.6);
  const layout = h % 4;

  // Fine rule grid, shared by every layout: the detail that separates a
  // designed panel from a flat gradient.
  const grid = `<g opacity="0.16">${Array.from({ length: 11 }, (_, i) => {
    const x = 100 + i * 100;
    return `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${pale}" stroke-width="1"/>`;
  }).join("")}</g>`;

  let art = "";
  if (layout === 0) {
    // Ascending columns — a quiet nod to growth, no text needed.
    const bars = Array.from({ length: 7 }, (_, i) => {
      const bh = 90 + i * (46 + seed(i + 1) * 26);
      const x = 620 + i * 74;
      const op = 0.28 + i * 0.1;
      return `<rect x="${x}" y="${H - 90 - bh}" width="44" height="${bh}" rx="8" fill="${
        i === 6 ? accent : bright
      }" opacity="${Math.min(op, 0.95)}"/>`;
    }).join("");
    art = `${bars}<circle cx="300" cy="240" r="${150 + seed(2) * 60}" fill="${accent}" opacity="0.22"/>`;
  } else if (layout === 1) {
    // Concentric arcs sweeping off-canvas.
    const cx = 980;
    const cy = 520;
    art = Array.from({ length: 5 }, (_, i) => {
      const r = 180 + i * (95 + seed(i) * 30);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${
        i % 2 ? accent : pale
      }" stroke-width="${i === 0 ? 26 : 12}" opacity="${0.75 - i * 0.12}"/>`;
    }).join("");
  } else if (layout === 2) {
    // Diagonal planes: two large slabs crossing the frame.
    const off = 120 + seed(1) * 160;
    art = `<polygon points="0,${H} ${420 + off},0 ${760 + off},0 0,${H - 60}" fill="${accent}" opacity="0.5"/>
<polygon points="${540 + off},0 ${W},0 ${W},${H} ${900 + off},${H}" fill="${bright}" opacity="0.35"/>
<circle cx="${300 + seed(3) * 120}" cy="${200 + seed(4) * 120}" r="70" fill="${pale}" opacity="0.7"/>`;
  } else {
    // Stacked rounded panels, offset like layered cards.
    art = Array.from({ length: 4 }, (_, i) => {
      const x = 560 + i * 34;
      const y = 90 + i * 24;
      return `<rect x="${x}" y="${y}" width="${520 - i * 40}" height="${420 - i * 50}" rx="26" fill="${
        i === 3 ? accent : bright
      }" opacity="${0.2 + i * 0.22}"/>`;
    }).join("");
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${ink}"/>
<stop offset="100%" stop-color="${deep}"/>
</linearGradient>
<radialGradient id="glow" cx="30%" cy="25%" r="70%">
<stop offset="0%" stop-color="${bright}" stop-opacity="0.35"/>
<stop offset="100%" stop-color="${ink}" stop-opacity="0"/>
</radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
${grid}
<rect width="${W}" height="${H}" fill="url(#glow)"/>
${art}
<rect x="0" y="${H - 10}" width="${W}" height="10" fill="${accent}"/>
</svg>`;
}

/** Filename-safe slug for image files. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * Builds the hero image for a page. Never throws and never returns null:
 * the SVG path is pure computation, so a page always has artwork.
 */
export async function heroImageFor(input: {
  keyword: string;
  businessName: string;
  city: string;
  industry: string;
  accent: string;
  /** Skip the model call (used by tests and by template-only fallbacks). */
  skipModel?: boolean;
}): Promise<PageImage> {
  const base = slugify(input.keyword) || "hero";
  const alt = `${input.businessName} — ${input.keyword}${input.city ? ` in ${input.city}` : ""}`;

  if (!input.skipModel) {
    // Photographic, brand-tinted, and explicitly free of invented text:
    // rendered lettering in generated images is the usual way these look
    // fake, and any words it invented would be unverifiable claims on a
    // customer's live site.
    const prompt = [
      `A premium, photorealistic editorial photograph for a ${input.industry || "professional services"} business`,
      input.city ? `based in ${input.city}` : "",
      `illustrating the topic "${input.keyword}".`,
      `Natural light, shallow depth of field, calm and confident mood, magazine quality.`,
      `Colour grade should harmonise with the brand accent ${input.accent}.`,
      `Absolutely no text, no words, no letters, no numbers, no logos, no watermarks, and no user interface elements anywhere in the image.`,
      `Wide 1200x630 composition with clear space on the left third.`,
    ]
      .filter(Boolean)
      .join(" ");

    try {
      const img = await geminiImage(prompt);
      if (img?.data) {
        const ext = img.mimeType.includes("jpeg") ? "jpg" : img.mimeType.includes("webp") ? "webp" : "png";
        return {
          filename: `${base}.${ext}`,
          base64: img.data,
          alt,
          source: "generated",
          mimeType: img.mimeType,
        };
      }
    } catch {
      // fall through to the brandmark
    }
  }

  const svg = brandmarkSvg(input.keyword, input.accent);
  return {
    filename: `${base}.svg`,
    base64: Buffer.from(svg, "utf8").toString("base64"),
    alt,
    source: "brandmark",
    mimeType: "image/svg+xml",
  };
}

export const __testing = { brandmarkSvg, shade, slugify };
