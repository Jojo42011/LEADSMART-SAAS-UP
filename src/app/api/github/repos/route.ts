import { NextRequest, NextResponse } from "next/server";

/**
 * Lists the connected GitHub account's repositories so the onboarding
 * wizard can offer a picker instead of a free text field. Reads the token
 * from the httpOnly cookie set by the OAuth callback.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get("gh_token")?.value;
  if (!token) {
    return NextResponse.json({ connected: false, repos: [] });
  }

  try {
    const [userRes, repoRes] = await Promise.all([
      fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
        cache: "no-store",
      }),
      fetch("https://api.github.com/user/repos?sort=pushed&per_page=50", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
        cache: "no-store",
      }),
    ]);

    if (!userRes.ok || !repoRes.ok) {
      return NextResponse.json({ connected: false, repos: [] });
    }

    const user = (await userRes.json()) as { login: string };
    const repos = (await repoRes.json()) as { full_name: string; private: boolean; default_branch: string }[];

    return NextResponse.json({
      connected: true,
      login: user.login,
      repos: repos.map((r) => ({
        fullName: r.full_name,
        isPrivate: r.private,
        defaultBranch: r.default_branch,
      })),
    });
  } catch {
    return NextResponse.json({ connected: false, repos: [] });
  }
}
