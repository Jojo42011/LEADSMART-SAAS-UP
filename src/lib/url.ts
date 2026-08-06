/**
 * One definition of "the customer's site origin".
 *
 * Onboarding accepts a URL the way people actually type it —
 * "example.com", "www.example.com/", "https://example.com" — and that
 * bare-host form was stored verbatim and then used as though it were a
 * URL. Node's fetch refuses a schemeless string with "Failed to parse
 * URL", so every WordPress publish threw before it reached the network,
 * and generated pages carried canonical tags with no scheme. Both callers
 * had quietly assumed the other had normalized it.
 *
 * Normalizing at the boundary of every consumer, rather than trusting the
 * stored value, means an old row written before this existed is repaired
 * on read instead of needing a migration nobody would remember to run.
 */
export function siteOrigin(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    // Origin only: a path stored here would end up duplicated inside every
    // canonical and every published page URL.
    return `${u.protocol}//${u.host}`;
  } catch {
    return withScheme.replace(/\/+$/, "");
  }
}

/**
 * The bare hostname: lowercased, port dropped, leading "www." removed.
 *
 * The identity of a website rather than the spelling of a URL.
 * "https://WWW.Example.com/pricing", "example.com" and "http://example.com"
 * are one site to a person, and have to be one site to the free-page
 * allowance too — otherwise the limit is bypassed by retyping the URL a
 * different way, which is the cheapest possible way to defeat it.
 *
 * Returns "" for anything that does not parse to a real host, and callers
 * treat that as "cannot identify this site" rather than as a match — an
 * empty host must never collide with another empty host.
 */
export function siteHost(raw: string): string {
  const origin = siteOrigin(raw);
  if (!origin) return "";
  try {
    return new URL(origin).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
