import { createHash } from "crypto";
import { normalizeGithubRepo } from "../github-repo";
import { siteOrigin } from "../url";
/**
 * Phase 5: publishing to the connected destination, plus post publish
 * live URL verification so a repo path that does not map to a public URL
 * is caught immediately instead of discovered weeks later.
 */

export type PublishResult =
  | { ok: true; platform: "github"; commitSha: string | null; path: string; liveUrl: string | null; liveStatus: string | null }
  | { ok: true; platform: "wordpress"; pageId: number; liveUrl: string; liveStatus: string | null }
  | { ok: false; error: string; detail?: string };

export async function verifyLive(url: string): Promise<string> {
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000) });
    }
    return res.ok ? `live:${res.status}` : `error:${res.status}`;
  } catch {
    return "unreachable";
  }
}

/**
 * Where in the repo a static page must live to be served at /<folder>/<slug>/.
 *
 * A plain HTML site serves files from the repo root, but a framework app
 * (Next.js, Vite, CRA...) only serves static files placed in public/ — a
 * page committed to the root of a Next.js repo builds cleanly, deploys
 * cleanly, and 404s forever. Detection is one API call: framework repos
 * have a package.json at the root, static ones don't.
 */
async function repoPathPrefix(repo: string, branch: string | null | undefined, headers: Record<string, string>): Promise<string> {
  try {
    const url = `https://api.github.com/repos/${repo}/contents/package.json${branch ? `?ref=${branch}` : ""}`;
    const res = await fetch(url, { headers, cache: "no-store" });
    return res.ok ? "public/" : "";
  } catch {
    return "";
  }
}

export async function publishGithub(input: {
  token: string;
  repo: string;
  branch?: string | null;
  folder: string;
  slug: string;
  title: string;
  html: string;
  siteUrl?: string;
  /** Artwork to commit beside the page, referenced by its HTML. */
  image?: { filename: string; base64: string };
}): Promise<PublishResult> {
  // Defensive: stored connections predating input normalization may hold a
  // full URL, and the cron path never passes through the wizard.
  const repo = normalizeGithubRepo(input.repo);
  const headers = {
    Authorization: `Bearer ${input.token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
  const prefix = await repoPathPrefix(repo, input.branch, headers);
  const path = `${prefix}${input.folder}/${input.slug}/index.html`;
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;

  let sha: string | undefined;
  const existing = await fetch(apiUrl, { headers, cache: "no-store" });
  if (existing.ok) sha = ((await existing.json()) as { sha?: string }).sha;

  const res = await fetch(apiUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `Publish ${input.title}`,
      content: Buffer.from(input.html, "utf8").toString("base64"),
      ...(input.branch ? { branch: input.branch } : {}),
      ...(sha ? { sha } : {}),
    }),
  });

  if (!res.ok) {
    return { ok: false, error: `GitHub commit failed (${res.status})`, detail: (await res.text()).slice(0, 300) };
  }

  // The image ships with the page. Committed after the HTML so a failure
  // here leaves a page with a broken img rather than no page at all, and
  // is best effort for the same reason the sitemap is.
  if (input.image) {
    await commitFile({
      token: input.token,
      repo,
      branch: input.branch,
      path: `${prefix}${input.folder}/${input.slug}/${input.image.filename}`,
      contentBase64: input.image.base64,
      message: `Add artwork for ${input.title}`,
    }).catch(() => false);
  }

  const json = (await res.json()) as { commit?: { sha?: string } };
  const liveUrl = input.siteUrl ? `${input.siteUrl.replace(/\/$/, "")}/${input.folder}/${input.slug}/` : null;
  const liveStatus = liveUrl ? await verifyLive(liveUrl) : null;
  return { ok: true, platform: "github", commitSha: json.commit?.sha || null, path, liveUrl, liveStatus };
}

/** Creates or updates one file in the repo; returns false on failure. */
async function commitFile(input: {
  token: string;
  repo: string;
  branch?: string | null;
  path: string;
  content?: string;
  /** Already base64 (binary assets); use instead of content. */
  contentBase64?: string;
  message: string;
}): Promise<boolean> {
  const headers = {
    Authorization: `Bearer ${input.token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
  const apiUrl = `https://api.github.com/repos/${input.repo}/contents/${input.path}`;
  let sha: string | undefined;
  let unchanged = false;
  const existing = await fetch(
    `${apiUrl}${input.branch ? `?ref=${input.branch}` : ""}`,
    { headers, cache: "no-store" }
  );
  if (existing.ok) {
    const j = (await existing.json()) as { sha?: string; content?: string };
    sha = j.sha;
    // Skip the commit when the content is already identical — the key file
    // in particular never changes, and re-committing it on every publish
    // would add an empty commit's worth of API traffic and repo noise.
    if (j.content && input.content !== undefined) {
      const current = Buffer.from(j.content, "base64").toString("utf8");
      unchanged = current === input.content;
    }
  }
  if (unchanged) return true;
  const res = await fetch(apiUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: input.message,
      content: input.contentBase64 ?? Buffer.from(input.content ?? "", "utf8").toString("base64"),
      ...(input.branch ? { branch: input.branch } : {}),
      ...(sha ? { sha } : {}),
    }),
  });
  return res.ok;
}

