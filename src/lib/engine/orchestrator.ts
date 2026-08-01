import {
  type SiteRow,
  claimRun,
  recoverStuckRuns,
  runningSince,
  updateRun,
  finishRun,
  touchSiteRun,
  upsertKeywords,
  upsertCompetitors,
  countKeywords,
  nextTarget,
  listPages,
  insertPage,
  markKeywordCovered,
  updateSiteBrand,
  findOrCreateKeyword,
} from "./store";
import { ingestSite, isBrandColor } from "../site-ingest";
import { siteOrigin } from "../url";
import { runResearch } from "./research";
import { generatePage } from "./generate";
import { publishStoredPage } from "./publish-page";

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

export async function runSiteCycle(
  site: SiteRow,
  opts?: {
    /** Generate this exact term now instead of the queue's next pick. */
    keywordTerm?: string;
  }
): Promise<CycleResult> {
  // Normalized once, here, rather than at seven call sites. Onboarding
  // accepts "example.com" the way people type it and stored it verbatim,
  // so every consumer that treated site.url as a URL — fetch(), canonical
  // tags, schema.org — was working from a string that is not one.
  const origin = siteOrigin(site.url);

  // Reap this site's dead runs before claiming. A serverless invocation
  // killed at its 300s ceiling never reaches finishRun(), so the flight
  // slot stays held by a process that no longer exists — and because only
  // the hourly cron used to reap, pressing Generate returned "cycle
  // already running" until the next tick happened to clear it. Every
  // entry point claims through here, so self-healing belongs here.
  await recoverStuckRuns(site.id);

  const runId = await claimRun(site.id);
  if (!runId) {
    const since = await runningSince(site.id);
    const mins = since ? Math.max(0, Math.round((Date.now() - since.getTime()) / 60000)) : null;
    return {
      siteId: site.id,
      ok: false,
      skipped:
        mins === null
          ? "cycle already running"
          : `a cycle started ${mins === 0 ? "moments" : `${mins} min`} ago is still running`,
    };
  }

  try {
    // Phase 0: drain the stranded backlog before spending on generation.
    // A page can end up approved-but-unpublished when its publish attempt
    // fails (the schemeless-URL bug stranded three at once), and nothing
    // else ever returns to it — each cycle picks a NEW keyword, so the
    // backlog is invisible to the normal flow. Publishing the oldest one
    // IS this cycle's page: the work is already generated and audited, so
    // shipping it costs no model tokens, and one-page-per-cycle pacing is
    // preserved. Skipped when the owner asked for a specific keyword,
    // because that press means "write THIS", not "do the oldest chore".
    if (!opts?.keywordTerm) {
      const stranded = (await listPages(site.id, true)).filter(
        (p) => p.status === "approved" && !p.live_url && p.html
      );
      if (stranded.length > 0) {
        const oldest = stranded[stranded.length - 1];
        await updateRun(runId, { phase: "publish" });
        const res = await publishStoredPage(site, {
          id: oldest.id,
          slug: oldest.slug,
          folder: oldest.folder,
          title: oldest.title,
          html: oldest.html as string,
        });
        if (res.published) await updateRun(runId, { published: 1 });
        const summary = `${oldest.keyword}: backlog publish, ${
          res.published ? `published, ${res.liveStatus ?? "unverified"}` : `failed: ${res.publishError}`
        }${res.discoveryNote ? ` [${res.discoveryNote}]` : ""}`;
        await finishRun(runId, res.published ? "done" : "failed", summary, res.publishError ?? undefined);
        await touchSiteRun(site.id);
        return {
          siteId: site.id,
          ok: res.published,
          keyword: oldest.keyword,
          slug: oldest.slug,
          auditScore: oldest.audit_score,
          status: res.published ? "published" : "approved",
          published: res.published,
          liveStatus: res.liveStatus,
          error: res.publishError ?? undefined,
        };
      }
    }

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
        websiteUrl: origin,
      });
      await upsertKeywords(site.id, research.keywords);
      await upsertCompetitors(site.id, research.competitors);
      await updateRun(runId, { keywords_found: research.keywords.length });
    }

    // Phase 3: pick the next target from the gap queue — or the exact
    // keyword the owner clicked "generate now" on.
    await updateRun(runId, { phase: "plan" });
    const target = opts?.keywordTerm
      ? await findOrCreateKeyword(site.id, opts.keywordTerm)
      : await nextTarget(site.id);
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
    let brand = site.brand as {
      colors?: string[];
      fonts?: string[];
      description?: string;
      nav?: { label: string; href: string }[];
      footerLinks?: { label: string; href: string }[];
      logo?: string;
    };
    // Self-heal a missing OR unusable brand snapshot. Pages are styled
    // from it, so an empty one ships black-and-white — and so does one
    // whose colors are all neutrals, which is exactly what the old
    // frequency-ranked extractor stored (it crowned the site's text ink
    // as the brand). Re-read the live site once and keep the result;
    // failures fall through to the defaults rather than blocking the
    // cycle.
    if (!brand?.colors?.some(isBrandColor) || !brand?.nav?.length || !brand?.logo) {
      try {
        const ingest = await ingestSite(origin);
        // Only store an ingest that improves on what we have: replacing a
        // neutral-only snapshot with another neutral-only snapshot would
        // re-run this fetch every cycle for nothing.
        if (
          ingest.ok &&
          (ingest.colors.some(isBrandColor) || !brand?.colors?.length || ingest.nav.length || ingest.logo)
        ) {
          brand = {
            ...brand,
            colors: ingest.colors.some(isBrandColor) || !brand?.colors?.length ? ingest.colors : brand.colors,
            fonts: ingest.fonts.length ? ingest.fonts : brand?.fonts,
            nav: ingest.nav.length ? ingest.nav : brand?.nav,
            footerLinks: ingest.footerLinks.length ? ingest.footerLinks : brand?.footerLinks,
            logo: ingest.logo || brand?.logo,
          };
          await updateSiteBrand(site.id, brand);
        }
      } catch {
        // invalid/blocked site URL; generate with defaults
      }
    }
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
      websiteUrl: origin,
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

    // Phase 5: publish, autopilot only — through the same function the
    // owner's Publish button uses, so the two can never diverge.
    let published = false;
    let discoveryNote: string | null = null;
    let liveStatus: string | null = null;
    let publishError: string | null = null;
    if (status === "approved") {
      await updateRun(runId, { phase: "publish" });
      const res = await publishStoredPage(
        { ...site, brand },
        {
          id: pageId,
          slug: page.slug,
          folder: page.folder,
          title: page.title,
          html: page.html,
          image: {
            filename: page.image.filename,
            base64: page.image.base64,
            mimeType: page.image.mimeType,
            alt: page.image.alt,
          },
        }
      );
      published = res.published;
      liveStatus = res.liveStatus;
      publishError = res.publishError;
      discoveryNote = res.discoveryNote;
      if (published) await updateRun(runId, { published: 1 });
    }

    const summary = `${target.term}: score ${page.audit.score} (${page.audit.grade}), ${
      published ? `published, ${liveStatus ?? "unverified"}` : `status ${status}`
    }${publishError ? ` [publish failed: ${publishError}]` : ""}${discoveryNote ? ` [${discoveryNote}]` : ""}${
      page.source === "template" ? ` [template: ${page.sourceReason ?? "model unavailable"}]` : ""
    }`;
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
      error: publishError ?? undefined,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "cycle failed";
    await finishRun(runId, "failed", "Cycle failed", message);
    await touchSiteRun(site.id);
    return { siteId: site.id, ok: false, error: message };
  }
}
