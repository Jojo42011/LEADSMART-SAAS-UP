/**
 * Normalizes however someone writes a GitHub repository into the
 * "owner/repo" form the API needs.
 *
 * The publish call builds api.github.com/repos/<repo>/contents/..., so a
 * pasted browser URL produced a 404 at publish time. Pasting the URL is the
 * obvious thing to do when the field sits next to a "Sign in with GitHub"
 * button, so accept it rather than treating it as user error.
 *
 * Handles: https://github.com/owner/repo, with or without .git, a trailing
 * slash, deep links like /tree/main/docs, SSH remotes (git@github.com:o/r),
 * and a bare owner/repo, which is returned unchanged.
 */
export function normalizeGithubRepo(input: string): string {
  let s = (input || "").trim();
  if (!s) return "";

  // SSH remote: git@github.com:owner/repo.git
  s = s.replace(/^git@github\.com:/i, "");
  // Any http(s) origin, with or without www
  s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  // A bare host prefix someone typed without a scheme
  s = s.replace(/^(www\.)?github\.com\//i, "");

  s = s.replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");

  // Deep links (/tree/main, /blob/..., /settings) collapse to owner/repo.
  const parts = s.split("/").filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  return s;
}

/** True when the value is a usable owner/repo pair. */
export function isValidGithubRepo(input: string): boolean {
  return /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(normalizeGithubRepo(input));
}
