import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  storeConfigured,
  listSitesForEmail,
  getRebuildForEmail,
  markRebuildPublished,
  getConnection,
} from "@/lib/engine/store";
import { commitFile, repoPagePrefix, verifyLive, publishWordpress } from "@/lib/engine/publish";
import { publishFtpHomepage, type FtpProtocol } from "@/lib/engine/ftp";
import { safeFetch } from "@/lib/safe-fetch";
import { siteOrigin } from "@/lib/url";

/**
 * Publishes a paid rebuild to the live site.
 *
 * The gate order is the feature's whole contract: preview (the owner saw
 * this exact document), then payment (status 'paid', set by the webhook
 * or the demo checkout), and only then this step — which they also
 * trigger themselves. Nothing publishes as a side effect of paying.
 *
 * Never-delete, per platform:
 * - GitHub: the old homepage stays in git history by nature, and the
 *   previous live HTML is captured into the rebuild row as well.
 * - FTP: no history exists, so the previous index.html's bytes are read
 *   before the overwrite and stored in the row (publishFtpHomepage).
 * - WordPress: nothing is replaced at all. The rebuild lands as a DRAFT
 *   page; making it the front page is a one-click choice the owner makes
 *   inside WordPress, where their old page remains until they do.
 */
export async function POST(req: NextRequest) {
  if (!storeConfigured()) {
    return NextResponse.json({ ok: false, error: "engine not connected" }, { status: 503 });
  }
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  const body = (await req.json().catch(() => ({}))) as { siteId?: string };
  const siteId = (body.siteId || "").trim();
  const site = (await listSitesForEmail(auth.user.email)).find((s) => s.id === siteId);
  if (!site) return NextResponse.json({ ok: false, error: "site not found" }, { status: 404 });

  const rebuild = await getRebuildForEmail(siteId, auth.user.email);
  if (!rebuild) return NextResponse.json({ ok: false, error: "no rebuild to publish" }, { status: 404 });
  if (rebuild.status === "published") {
    return NextResponse.json({ ok: true, alreadyPublished: true, liveUrl: rebuild.live_url });
  }
  if (rebuild.status !== "paid") {
    return NextResponse.json(
      { ok: false, error: "The rebuild has not been paid for yet." },
      { status: 402 }
    );
  }

  const origin = siteOrigin(site.url);
  const conn = await getConnection(siteId);

  // The page being replaced, captured before anything is written. Bounded:
  // a homepage over a megabyte is truncated rather than ballooning the row.
  const captureCurrentHome = async (): Promise<string | null> => {
    try {
      const res = await safeFetch(`${origin}/`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      return (await res.text()).slice(0, 1_000_000);
    } catch {
      return null;
    }
  };

  try {
    if (site.platform === "github" && conn?.github_repo && conn.github_token) {
      const previous = await captureCurrentHome();
      const prefix = await repoPagePrefix(conn.github_token, conn.github_repo, conn.github_branch);
      const committed = await commitFile({
        token: conn.github_token,
        repo: conn.github_repo,
        branch: conn.github_branch,
        path: `${prefix}index.html`,
        content: rebuild.html,
        message: "Rebuild homepage (Ascent, owner-approved)",
      });
      if (!committed) {
        return NextResponse.json({ ok: false, error: "GitHub commit failed" }, { status: 502 });
      }
      const liveUrl = `${origin}/`;
      const liveStatus = await verifyLive(liveUrl);
      await markRebuildPublished(siteId, { previousHomeHtml: previous, liveUrl, liveStatus });
      return NextResponse.json({ ok: true, liveUrl, liveStatus });
    }

    if (site.platform === "ftp" && conn?.ftp_host && conn.ftp_user && conn.ftp_password) {
      const res = await publishFtpHomepage({
        credentials: {
          host: conn.ftp_host,
          port: conn.ftp_port ?? 21,
          user: conn.ftp_user,
          password: conn.ftp_password,
          protocol: (conn.ftp_protocol as FtpProtocol) || "ftps",
          root: conn.ftp_root ?? "",
        },
        html: rebuild.html,
      });
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 502 });
      const liveUrl = `${origin}/`;
      const liveStatus = await verifyLive(liveUrl);
      await markRebuildPublished(siteId, {
        previousHomeHtml: res.previousHtml,
        liveUrl,
        liveStatus,
      });
      return NextResponse.json({ ok: true, liveUrl, liveStatus });
    }

    if (site.platform === "wordpress" && conn?.wp_user && conn.wp_app_password) {
      const res = await publishWordpress({
        site: origin,
        user: conn.wp_user,
        appPassword: conn.wp_app_password,
        slug: "new-homepage",
        title: rebuild.title || "New homepage",
        html: rebuild.html,
        status: "draft",
      });
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: [res.error, res.detail].filter(Boolean).join(" — ") },
          { status: 502 }
        );
      }
      // Draft: nothing on the live site changed, so there is no previous
      // homepage to capture and no live URL to verify yet.
      await markRebuildPublished(siteId, { previousHomeHtml: null, liveUrl: null, liveStatus: "wordpress-draft" });
      return NextResponse.json({
        ok: true,
        wordpressDraft: true,
        note: "Saved as a draft page in WordPress. Set it as your homepage under Settings → Reading when you're ready — your current homepage stays until you do.",
      });
    }

    return NextResponse.json(
      { ok: false, error: `No ${site.platform} credentials stored for this site — reconnect publishing first.` },
      { status: 409 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "publish failed";
    return NextResponse.json({ ok: false, error: msg.slice(0, 300) }, { status: 502 });
  }
}
