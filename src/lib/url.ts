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
