import {
  type SiteRow,
  claimRun,
  updateRun,
  finishRun,
  touchSiteRun,
  getConnection,
  upsertKeywords,
  upsertCompetitors,
  countKeywords,
  nextTarget,
  listPages,
  insertPage,
  markKeywordCovered,
  markPagePublished,
} from "./store";
import { runResearch } from "./research";
import { generatePage } from "./generate";
import { publishGithub, publishWordpress } from "./publish";

/**
 * The autonomous cycle for one site: research when stale, pick the
 * highest opportunity uncovered keyword, generate one page, audit it
 * against its siblings, then publish (autopilot) or queue for review.
 * One page per cycle by design: predictable duration, no rate limit
 * pileups, and the plan stays responsive to fresh ranking data.
 * Single flight is enforced by the runs table, so overlapping cron
 * firings and manual runs cannot double publish.
 */

export type CycleResult = {
  siteId: string;
  ok: boolean;
  /** "live" when the model wrote the page, "template" when it fell back. */
  source?: "live" | "template";
  /** Why it fell back, when it did. */
  sourceReason?: string;
  skipped?: string;
  keyword?: string;
  slug?: string;
  auditScore?: number;
  status?: string;
  published?: boolean;
  liveStatus?: string | null;
  error?: string;
};

export async function runSiteCycle(site: SiteRow): Promise<CycleResult> {
  const runId = await claimRun(site.id);
  if (!runId) return { siteId: site.id, ok: false, skipped: "cycle already running" };

  try {
    // Phase 1: research, when the keyword pool is thin.
    await updateRun(runId, { phase: "research" });
    const existing = await countKeywords(site.id);
    if (existing < 10) {
      const research = await runResearch({
        business: { name: site.business_name, city: site.city, region: site.region },
        market: {
          industry: site.industry,
          services: site.services,
          locations: site.target_locations,
          competitors: site.seed_competitors,
        },
        websiteUrl: site.url,
      });
      await upsertKeywords(site.id, research.keywords);
      await upsertCompetitors(site.id, research.competitors);
      await updateRun(runId, { keywords_found: research.keywords.length });
    }

    // Phase 3: pick the next target from the gap queue.
    await updateRun(runId, { phase: "plan" });
    const target = await nextTarget(site.id);
    if (!target) {
      await finishRun(runId, "done", "No uncovered keywords; research pool exhausted");
      await touchSiteRun(site.id);
      return { siteId: site.id, ok: true, skipped: "no uncovered keywords" };
    }

    // Phase 4: generate one page, audited against its siblings.
    await updateRun(runId, { phase: "generate" });
    const siblings = (await listPages(site.id, true))
      .filter((p) => p.html)
      .map((p) => ({ slug: p.slug, html: p.html as string }));
    const brand = site.brand as { colors?: string[]; fonts?: string[]; description?: string };
    const pageType = target.intent === "informational" ? "article" : "location";

    const generateOnce = () => generatePage({
      keyword: target.term,
      pageType,
      business: {
        name: site.business_name,
        phone: site.phone,
        address: site.address,
        city: site.city,
        region: site.region,
      },
      websiteUrl: site.url,
      industry: site.industry,
      services: site.services,
      brand,
      internalLinks: siblings.slice(0, 6).map((s) => ({
        title: s.slug.replace(/-/g, " "),
        path: `/${s.slug}/`,
      })),
      siblings,
    });

    let page = await generateOnce();
    let attempts = 1;

    // One retry when the page misses the gate on quality alone.
    //
    // Generation varies by a few points run to run — the same keyword has
    // scored 78 and 74 on consecutive cycles — so a single attempt let a
    // coin flip decide whether a keyword ever gets a page. Nothing revisits
    // a held page either: markKeywordCovered fires regardless of status, so
    // a near miss was permanent. Retrying once and keeping the better of
    // the two costs an extra generation only on the pages that need it.
    //
    // Vetoes are never retried: an E-E-A-T veto is structural (a claim the
    // business cannot substantiate), so rerolling would just be rolling
    // until the check happens to miss it. Nor is a template fallback — if
    // the model never ran, running it again changes nothing.
    if (!page.audit.pass && !page.audit.veto && page.source !== "template") {
      const second = await generateOnce();
      attempts = 2;
      if (second.audit.score > page.audit.score) page = second;
    }
    await updateRun(runId, { pages_generated: 1 });

    // Quality gate: audit failures and vetoes never reach the site.
    const gatePassed = page.audit.pass;
    const status = !gatePassed ? "held" : site.publish_mode === "review" ? "pending" : "approved";
    const pageId = await insertPage({
      siteId: site.id,
      keyword: target.term,
      pageType,
      slug: page.slug,
      folder: page.folder,
      title: page.title,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      html: page.html,
      wordCount: page.wordCount,
      auditScore: page.audit.score,
      auditGrade: page.audit.grade,
      auditReport: page.audit,
      status,
      // When generation fell back to the template the score is low for a
      // reason the owner can fix, so say which it was instead of leaving
      // "below 75" to look like a content-quality verdict.
      heldReason:
        page.audit.veto ??
        (gatePassed
          ? undefined
          : `Audit score ${page.audit.score}, below 75${
              attempts > 1 ? ` (best of ${attempts} attempts)` : ""
            }${
              page.source === "template" && page.sourceReason
                ? ` — written from the built-in template because ${page.sourceReason}`
                : ""
            }`),
    });
    await markKeywordCovered(target.id, pageId);

    // Phase 5: publish, autopilot only.
    let published = false;
    let liveStatus: string | null = null;
    if (status === "approved") {
      await updateRun(runId, { phase: "publish" });
      const conn = await getConnection(site.id);
      if (site.platform === "wordpress" && conn?.wp_user && conn.wp_app_password) {
        const res = await publishWordpress({
          site: site.url,
          user: conn.wp_user,
          appPassword: conn.wp_app_password,
          slug: page.slug,
          title: page.title,
          html: page.html,
        });
        if (res.ok && res.platform === "wordpress") {
          await markPagePublished(pageId, { liveUrl: res.liveUrl, liveStatus: res.liveStatus ?? undefined, wpPageId: res.pageId });
          published = true;
          liveStatus = res.liveStatus;
        }
      } else if (site.platform === "github" && conn?.github_repo && conn.github_token) {
        const res = await publishGithub({
          token: conn.github_token,
          repo: conn.github_repo,
          branch: conn.github_branch,
          folder: page.folder,
          slug: page.slug,
          title: page.title,
          html: page.html,
          siteUrl: site.url,
        });
        if (res.ok && res.platform === "github") {
          await markPagePublished(pageId, {
            liveUrl: res.liveUrl ?? undefined,
            liveStatus: res.liveStatus ?? undefined,
            githubSha: res.commitSha ?? undefined,
          });
          published = true;
          liveStatus = res.liveStatus;
        }
      }
      if (published) await updateRun(runId, { published: 1 });
    }

    const summary = `${target.term}: score ${page.audit.score} (${page.audit.grade}), ${
      published ? `published, ${liveStatus ?? "unverified"}` : `status ${status}`
    }${page.source === "template" ? ` [template: ${page.sourceReason ?? "model unavailable"}]` : ""}`;
    await finishRun(runId, "done", summary);
    await touchSiteRun(site.id);

    return {
      siteId: site.id,
      ok: true,
      keyword: target.term,
      slug: page.slug,
      auditScore: page.audit.score,
      status: published ? "published" : status,
      published,
      liveStatus,
      source: page.source,
      sourceReason: page.sourceReason,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "cycle failed";
    await finishRun(runId, "failed", "Cycle failed", message);
    await touchSiteRun(site.id);
    return { siteId: site.id, ok: false, error: message };
  }
}
