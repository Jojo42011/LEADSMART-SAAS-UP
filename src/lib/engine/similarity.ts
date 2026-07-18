/**
 * Cross page duplicate detection: the doorway page guard.
 * Location pages on the same site legitimately share structure, but when
 * two pages are near identical outside the city name Google treats them
 * as doorway pages. Shingle fingerprints plus Jaccard similarity catch
 * that before publish; each page is compared against its siblings, not
 * scored in isolation.
 */

function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/** Word 5 shingles hashed into a set. Localities are masked first so a
 * template swap of the city name cannot hide the duplication. */
export function fingerprint(html: string, maskTerms: string[] = []): Set<number> {
  let text = textOf(html);
  for (const term of maskTerms) {
    if (term.trim().length < 3) continue;
    text = text.split(term.toLowerCase()).join("__loc__");
  }
  const words = text.split(" ").filter((w) => w.length > 1);
  const shingles = new Set<number>();
  for (let i = 0; i + 5 <= words.length; i++) {
    const s = words.slice(i, i + 5).join(" ");
    let h = 2166136261;
    for (let j = 0; j < s.length; j++) {
      h ^= s.charCodeAt(j);
      h = Math.imul(h, 16777619);
    }
    shingles.add(h >>> 0);
  }
  return shingles;
}

export function jaccard(a: Set<number>, b: Set<number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export type SimilarityVerdict = {
  maxSimilarity: number;
  nearestSlug: string | null;
  /** Similarity above 0.6 fails the originality dimension; above 0.8 vetoes publish outright. */
  doorwayRisk: "none" | "elevated" | "veto";
};

export function checkSimilarity(
  html: string,
  siblings: { slug: string; html: string }[],
  maskTerms: string[]
): SimilarityVerdict {
  const fp = fingerprint(html, maskTerms);
  let max = 0;
  let nearest: string | null = null;
  for (const s of siblings) {
    if (!s.html) continue;
    const sim = jaccard(fp, fingerprint(s.html, maskTerms));
    if (sim > max) {
      max = sim;
      nearest = s.slug;
    }
  }
  return {
    maxSimilarity: Math.round(max * 100) / 100,
    nearestSlug: nearest,
    doorwayRisk: max > 0.8 ? "veto" : max > 0.6 ? "elevated" : "none",
  };
}
