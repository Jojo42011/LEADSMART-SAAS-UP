import { NextRequest, NextResponse } from "next/server";
import { isValidGithubRepo, normalizeGithubRepo } from "@/lib/github-repo";

/**
 * Lists a repository's branches so onboarding can point the agent at the
 * branch the live site actually deploys from, instead of assuming. Reads
 * the token from the httpOnly cookie set by the OAuth callback; also
 * reports the repository's default branch so the picker can preselect it.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get("gh_token")?.value;
  if (!token) {
    return NextResponse.json({ connected: false, branches: [], defaultBranch: "" });
  }

  const repo = normalizeGithubRepo(req.nextUrl.searchParams.get("repo") || "");
  if (!isValidGithubRepo(repo)) {
    return NextResponse.json(
      { connected: true, branches: [], defaultBranch: "", error: "repo must be owner/repo" },
      { status: 400 }
    );
  }

  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  try {
    const [repoRes, branchRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${repo}`, { headers, cache: "no-store" }),
      fetch(`https://api.github.com/repos/${repo}/branches?per_page=100`, { headers, cache: "no-store" }),
    ]);
    if (!repoRes.ok) {
      return NextResponse.json({ connected: true, branches: [], defaultBranch: "", error: `repo lookup failed (${repoRes.status})` });
    }
    const repoJson = (await repoRes.json()) as { default_branch?: string };
    const defaultBranch = repoJson.default_branch || "main";
    const branches = branchRes.ok
      ? ((await branchRes.json()) as { name: string }[]).map((b) => b.name)
      : [defaultBranch];

    // Default branch first: it is the right answer for nearly every site.
    branches.sort((a, b) => (a === defaultBranch ? -1 : b === defaultBranch ? 1 : a.localeCompare(b)));

    return NextResponse.json({ connected: true, defaultBranch, branches });
  } catch {
    return NextResponse.json({ connected: true, branches: [], defaultBranch: "", error: "github unreachable" });
  }
}
