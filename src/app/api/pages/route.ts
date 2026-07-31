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
  repoPagePrefix,
  publishGithubSupportFiles,
} from "@/lib/engine/publish";
import { pickAccent } from "@/lib/site-ingest";

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
          platform: site.platform,
          cadence: site.cadence,
          publishMode: site.publish_mode,
          lastRunAt: site.last_run_at,
          pages,
          runs: await listRuns(site.id, 5),
        };
      })
    );
    return NextResponse.json({ ok: true, engine: true, sites: detailed });
  } catch (e) {
    return NextResponse.json(
      { ok: false, engine: true, error: e instanceof Error ? e.message : "could not read pages" },
      { status: 500 }
    );
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

    // Best-effort repo cleanup: remove the file and shrink the sitemap.
    // The row is already gone — an orphaned file is preferable to a
    // deleted page still listed all over the product.
    let repoCleaned = false;
    const site = (await listSitesForEmail(auth.user.email)).find((s) => s.id === deleted.siteId);
    const conn = site ? await getConnection(site.id) : null;
    if (site && site.platform === "github" && conn?.github_repo && conn.github_token) {
      const prefix = await repoPagePrefix(conn.github_token, conn.github_repo, conn.github_branch);
      repoCleaned = await deleteGithubFile({
        token: conn.github_token,
        repo: conn.github_repo,
        branch: conn.github_branch,
        path: `${prefix}${deleted.folder}/${deleted.slug}/index.html`,
        message: `Remove ${deleted.keyword}`,
      });
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

    return NextResponse.json({ ok: true, deleted: deleted.keyword, repoCleaned });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "delete failed" },
      { status: 500 }
    );
  }
}
