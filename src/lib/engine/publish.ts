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
  const path = `${input.folder}/${input.slug}/index.html`;
  const apiUrl = `https://api.github.com/repos/${input.repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${input.token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };

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