/**
 * Removes a published page's file from the repo. Best-effort like the
 * other support operations: the database row is the source of truth, and
 * an orphaned file (branch protection, revoked token) is preferable to a
 * page the owner deleted still being listed everywhere in the product.
 */
export async function deleteGithubFile(input: {
  token: string;
  repo: string;
  branch?: string | null;
  path: string;
  message: string;
}): Promise<boolean> {
  const repo = normalizeGithubRepo(input.repo);
  const headers = {
    Authorization: `Bearer ${input.token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${input.path}`;
  try {
    const existing = await fetch(`${apiUrl}${input.branch ? `?ref=${input.branch}` : ""}`, {
      headers,
      cache: "no-store",
    });
    if (!existing.ok) return existing.status === 404; // already gone counts as deleted
    const sha = ((await existing.json()) as { sha?: string }).sha;
    if (!sha) return false;
    const res = await fetch(apiUrl, {
      method: "DELETE",
      headers,
      body: JSON.stringify({
        message: input.message,
        sha,
        ...(input.branch ? { branch: input.branch } : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Whether pages for this repo live under public/ (framework app) or the root. */
export async function repoPagePrefix(token: string, repo: string, branch?: string | null): Promise<string> {
  return repoPathPrefix(normalizeGithubRepo(repo), branch, {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  });
}

export type PublishedPageRef = {
  folder: string;
  slug: string;
  title: string;
  liveUrl: string;
  /** ISO string or Date — pg returns timestamptz columns as Date objects. */
  publishedAt: string | Date | null;
};

/**
 * The site's IndexNow key. Deterministic per site so no schema change or
 * stored secret is needed: the key is not a credential (it only proves the
 * pinger controls the host, via the matching key file the publisher
 * commits), it just has to be stable and unguessable enough not to collide.
 */
export function indexNowKeyFor(siteId: string): string {
  return createHash("sha256").update(`ascent-indexnow:${siteId}`).digest("hex").slice(0, 32);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function lastmod(publishedAt: string | Date | null): string {
  // pg hands timestamptz columns back as Date objects even though the row
  // type says string — calling .slice on one threw inside the best-effort
  // discovery block, which silently skipped every support file on every
  // publish. Normalize through Date and guard invalid values.
  if (!publishedAt) return "";
  const d = publishedAt instanceof Date ? publishedAt : new Date(publishedAt);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function sitemapXml(pages: PublishedPageRef[]): string {
  const rows = pages
    .map((p) => {
      const mod = lastmod(p.publishedAt);
      return `<url><loc>${esc(p.liveUrl)}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ""}</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`;
}

function folderIndexHtml(input: {
  businessName: string;
  siteUrl: string;
  folder: string;
  accent: string;
  nav?: { label: string; href: string }[];
  pages: PublishedPageRef[];
}): string {
  const origin = input.siteUrl.replace(/\/$/, "");
  const label = input.folder.charAt(0).toUpperCase() + input.folder.slice(1);
  const nav = (input.nav || []).slice(0, 8);
  const items = input.pages
    .map((p) => `<li><a href="/${p.folder}/${p.slug}/">${esc(p.title)}</a></li>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(label)} — ${esc(input.businessName)}</title>
<meta name="description" content="${esc(label)} from ${esc(input.businessName)}.">
<link rel="canonical" href="${origin}/${input.folder}/">
<meta name="robots" content="index, follow">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;color:#16181d;line-height:1.7;background:#fff}
.bar{border-bottom:1px solid #e7e8ec}
.bar-in{max-width:1120px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;gap:24px}
.brand{font-weight:700;color:#16181d;text-decoration:none;white-space:nowrap}
.topnav{display:flex;flex-wrap:wrap;gap:2px 4px;margin-left:auto}
.topnav a{color:#16181d;text-decoration:none;font-size:.92rem;font-weight:500;padding:7px 12px;border-radius:8px}
.topnav a:hover{color:${input.accent}}
@media (max-width:760px){.topnav{display:none}}
main{max-width:820px;margin:0 auto;padding:40px 24px 72px}
h1{font-size:2rem;letter-spacing:-.02em;margin-bottom:20px}
ul{list-style:none}
li a{display:block;border:1px solid #e7e8ec;border-radius:10px;padding:14px 18px;margin-top:10px;color:#16181d;text-decoration:none;font-weight:500}
li a:hover{border-color:${input.accent};color:${input.accent}}
</style>
</head>
<body>
<header class="bar"><div class="bar-in"><a class="brand" href="${origin}/">${esc(input.businessName)}</a>${
    nav.length
      ? `<nav class="topnav" aria-label="Primary">${nav
          .map((l) => `<a href="${origin}${esc(l.href)}">${esc(l.label)}</a>`)
          .join("")}</nav>`
      : ""
  }</div></header>
<main><h1>${esc(label)}</h1><ul>
${items}
</ul></main>
</body>
</html>`;
}

/**
 * Support files that make published pages discoverable. Committed after
 * each successful page publish:
 *
 * - a folder index (e.g. /insights/) — every page's breadcrumb links to
 *   its folder, which otherwise does not exist, so each publish shipped a
 *   broken link; the index also gives crawlers one hub that links every
 *   generated page.
 * - sitemap-ascent.xml listing all published pages with lastmod.
 * - the IndexNow key file, which is what makes the ping below verifiable.
 *
 * Failures are reported, not thrown: the page itself is already live, and
 * discovery plumbing must never roll that back.
 */
export async function publishGithubSupportFiles(input: {
  token: string;
  repo: string;
  branch?: string | null;
  siteId: string;
  siteUrl: string;
  businessName: string;
  accent: string;
  /** The site's real primary navigation, mirrored on generated indexes. */
  nav?: { label: string; href: string }[];
  pathPrefix: string;
  pages: PublishedPageRef[];
}): Promise<{ ok: boolean; failed: string[] }> {
  const repo = normalizeGithubRepo(input.repo);
  const failed: string[] = [];
  const commit = async (path: string, content: string, message: string) => {
    const ok = await commitFile({ token: input.token, repo, branch: input.branch, path, content, message }).catch(
      () => false
    );
    if (!ok) failed.push(path);
  };

  await commit(
    `${input.pathPrefix}sitemap-ascent.xml`,
    sitemapXml(input.pages),
    "Update Ascent sitemap"
  );
  await commit(
    `${input.pathPrefix}${indexNowKeyFor(input.siteId)}.txt`,
    indexNowKeyFor(input.siteId),
    "Add IndexNow key"
  );

  const folders = [...new Set(input.pages.map((p) => p.folder))];
  const origin = input.siteUrl.replace(/\/$/, "");
  for (const folder of folders) {
    // Only fill a gap, never fight the site's own pages. If /<folder>/
    // already resolves, the site has a real (better) index — and worse,
    // committing public/<folder>/index.html against an existing app route
    // can fail a Next.js static-export build outright, taking the whole
    // site down with it. The generated index exists solely so the
    // breadcrumb on published pages stops 404ing where no page exists.
    // Skipped when our own index is what's live: it serves under the same
    // URL, so re-checking would strand it stale; re-committing an
    // unchanged one is already a no-op in commitFile.
    const indexPath = `${input.pathPrefix}${folder}/index.html`;
    const ownIndex = await fetch(
      `https://api.github.com/repos/${repo}/contents/${indexPath}${input.branch ? `?ref=${input.branch}` : ""}`,
      {
        headers: { Authorization: `Bearer ${input.token}`, Accept: "application/vnd.github+json" },
        cache: "no-store",
      }
    ).then((r) => r.ok).catch(() => false);
    if (!ownIndex) {
      const already = await verifyLive(`${origin}/${folder}/`);
      if (already.startsWith("live:")) continue;
    }
    await commit(
      indexPath,
      folderIndexHtml({
        businessName: input.businessName,
        siteUrl: input.siteUrl,
        folder,
        accent: input.accent,
        nav: input.nav,
        pages: input.pages.filter((p) => p.folder === folder),
      }),
      `Update ${folder} index`
    );
  }

  return { ok: failed.length === 0, failed };
}

/**
 * Tells Bing/Copilot (and every other IndexNow engine) about new URLs the
 * moment they publish, instead of waiting to be crawled — the cheapest
 * discovery lever there is. Google does not consume IndexNow; it finds
 * pages via the sitemap and folder index above.
 */
export async function pingIndexNow(input: {
  siteUrl: string;
  siteId: string;
  urls: string[];
}): Promise<string> {
  if (input.urls.length === 0) return "no urls";
  try {
    const origin = new URL(input.siteUrl).origin;
    const key = indexNowKeyFor(input.siteId);
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(origin).host,
        key,
        keyLocation: `${origin}/${key}.txt`,
        urlList: input.urls,
      }),
      signal: AbortSignal.timeout(10000),
    });
    // 200 accepted; 202 accepted, key pending validation. Both fine.
    return res.ok || res.status === 202 ? `indexnow:${res.status}` : `indexnow-failed:${res.status}`;
  } catch {
    return "indexnow-unreachable";
  }
}

/**
 * Converts one of our standalone HTML documents into WordPress page
 * content.
 *
 * The generator emits a complete document — doctype, <head> with a
 * <style> block, <body> with our own header and footer. WordPress renders
 * post content INSIDE the active theme's template, so publishing the raw
 * document produced a page with two <html> roots and our site chrome
 * nested inside the customer's theme chrome. What WordPress needs is the
 * article itself: the styles, and the body minus our header/nav/footer —
 * the theme already provides those, and they are the customer's real ones.
 *
 * The result is wrapped in a wp:html block so the block editor treats it
 * as raw HTML instead of trying to parse it into blocks and "fixing" it.
 */
export function wordpressContentOf(fullHtml: string): string {
  const styles = [...fullHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1])
    .join("\n");
  const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let body = bodyMatch ? bodyMatch[1] : fullHtml;

  // Drop our own page furniture: the site header bar, the breadcrumb
  // trail, and the footer. Each is anchored to a class the generator
  // controls, so this doesn't depend on parsing arbitrary HTML.
  body = body
    .replace(/<header class="bar">[\s\S]*?<\/header>/i, "")
    .replace(/<nav class="crumbs"[\s\S]*?<\/nav>/i, "")
    .replace(/<footer[\s\S]*?<\/footer>\s*$/i, "")
    .trim();

  // Scope html/body-level rules to the article wrapper: the originals
  // would restyle the customer's entire theme.
  const scoped = styles
    .replace(/(^|\})\s*html\s*\{/g, "$1 .ascent-page{")
    .replace(/(^|\})\s*body\s*\{/g, "$1 .ascent-page{");

  return `<!-- wp:html -->\n<div class="ascent-page"><style>${scoped}</style>\n${body}</div>\n<!-- /wp:html -->`;
}

/**
 * Proves a WordPress connection actually works before it is stored:
 * authenticates as the user and checks they can create pages. "The URL
 * and password were saved" and "the agent can publish here" are different
 * facts, and onboarding used to record the first while implying the
 * second.
 */
export async function verifyWordpress(input: {
  site: string;
  user: string;
  appPassword: string;
}): Promise<{ ok: boolean; error?: string; name?: string }> {
  const site = siteOrigin(input.site);
  const auth = Buffer.from(`${input.user}:${input.appPassword}`).toString("base64");
  try {
    const res = await fetch(`${site}/wp-json/wp/v2/users/me?context=edit`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error:
          "WordPress rejected the credentials. Application passwords need WordPress 5.6+ and HTTPS; check the username matches the account that created the password.",
      };
    }
    if (!res.ok) {
      return { ok: false, error: `WordPress answered ${res.status} — is the REST API enabled at ${site}/wp-json/?` };
    }
    const me = (await res.json()) as { name?: string; capabilities?: Record<string, boolean> };
    if (me.capabilities && !me.capabilities.publish_pages) {
      return {
        ok: false,
        error: `Signed in as ${me.name ?? input.user}, but this account cannot publish pages — use an Administrator or Editor account.`,
      };
    }
    return { ok: true, name: me.name };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network error";
    return {
      ok: false,
      // The hint is chosen from the failure, not attached to all of
      // them: an earlier version blamed host bot protection for every
      // error, which made a bug in our own URL handling read as the
      // customer's host misbehaving.
      error: `Could not reach ${site}/wp-json/ (${msg}).${
        /parse URL|Invalid URL/i.test(msg)
          ? " That is a malformed site URL rather than a problem with the site."
          : " Check the REST API is reachable there; some free hosts block server-to-server requests with bot protection."
      }`,
    };
  }
}

export async function publishWordpress(input: {
  site: string;
  user: string;
  appPassword: string;
  slug: string;
  title: string;
  html: string;
  status?: "publish" | "draft";
}): Promise<PublishResult> {
  const site = siteOrigin(input.site);
  const auth = Buffer.from(`${input.user}:${input.appPassword}`).toString("base64");

  const res = await fetch(`${site}/wp-json/wp/v2/pages`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      slug: input.slug,
      status: input.status || "publish",
      // Never the raw document: WordPress renders content inside the
      // theme template, so the full standalone page must be reduced to
      // theme-safe article content first.
      content: wordpressContentOf(input.html),
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    return { ok: false, error: `WordPress publish failed (${res.status})`, detail: (await res.text()).slice(0, 300) };
  }

  const json = (await res.json()) as { id: number; link: string };
  const liveStatus = json.link ? await verifyLive(json.link) : null;
  return { ok: true, platform: "wordpress", pageId: json.id, liveUrl: json.link, liveStatus };
}
