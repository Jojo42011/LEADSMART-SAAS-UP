import {
  type SiteRow,
  wpPageIdFor,
  getConnection,
  listPages,
  markPagePublished,
  updatePageHtml,
  getSiteOwnerEmail,
} from "./store";
import { notifyPagePublished } from "./notify";
import { type LinkablePage, relatedFor, relatedness, withRelatedLinks } from "./link-graph";
import { pickAccent } from "../site-ingest";
import { siteOrigin } from "../url";
import {
  publishGithub,
  publishGithubSupportFiles,
  pingIndexNow,
  publishWordpress,
} from "./publish";

/**
 * Publishes one stored page to the site's connected platform.
 *
 * Extracted from the cycle so "publish this page" exists exactly once.
 * It gained a second caller the day the schemeless-URL bug stranded three
 * approved pages: each cycle picks a NEW keyword, so a page that failed
 * its publish was never revisited by anything — work that was paid for
 * (research, generation, two audit rounds) sitting one step from live
 * with no path there. Now the owner's Publish button, the cycle, and the
 * backlog sweep all run this same function, so a fix or behaviour change
 * lands in all three at once instead of the button quietly diverging from
 * the engine the way the connection test once did.
 */
export type StoredPagePublishResult = {
  published: boolean;
  liveUrl: string | null;
  liveStatus: string | null;
  publishError: string | null;
  discoveryNote: string | null;
};

export async function publishStoredPage(
  site: SiteRow,
  page: {
    id: string;
    slug: string;
    folder: string;
    title: string;
    html: string;
    /** Fresh generations carry their artwork; a republish of a stored row
     * does not, because the bytes are never persisted. GitHub republishes
     * keep the committed file; WordPress republishes read the media URL
     * already baked into the stored HTML by the original publish. */
    image?: { filename: string; base64: string; mimeType: string; alt: string };
    /** Set when rewriting a page that is already live on WordPress. */
    wpPageId?: number | null;
    /** For the "your page is live" notice. Omitted on a refresh: a rewrite
     * of a page the owner already knows about is not news, and mailing on
     * every refresh would train them to ignore the notices that matter. */
    notify?: { keyword: string; auditScore: number; auditGrade: string; businessName: string };
  }
): Promise<StoredPagePublishResult> {
  const origin = siteOrigin(site.url);
  const conn = await getConnection(site.id);
  let published = false;
  let liveUrl: string | null = null;
  let liveStatus: string | null = null;
  let publishError: string | null = null;
  let discoveryNote: string | null = null;

  if (site.platform === "wordpress" && conn?.wp_user && conn.wp_app_password) {
    const res = await publishWordpress({
      site: origin,
      user: conn.wp_user,
      appPassword: conn.wp_app_password,
      slug: page.slug,
      title: page.title,
      html: page.html,
      image: page.image,
      wpPageId: page.wpPageId,
    });
    if (res.ok && res.platform === "wordpress") {
      // Keep the stored copy identical to what the site serves: the
      // publish rewrote artwork paths into media-library URLs, and a
      // republish from the un-rewritten original would reintroduce the
      // broken references this whole path exists to fix.
      if (res.html !== page.html) await updatePageHtml(page.id, res.html);
      await markPagePublished(page.id, {
        liveUrl: res.liveUrl,
        liveStatus: res.liveStatus ?? undefined,
        wpPageId: res.pageId,
      });
      published = true;
      liveUrl = res.liveUrl;
      liveStatus = res.liveStatus;
      discoveryNote = res.imageNote;
    } else if (!res.ok) {
      publishError = [res.error, res.detail].filter(Boolean).join(" — ");
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
      siteUrl: origin,
      image: page.image,
    });
    if (res.ok && res.platform === "github") {
      await markPagePublished(page.id, {
        liveUrl: res.liveUrl ?? undefined,
        liveStatus: res.liveStatus ?? undefined,
        githubSha: res.commitSha ?? undefined,
      });
      published = true;
      liveUrl = res.liveUrl;
      liveStatus = res.liveStatus;

      // Discovery, after the page itself is safely live: sitemap + folder
      // index (which every page's breadcrumb links to) + IndexNow key
      // file, then the IndexNow ping so Bing/Copilot learn about the URL
      // now instead of at next crawl. Best effort — failures never unwind
      // a successful publish, but they are recorded: a silent catch here
      // once hid a TypeError for four straight publishes.
      try {
        const brand = site.brand as { colors?: string[]; nav?: { label: string; href: string }[] };
        const allPages = await listPages(site.id);
        const publishedRefs = allPages
          .filter((p) => p.status === "published" && p.live_url)
          .map((p) => ({
            folder: p.folder,
            slug: p.slug,
            title: p.title,
            liveUrl: p.live_url as string,
            publishedAt: p.published_at,
          }));
        const support = await publishGithubSupportFiles({
          token: conn.github_token,
          repo: conn.github_repo,
          branch: conn.github_branch,
          siteId: site.id,
          siteUrl: origin,
          businessName: site.business_name,
          accent: pickAccent(brand?.colors),
          nav: brand?.nav,
          // The page's committed path tells us whether this repo is a
          // framework app (public/) or a plain static site.
          pathPrefix: res.path.startsWith("public/") ? "public/" : "",
          pages: publishedRefs,
        });
        discoveryNote = support.ok ? "discovery ok" : `discovery failed for ${support.failed.join(", ")}`;
        if (res.liveUrl) {
          const ping = await pingIndexNow({ siteUrl: origin, siteId: site.id, urls: [res.liveUrl] });
          discoveryNote += `, ${ping}`;
        }
      } catch (e) {
        // discovery plumbing only; the publish already succeeded
        discoveryNote = `discovery error: ${e instanceof Error ? e.message : "unknown"}`;
      }
    } else if (!res.ok) {
      publishError = [res.error, res.detail].filter(Boolean).join(" — ");
    }
  } else {
    publishError = `No ${site.platform} credentials stored for this site — reconnect publishing in onboarding.`;
  }

  // Backfill inbound links on the pages that should point here.
  //
  // Runs after the page is live so a failure here can never cost the
  // publish, and bounded to a few pages so one publish cannot fan out into
  // a rewrite of the whole site. Skipped on a refresh (the page is already
  // in the graph) and when a publish failed.
  if (published && liveUrl && page.notify) {
    await backfillInboundLinks(site, page.id).catch(() => {});
  }

  if (published && liveUrl && page.notify) {
    // Fire and forget: a delivered email is not a condition of a
    // successful publish, and a slow SMTP handshake must not eat into the
    // cycle's 300s budget.
    const owner = await getSiteOwnerEmail(site.id).catch(() => null);
    if (owner) {
      notifyPagePublished({
        email: owner,
        businessName: page.notify.businessName,
        title: page.title,
        keyword: page.notify.keyword,
        liveUrl,
        auditScore: page.notify.auditScore,
        auditGrade: page.notify.auditGrade,
      });
    }
  }

  return { published, liveUrl, liveStatus, publishError, discoveryNote };
}

