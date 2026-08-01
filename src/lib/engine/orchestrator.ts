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
  type RefreshCandidate,
  getRefreshCandidate,
  getPageAsRefreshCandidate,
  countPublishedPages,
  markPageRefreshed,
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

/**
 * Days before a live page is considered stale enough to rewrite. Matches
 * the "Refresh due" threshold `scoreFreshness` already uses, so the signal
 * the dashboard shows and the action the agent takes cannot disagree.
 */
const REFRESH_AFTER_DAYS = 150;

/**
 * Library size at which maintenance starts outranking expansion. A
 * judgment call, not a measured constant: below it, a site still has
 * obvious coverage gaps and a new page is worth more than a rewrite.
 */
const MAINTAIN_ABOVE_PAGES = 8;

/**
 * A refreshed page replaces the live one only if it clears the publish
 * gate and does not lose meaningful ground. Generation varies a few points
 * run to run — the same keyword has scored 78 and 74 on consecutive cycles
 * — so a small dip is noise rather than a regression, and the freshness
 * gain outweighs it. A real drop means the rewrite was worse than what is
 * already live, and shipping it would trade a citation factor for content
 * quality, which is a bad trade in the direction that matters.
 */
const REFRESH_SCORE_TOLERANCE = 3;

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

    // Phase 0.5: refresh the stalest live page.
    //
    // Freshness is a top-three controllable AI-citation factor — roughly
    // 83% of citations go to pages updated within twelve months — and the
    // agent has always scored it and shown a "Refresh due" signal while
    // nothing acted on it, because every cycle picked a NEW keyword and no
    // code path ever returned to a published page. Its value decayed on a
    // dashboard that could see it happening.
    //
    // A refresh takes the cycle rather than running alongside one: the
    // one-page-per-cycle budget is what keeps duration predictable and
    // rate limits clear, and a rewrite of a decaying page is worth more
    // than an additional page on most days it is due.
    if (!opts?.keywordTerm) {
      const candidate = await getRefreshCandidate(site.id, REFRESH_AFTER_DAYS);
      const uncovered = candidate ? await nextTarget(site.id) : null;
      const libraryCount = candidate ? await countPublishedPages(site.id) : 0;
      // Expand first, maintain second. While a site still has uncovered
      // keywords AND a small library, a new page adds more than a rewrite
      // does — coverage gaps cost more than mild staleness early on. Once
      // the library is established, or there is nothing new left to write,
      // maintenance compounds and takes priority.
      const shouldRefresh = Boolean(candidate) && (!uncovered || libraryCount >= MAINTAIN_ABOVE_PAGES);
      if (candidate && shouldRefresh) {
        const result = await refreshPage({ site, origin, runId, candidate, brand: site.brand });
        await touchSiteRun(site.id);
        return result;
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
          notify: {
            keyword: target.term,
            auditScore: page.audit.score,
            auditGrade: page.audit.grade,
            businessName: site.business_name,
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

/**
 * Rewrites one live page in place with current research, and replaces the
 * published version only if the rewrite earns it.
 *
 * The failure mode this guards against is subtle and expensive: a refresh
 * that ships a weaker page trades content quality for a freshness signal
 * and quietly erodes the library over time, one page per cycle, with the
 * dashboard reporting success every time. So the new draft is audited on
 * the same terms as a new page, and the live version stands unless the
 * rewrite clears the gate and holds its score. A refusal is a real
 * outcome, reported as one — not an error, and not a silent no-op.
 */
async function refreshPage(input: {
  site: SiteRow;
  origin: string;
  runId: string;
  candidate: RefreshCandidate;
  brand: Record<string, unknown>;
}): Promise<CycleResult> {
  const { site, origin, runId, candidate } = input;
  await updateRun(runId, { phase: "refresh" });

  // Siblings exclude the page being rewritten: comparing a refresh against
  // its own previous version would score it as duplicative of itself and
  // fail the information-gain check every time.
  const siblings = (await listPages(site.id, true))
    .filter((p) => p.html && p.id !== candidate.id)
    .map((p) => ({ slug: p.slug, html: p.html as string }));

  const brand = input.brand as {
    colors?: string[];
    fonts?: string[];
    nav?: { label: string; href: string }[];
    footerLinks?: { label: string; href: string }[];
    logo?: string;
  };

  const page = await generatePage({
    keyword: candidate.keyword,
    pageType: candidate.page_type === "article" ? "article" : "location",
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
    internalLinks: siblings.slice(0, 6).map((sib) => ({
      title: sib.slug.replace(/-/g, " "),
      path: `/${sib.slug}/`,
    })),
    siblings,
  });

  const improved =
    page.audit.pass && page.audit.score >= candidate.audit_score - REFRESH_SCORE_TOLERANCE;

  if (!improved) {
    const why = !page.audit.pass
      ? `rewrite scored ${page.audit.score} and missed the gate`
      : `rewrite scored ${page.audit.score} vs ${candidate.audit_score} live`;
    const summary = `${candidate.keyword}: refresh declined after ${candidate.stale_days}d — ${why}; live page kept`;
    await finishRun(runId, "done", summary);
    return {
      siteId: site.id,
      ok: true,
      keyword: candidate.keyword,
      slug: candidate.slug,
      auditScore: candidate.audit_score,
      status: "published",
      published: false,
      skipped: `refresh declined: ${why}`,
      source: page.source,
    };
  }

  // The slug never changes on a refresh. A new URL would abandon whatever
  // ranking and citations the existing one has earned, which is the
  // opposite of the point — so the rewrite is published to the same
  // address, overwriting the GitHub file or the WordPress page by id.
  const res = await publishStoredPage(site, {
    id: candidate.id,
    slug: candidate.slug,
    folder: candidate.folder,
    title: candidate.title,
    html: page.html,
    image: {
      filename: page.image.filename,
      base64: page.image.base64,
      mimeType: page.image.mimeType,
      alt: page.image.alt,
    },
    wpPageId: candidate.wp_page_id,
  });

  if (!res.published) {
    const summary = `${candidate.keyword}: refresh failed to publish — ${res.publishError ?? "unknown"}; live page unchanged`;
    await finishRun(runId, "failed", summary, res.publishError ?? undefined);
    return {
      siteId: site.id,
      ok: false,
      keyword: candidate.keyword,
      slug: candidate.slug,
      status: "published",
      published: false,
      error: res.publishError ?? "refresh publish failed",
    };
  }

  await markPageRefreshed(candidate.id, {
    html: page.html,
    auditScore: page.audit.score,
    auditGrade: page.audit.grade,
    auditReport: page.audit,
    wordCount: page.wordCount,
    liveStatus: res.liveStatus ?? undefined,
  });
  await updateRun(runId, { published: 1 });

  const summary = `${candidate.keyword}: refreshed after ${candidate.stale_days}d, score ${candidate.audit_score} to ${page.audit.score} (${page.audit.grade}), ${res.liveStatus ?? "unverified"}${
    res.discoveryNote ? ` [${res.discoveryNote}]` : ""
  }`;
  await finishRun(runId, "done", summary);

  return {
    siteId: site.id,
    ok: true,
    keyword: candidate.keyword,
    slug: candidate.slug,
    auditScore: page.audit.score,
    status: "published",
    published: true,
    liveStatus: res.liveStatus,
    source: page.source,
    sourceReason: page.sourceReason,
  };
}

/**
 * Refreshes one specific page on demand, bypassing the staleness
 * threshold but not the quality guard.
 *
 * Shares refreshPage() with the scheduled path for the same reason every
 * other on-demand action does: a button that rewrote pages by slightly
 * different rules than the agent would eventually diverge from it, and
 * the owner would be testing something the engine never runs.
 */
export async function refreshPageNow(site: SiteRow, pageId: string): Promise<CycleResult | null> {
  const origin = siteOrigin(site.url);
  await recoverStuckRuns(site.id);

  const candidate = await getPageAsRefreshCandidate(site.id, pageId);
  if (!candidate) return null;

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
    const result = await refreshPage({ site, origin, runId, candidate, brand: site.brand });
    await touchSiteRun(site.id);
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : "refresh failed";
    await finishRun(runId, "failed", "Refresh failed", message);
    await touchSiteRun(site.id);
    return { siteId: site.id, ok: false, error: message };
  }
}
