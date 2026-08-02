import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  storeConfigured,
  listSitesForEmail,
  listPages,
  listRuns,
  updateLiveStatus,
  deletePageOwned,
  getConnection,
} from "@/lib/engine/store";
import {
  verifyLive,
  deleteGithubFile,
  deleteWordpressPage,
  repoPagePrefix,
  publishGithubSupportFiles,
} from "@/lib/engine/publish";
import { siteOrigin } from "@/lib/url";
import { pickAccent } from "@/lib/site-ingest";
import { entitlementForEmail } from "@/lib/engine/store";

/**
 * What the agent has actually written, for the signed-in owner.
 *
 * The dashboard's content queue was rendered entirely from the local
 * deterministic preview, so a page could sit at "Drafting" forever while
 * nothing was being written — the status was computed from a hash of the
 * keyword, not from the engine. This is the real thing: rows the cycle
 * inserted, with the live URL to open a published page and the audit score
 * it shipped on.
 *
 * Scoped by the session's email through the tenant join, so one account can
 * never read another's pages.
 */
export async function GET(req: NextRequest) {
  // Checked before auth on purpose: with no store there are no pages and no
  // tenants, so the reply carries nobody's data. Requiring a session first
  // made a demo deployment — where the dashboard is reachable precisely
  // because no sign-in exists — report "authentication required" instead of
  // the truthful "the engine isn't connected".
  if (!storeConfigured()) {
    return NextResponse.json({
      ok: true,
      engine: false,
      sites: [],
      note: "No DATABASE_URL set, so the autonomous engine is not running. The dashboard is showing a local preview of the plan.",
    });
  }

  const auth = requireSession(req);
  if (auth.response) return auth.response;

  try {
    const sites = await listSitesForEmail(auth.user.email);
    const detailed = await Promise.all(
      sites.map(async (site) => {
        const pages = await listPages(site.id);
        // Re-verify unreachable verdicts on read. The stored status is
        // written seconds after the publish commit, before the target
        // site has rebuilt, so a healthy page could wear an error:404
        // badge forever and Refresh would truthfully change nothing.
        // Bounded so one dashboard load can't fan out into dozens of
        // external fetches.
        const stale = pages
          .filter((p) => p.status === "published" && p.live_url && !p.live_status?.startsWith("live:"))
          .slice(0, 5);
        await Promise.all(
          stale.map(async (p) => {
            const fresh = await verifyLive(p.live_url as string);
            if (fresh !== p.live_status) {
              await updateLiveStatus(p.id, fresh);
              p.live_status = fresh;
            }
          })
        );
        return {
          siteId: site.id,
          url: site.url,
          // Carried so the site switcher can label each site the way its
          // owner thinks of it. Without it the switcher could only list
          // hostnames, which is how two sites for the same business end up
          // reading as interchangeable strings.
          businessName: site.business_name,
          platform: site.platform,
          cadence: site.cadence,
          publishMode: site.publish_mode,
          /** False when the owner paused autonomous production. */
          active: site.active,
          lastRunAt: site.last_run_at,
          pages,
          runs: await listRuns(site.id, 5),
        };
      })
    );
    // Carried alongside the sites so the dashboard can say WHY the agent
    // is not working — "paused" and "unpaid" look identical otherwise, and
    // one of them the owner can fix in thirty seconds.
    const entitlement = await entitlementForEmail(auth.user.email).catch(() => null);
    return NextResponse.json({ ok: true, engine: true, sites: detailed, entitlement });
  } catch (e) {
    // Degrade to the site list rather than to nothing. A read that fails
    // partway used to return zero sites, which the dashboard cannot tell
    // apart from "this account has no sites" — so a broken pages query
    // also removed the agent stop/resume control and the whole billing
    // context. The sites themselves come from a different, simpler query;
    // if that still works, the owner keeps their controls and sees an
    // honest error about the part that did not load.
    const error = e instanceof Error ? e.message : "could not read pages";
    try {
      const sites = await listSitesForEmail(auth.user.email);
      return NextResponse.json({
        ok: false,
        engine: true,
        error,
        degraded: true,
        sites: sites.map((site) => ({
          siteId: site.id,
          url: site.url,
          // Also on the degraded path: losing the pages query must not
          // strand the owner on whichever site the switcher can no longer
          // name.
          businessName: site.business_name,
          platform: site.platform,
          cadence: site.cadence,
          publishMode: site.publish_mode,
          active: site.active,
          lastRunAt: site.last_run_at,
          pages: [],
          runs: [],
        })),
      });
    } catch {
      return NextResponse.json({ ok: false, engine: true, error }, { status: 500 });
    }
  }
}

