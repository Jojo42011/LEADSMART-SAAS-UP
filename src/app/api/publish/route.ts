import { NextRequest, NextResponse } from "next/server";
import { publishGithub, publishWordpress } from "@/lib/engine/publish";

/**
 * Manual publish endpoint. The engine core lives in
 * src/lib/engine/publish.ts; this wrapper adds the OAuth cookie token
 * fallback for GitHub so browser sessions can publish without ever
 * seeing the token.
 */

type PublishRequest = {
  platform: "github" | "wordpress";
  slug: string;
  folder: string;
  title: string;
  html: string;
  status?: "publish" | "draft";
  siteUrl?: string;
  github?: { repo: string; token?: string; branch?: string };
  wordpress?: { site: string; user: string; appPassword: string };
};

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

  if (input.platform === "github") {
    const token = input.github?.token || req.cookies.get("gh_token")?.value;
    if (!token || !input.github?.repo) {
      return NextResponse.json({ ok: false, error: "GitHub connection missing" }, { status: 400 });
    }
    const res = await publishGithub({
      token,
      repo: input.github.repo,
      branch: input.github.branch,
      folder: input.folder,
      slug: input.slug,
      title: input.title,
      html: input.html,
      siteUrl: input.siteUrl,
    });
    return NextResponse.json(res, { status: res.ok ? 200 : 502 });
  }

  if (input.platform === "wordpress") {
    if (!input.wordpress?.site || !input.wordpress.user || !input.wordpress.appPassword) {
      return NextResponse.json({ ok: false, error: "WordPress connection missing" }, { status: 400 });
    }
    const res = await publishWordpress({
      site: input.wordpress.site,
      user: input.wordpress.user,
      appPassword: input.wordpress.appPassword,
      slug: input.slug,
      title: input.title,
      html: input.html,
      status: input.status,
    });
    return NextResponse.json(res, { status: res.ok ? 200 : 502 });
  }

  return NextResponse.json({ ok: false, error: "unknown platform" }, { status: 400 });
}
