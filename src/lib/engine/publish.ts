import { createHash } from "crypto";
import { normalizeGithubRepo } from "../github-repo";
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
  content: string;
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
    if (j.content) {
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
      content: Buffer.from(input.content, "utf8").toString("base64"),
      ...(input.branch ? { branch: input.branch } : {}),
      ...(sha ? { sha } : {}),
    }),
  });
  return res.ok;
}

export type PublishedPageRef = {
  folder: string;
  slug: string;
  title: string;
  liveUrl: string;
  publishedAt: string | null;
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

function sitemapXml(pages: PublishedPageRef[]): string {
  const rows = pages
    .map(
      (p) =>
        `<url><loc>${esc(p.liveUrl)}</loc>${
          p.publishedAt ? `<lastmod>${p.publishedAt.slice(0, 10)}</lastmod>` : ""
        }</url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`;
}

function folderIndexHtml(input: {
  businessName: string;
  siteUrl: string;
  folder: string;
  accent: string;
  pages: PublishedPageRef[];
}): string {
  const origin = input.siteUrl.replace(/\/$/, "");
  const label = input.folder.charAt(0).toUpperCase() + input.folder.slice(1);
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
.bar a{max-width:1040px;margin:0 auto;padding:14px 24px;display:block;font-weight:700;color:#16181d;text-decoration:none}
main{max-width:820px;margin:0 auto;padding:40px 24px 72px}
h1{font-size:2rem;letter-spacing:-.02em;margin-bottom:20px}
ul{list-style:none}
li a{display:block;border:1px solid #e7e8ec;border-radius:10px;padding:14px 18px;margin-top:10px;color:#16181d;text-decoration:none;font-weight:500}
li a:hover{border-color:${input.accent};color:${input.accent}}
</style>
</head>
<body>
<header class="bar"><a href="${origin}/">${esc(input.businessName)}</a></header>
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
  for (const folder of folders) {
    await commit(
      `${input.pathPrefix}${folder}/index.html`,
      folderIndexHtml({
        businessName: input.businessName,
        siteUrl: input.siteUrl,
        folder,
        accent: input.accent,
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

export async function publishWordpress(input: {
  site: string;
  user: string;
  appPassword: string;
  slug: string;
  title: string;
  html: string;
  status?: "publish" | "draft";
}): Promise<PublishResult> {
  const site = input.site.replace(/\/$/, "");
  const auth = Buffer.from(`${input.user}:${input.appPassword}`).toString("base64");

  const res = await fetch(`${site}/wp-json/wp/v2/pages`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      slug: input.slug,
      status: input.status || "publish",
      content: input.html,
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
