/**
 * Internal link graph.
 *
 * Guards two real defects: internal links pointed at /<slug>/ while GitHub
 * sites publish to /<folder>/<slug>/, so every internal link on a static
 * site 404'd; and links only ever pointed backwards, leaving the oldest
 * pages — usually the most authoritative — passing nothing forward.
 */
import { relatedFor, relatedness, pathFor, withRelatedLinks, renderRelated } from "../src/lib/engine/link-graph";

type P = Parameters<typeof relatedFor>[0];
const mk = (o: Partial<P> & { id: string }): P => ({
  id: o.id, slug: o.slug ?? o.id, folder: o.folder ?? "insights",
  title: o.title ?? o.id, keyword: o.keyword ?? o.id,
  liveUrl: o.liveUrl === undefined ? `https://site.com/insights/${o.slug ?? o.id}/` : o.liveUrl,
  html: o.html ?? null,
});

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fails++; };
const ORIGIN = "https://site.com";

// --- paths come from the real published URL, folder included
check("path keeps the folder segment",
  pathFor(mk({ id: "a", slug: "pool-repair", folder: "services",
    liveUrl: "https://site.com/services/pool-repair/" }), ORIGIN) === "/services/pool-repair/");
check("path falls back to folder+slug when never published",
  pathFor(mk({ id: "b", slug: "x", folder: "locations", liveUrl: null }), ORIGIN) === "/locations/x/");
check("path is NOT the old broken /slug/ form",
  pathFor(mk({ id: "c", slug: "y", folder: "services", liveUrl: null }), ORIGIN) !== "/y/");
check("off-origin URL stays absolute (WordPress on another host)",
  pathFor(mk({ id: "d", slug: "z", liveUrl: "https://other.com/z/" }), ORIGIN) === "https://other.com/z/");

// --- relatedness ranks topical neighbours above unrelated pages
const poolClean = mk({ id: "1", keyword: "pool cleaning service mesa", title: "Pool cleaning" });
const poolRepair = mk({ id: "2", keyword: "pool repair service mesa", title: "Pool repair" });
const roofing = mk({ id: "3", keyword: "commercial roofing nyc", title: "Roofing", folder: "locations" });
check("related pages outrank unrelated ones",
  relatedness(poolClean, poolRepair) > relatedness(poolClean, roofing),
  `${relatedness(poolClean, poolRepair).toFixed(2)} vs ${relatedness(poolClean, roofing).toFixed(2)}`);

// --- forward linking: an older page can link to a newer one
const all = [poolClean, poolRepair, roofing];
const forOldest = relatedFor(poolClean, all, ORIGIN);
check("oldest page gets links to newer pages", forOldest.length === 2, JSON.stringify(forOldest));
check("a page never links to itself", !forOldest.some((l) => l.path.includes("/1/")));
check("best match ranked first", forOldest[0].title === "Pool repair", forOldest[0].title);

// --- unpublished pages are never linked to
const withDraft = relatedFor(poolClean, [...all, mk({ id: "4", keyword: "pool tiling mesa", liveUrl: null })], ORIGIN);
check("never links to an unpublished page", !withDraft.some((l) => l.path.includes("/4/")));

// --- surgical block replacement
const HTML = `<article><p>Body</p><nav class="related"><h2>Related pages</h2><div class="related-grid"><a href="/old/">Old</a></div></nav>\n</article>`;
const links = [{ title: "Pool repair", path: "/insights/2/" }];
const updated = withRelatedLinks(HTML, links);
check("block replaced", Boolean(updated) && updated!.includes("/insights/2/") && !updated!.includes("/old/"));
check("body untouched", Boolean(updated) && updated!.includes("<p>Body</p>"));
check("exactly one related block", (updated!.match(/<nav class="related">/g) || []).length === 1);

// --- the no-op guard: identical links must not trigger a republish
check("identical links return null (no needless republish)",
  withRelatedLinks(updated!, links) === null);

// --- a page with no block yet gets one inserted before </article>
const noBlock = `<article><p>Only body</p>\n</article>`;
const inserted = withRelatedLinks(noBlock, links);
check("block inserted when absent", Boolean(inserted) && inserted!.includes('<nav class="related">'));
check("inserted inside the article", Boolean(inserted) && inserted!.indexOf('<nav class="related">') < inserted!.indexOf("</article>"));

// --- escaping
check("titles are escaped",
  renderRelated([{ title: '<script>x</script>', path: "/a/" }]).includes("&lt;script&gt;"));

process.exit(fails);
