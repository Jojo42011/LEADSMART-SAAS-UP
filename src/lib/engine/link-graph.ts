/**
 * Internal linking across the pages the agent has published.
 *
 * Two problems this solves, both structural rather than cosmetic.
 *
 * Links only ever pointed backwards. A page is generated with links to the
 * pages that existed at the time, so the first page a site publishes ends
 * up with none and never gains any, while the newest page links to
 * everything. Real internal-link equity flows both ways, and the oldest
 * pages — usually the ones that have accrued the most authority — were the
 * ones passing none of it forward. Publishing a page now also updates a
 * few older pages to link to it.
 *
 * And the links were pointing at the wrong URLs. The generator was handed
 * `/<slug>/` while GitHub sites publish to `/<folder>/<slug>/`, so every
 * internal link on a static site was a 404 — invisible in the dashboard,
 * which only ever verifies the page's own URL. Related links are now built
 * from each page's real published URL wherever one exists.
 */

export type LinkablePage = {
  id: string;
  slug: string;
  folder: string;
  title: string;
  keyword: string;
  liveUrl: string | null;
  html: string | null;
};

/** Content words, for judging how related two pages are. */
const STOP = new Set([
  "the", "a", "an", "and", "or", "for", "in", "on", "of", "to", "with", "your",
  "you", "how", "what", "why", "is", "are", "does", "do", "near", "me", "best",
  "top", "cost", "much", "per", "at", "by", "from", "it", "its", "that", "this",
]);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

/**
 * How related two pages are, 0..1.
 *
 * Jaccard overlap of keyword tokens, with a bump for sharing a folder.
 * Deterministic and cheap on purpose: this runs on every publish, and a
 * model call to rank related pages would add latency and cost to a step
 * that a word-overlap score handles well enough for a link block.
 */
export function relatedness(a: LinkablePage, b: LinkablePage): number {
  const ta = tokens(`${a.keyword} ${a.title}`);
  const tb = tokens(`${b.keyword} ${b.title}`);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = union ? shared / union : 0;
  return jaccard + (a.folder === b.folder ? 0.15 : 0);
}

/** Where a page actually lives, preferring the URL it really published to. */
export function pathFor(page: LinkablePage, origin: string): string {
  if (page.liveUrl) {
    try {
      const u = new URL(page.liveUrl);
      // Same-origin links stay relative so they survive a domain change.
      return u.origin === origin ? u.pathname : page.liveUrl;
    } catch {
      // fall through to the constructed path
    }
  }
  return `/${page.folder}/${page.slug}/`;
}

export type RelatedLink = { title: string; path: string };

/** The most related other pages, best first. */
export function relatedFor(
  page: LinkablePage,
  all: LinkablePage[],
  origin: string,
  limit = 4
): RelatedLink[] {
  return all
    .filter((p) => p.id !== page.id && p.liveUrl)
    .map((p) => ({ page: p, score: relatedness(page, p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ page: p }) => ({ title: p.title, path: pathFor(p, origin) }));
}

const RELATED_BLOCK = /<nav class="related">[\s\S]*?<\/nav>/i;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderRelated(links: RelatedLink[]): string {
  if (links.length === 0) return "";
  return `<nav class="related"><h2>Related pages</h2><div class="related-grid">${links
    .map((l) => `<a href="${esc(l.path)}">${esc(l.title)}</a>`)
    .join("")}</div></nav>`;
}

/**
 * Replaces a page's related-links block, returning null when nothing
 * changed.
 *
 * A surgical swap of one block the generator emits with a stable class,
 * rather than a regeneration: rewriting body copy to add a link would cost
 * a model call, risk the audit score, and change content the owner has
 * already seen. Returning null when the markup is identical matters —
 * it's what stops every publish from committing no-op updates to every
 * other page on the site.
 */
export function withRelatedLinks(html: string, links: RelatedLink[]): string | null {
  const block = renderRelated(links);
  const current = html.match(RELATED_BLOCK)?.[0] ?? null;

  if (!current) {
    if (!block) return null;
    // No block to replace: insert before the article closes, which is
    // where the generator puts it.
    if (!html.includes("</article>")) return null;
    return html.replace("</article>", `${block}\n</article>`);
  }
  if (current === block) return null;
  return block ? html.replace(RELATED_BLOCK, block) : html.replace(RELATED_BLOCK, "");
}