/**
 * Updates the most related older pages so they link to a newly published
 * one.
 *
 * Bounded to MAX_BACKFILL pages per publish: the value is in the strongest
 * few links, and rewriting every page on every publish would multiply API
 * calls, churn the repo, and — on WordPress — bump every page's modified
 * date, making the whole site look freshly edited to crawlers when only
 * one page actually changed.
 *
 * refreshed_at is deliberately not touched. A related-links block is not a
 * content refresh, and letting it reset the freshness clock would let the
 * agent mark its own homework: pages would look maintained without their
 * substance having been revisited.
 */
const MAX_BACKFILL = 3;

async function backfillInboundLinks(site: SiteRow, newPageId: string): Promise<void> {
  const origin = siteOrigin(site.url);
  const conn = await getConnection(site.id);
  if (!conn) return;

  const all: LinkablePage[] = (await listPages(site.id, true))
    .filter((p) => p.status === "published" && p.live_url)
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      folder: p.folder,
      title: p.title,
      keyword: p.keyword,
      liveUrl: p.live_url,
      html: p.html,
    }));

  const target = all.find((p) => p.id === newPageId);
  if (!target || all.length < 2) return;

  // The pages most related to the new one, excluding itself.
  const neighbours = all
    .filter((p) => p.id !== newPageId && p.html)
    .map((p) => ({ page: p, score: relatedness(target, p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_BACKFILL)
    .map((n) => n.page);

  for (const neighbour of neighbours) {
    const links = relatedFor(neighbour, all, origin);
    const updated = withRelatedLinks(neighbour.html as string, links);
    if (!updated) continue; // already correct — no publish, no commit

    const res = await publishStoredPage(site, {
      id: neighbour.id,
      slug: neighbour.slug,
      folder: neighbour.folder,
      title: neighbour.title,
      html: updated,
      wpPageId: await wpPageIdFor(neighbour.id),
    });
    if (res.published) await updatePageHtml(neighbour.id, updated);
  }
}
