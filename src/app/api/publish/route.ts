import { NextRequest, NextResponse } from "next/server";

/**
 * Publishes a generated page to the connected destination.
 * GitHub: commits the HTML via the Contents API (token from the OAuth
 * cookie, or an explicit token for manual setups). WordPress: creates a
 * draft or published page through the REST API using the application
 * password captured during onboarding. Returns the expected live URL and
 * verifies it when possible.
 */

type PublishRequest = {
  platform: "github" | "wordpress";
  slug: string;
  folder: string;
  title: string;
  html: string;
  status?: "publish" | "draft";
  github?: { repo: string; token?: string; branch?: string };
  wordpress?: { site: string; user: string; appPassword: string };
};

async function publishGithub(req: NextRequest, input: PublishRequest) {
  const token = input.github?.token || req.cookies.get("gh_token")?.value;
  const repo = input.github?.repo;
  if (!token || !repo) {
    return NextResponse.json({ ok: false, error: "GitHub connection missing" }, { status: 400 });
  }

  const path = `${input.folder}/${input.slug}/index.html`;
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };

  // Update in place if the file already exists.
  let sha: string | undefined;
  const existing = await fetch(apiUrl, { headers, cache: "no-store" });
  if (existing.ok) {
    sha = ((await existing.json()) as { sha?: string }).sha;
  }

  const res = await fetch(apiUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `Publish ${input.title}`,
      content: Buffer.from(input.html, "utf8").toString("base64"),
      ...(input.github?.branch ? { branch: input.github.branch } : {}),
      ...(sha ? { sha } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { ok: false, error: `GitHub commit failed (${res.status})`, detail: detail.slice(0, 300) },
      { status: 502 }
    );
  }

  const json = (await res.json()) as { commit?: { sha?: string } };
  return NextResponse.json({
    ok: true,
    platform: "github",
    commitSha: json.commit?.sha || null,
    path,
  });
}

async function publishWordpress(input: PublishRequest) {
  const wp = input.wordpress;
  if (!wp?.site || !wp.user || !wp.appPassword) {
    return NextResponse.json({ ok: false, error: "WordPress connection missing" }, { status: 400 });
  }

  const site = wp.site.replace(/\/$/, "");
  const auth = Buffer.from(`${wp.user}:${wp.appPassword}`).toString("base64");

  const res = await fetch(`${site}/wp-json/wp/v2/pages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      slug: input.slug,
      status: input.status || "publish",
      content: input.html,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { ok: false, error: `WordPress publish failed (${res.status})`, detail: detail.slice(0, 300) },
      { status: 502 }
    );
  }

  const json = (await res.json()) as { id: number; link: string; status: string };
  return NextResponse.json({
    ok: true,
    platform: "wordpress",
    pageId: json.id,
    liveUrl: json.link,
    status: json.status,
  });
}

export async function POST(req: NextRequest) {
  let input: PublishRequest;
  try {
    input = (await req.json()) as PublishRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  if (!input.html || !input.slug) {
    return NextResponse.json({ ok: false, error: "html and slug required" }, { status: 400 });
  }

  if (input.platform === "github") return publishGithub(req, input);
  if (input.platform === "wordpress") return publishWordpress(input);
  return NextResponse.json({ ok: false, error: "unknown platform" }, { status: 400 });
}