/**
 * Deletes a page the agent wrote: the repo file, the sitemap entry, the
 * database row — and returns its keyword to Planned so it can be redone.
 * Ownership is enforced in the delete itself (page → site → tenant →
 * session email), so an id from another account deletes nothing.
 */
export async function DELETE(req: NextRequest) {
  if (!storeConfigured()) {
    return NextResponse.json({ ok: false, error: "engine not connected" }, { status: 503 });
  }
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  try {
    const deleted = await deletePageOwned(id, auth.user.email);
    if (!deleted) {
      return NextResponse.json({ ok: false, error: "page not found" }, { status: 404 });
    }

    // Deleting here has to mean deleting from the live site. A page the
    // owner removed that keeps serving to visitors and search engines is
    // the worst of both worlds: gone from the product they manage it in,
    // still published under their name.
    let repoCleaned = false;
    let liveRemoved: boolean | null = null;
    let liveRemovalError: string | null = null;
    const site = (await listSitesForEmail(auth.user.email)).find((s) => s.id === deleted.siteId);
    const conn = site ? await getConnection(site.id) : null;

    if (site && site.platform === "wordpress" && conn?.wp_user && conn.wp_app_password) {
      if (deleted.wpPageId) {
        const res = await deleteWordpressPage({
          site: siteOrigin(site.url),
          user: conn.wp_user,
          appPassword: conn.wp_app_password,
          pageId: deleted.wpPageId,
        });
        liveRemoved = res.ok;
        liveRemovalError = res.error ?? null;
      } else {
        // Never published there, so there is nothing live to remove —
        // distinct from "we tried and failed", which the caller must be
        // able to tell apart.
        liveRemoved = null;
      }
    }

    if (site && site.platform === "github" && conn?.github_repo && conn.github_token) {
      const prefix = await repoPagePrefix(conn.github_token, conn.github_repo, conn.github_branch);
      const removed = await deleteGithubFile({
        token: conn.github_token,
        repo: conn.github_repo,
        branch: conn.github_branch,
        path: `${prefix}${deleted.folder}/${deleted.slug}/index.html`,
        message: `Remove ${deleted.keyword}`,
      });
      repoCleaned = removed;
      liveRemoved = removed;
      if (!removed) liveRemovalError = "The file could not be removed from the repository.";
      const remaining = (await listPages(site.id))
        .filter((p) => p.status === "published" && p.live_url)
        .map((p) => ({
          folder: p.folder,
          slug: p.slug,
          title: p.title,
          liveUrl: p.live_url as string,
          publishedAt: p.published_at,
        }));
      const brand = site.brand as { colors?: string[]; nav?: { label: string; href: string }[] };
      await publishGithubSupportFiles({
        token: conn.github_token,
        repo: conn.github_repo,
        branch: conn.github_branch,
        siteId: site.id,
        siteUrl: site.url,
        businessName: site.business_name,
        accent: pickAccent(brand?.colors),
        nav: brand?.nav,
        pathPrefix: prefix,
        pages: remaining,
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      deleted: deleted.keyword,
      repoCleaned,
      /** True removed from the live site, false the attempt failed, null it was never live. */
      liveRemoved,
      liveRemovalError,
      liveUrl: deleted.liveUrl,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "delete failed" },
      { status: 500 }
    );
  }
}
