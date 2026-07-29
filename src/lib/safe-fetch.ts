import { lookup } from "dns/promises";

/**
 * Outbound fetch for URLs the caller controls.
 *
 * /api/ingest reads a website the visitor names and returns what it found
 * (title, description, headings, nav text). Without a guard that is a
 * server-side request forgery primitive: the server sits inside the
 * deployment's network, so a request for http://169.254.169.254/ or
 * http://10.0.0.5/ would be made from a trusted position and the response
 * handed back to whoever asked. Cloud metadata endpoints on link-local
 * addresses are the usual target.
 *
 * The guard resolves the hostname and refuses any address in a private or
 * reserved range, then follows redirects manually so every hop is checked
 * — a public URL that 302s to an internal one is the obvious bypass.
 */

/** Dev-only escape hatch. Never set this in production. */
function privateHostsAllowed(): boolean {
  return process.env.INGEST_ALLOW_PRIVATE_HOSTS === "1";
}

const MAX_REDIRECTS = 3;

function ipv4IsPrivate(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true; // this network
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 168) return true; // private
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]; // strip zone id
  if (addr === "::1" || addr === "::") return true;
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible forms
  const mapped = addr.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsPrivate(mapped[1]);
  const head = parseInt(addr.split(":")[0] || "0", 16);
  if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  return false;
}

export function isPrivateAddress(ip: string, family: number): boolean {
  return family === 6 ? ipv6IsPrivate(ip) : ipv4IsPrivate(ip);
}

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

/**
 * Rejects anything that is not plain http(s) to a publicly routable host.
 * Every address the hostname resolves to must be public: a name with one
 * public and one private answer is treated as hostile.
 */
export async function assertPublicUrl(raw: string | URL): Promise<URL> {
  let url: URL;
  try {
    url = raw instanceof URL ? raw : new URL(raw);
  } catch {
    throw new BlockedUrlError("invalid url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError("only http and https are supported");
  }
  if (privateHostsAllowed()) return url;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  // A literal IP skips DNS entirely.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (ipv4IsPrivate(host)) throw new BlockedUrlError("address is not publicly routable");
    return url;
  }
  if (host.includes(":")) {
    if (ipv6IsPrivate(host)) throw new BlockedUrlError("address is not publicly routable");
    return url;
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError("host could not be resolved");
  }
  if (addresses.length === 0) throw new BlockedUrlError("host could not be resolved");
  for (const { address, family } of addresses) {
    if (isPrivateAddress(address, family)) {
      throw new BlockedUrlError("address is not publicly routable");
    }
  }
  return url;
}

/**
 * fetch() that validates the target and every redirect hop. Callers get a
 * normal Response, or a BlockedUrlError if the chain ever points inward.
 */
export async function safeFetch(raw: string | URL, init: RequestInit = {}): Promise<Response> {
  let target = await assertPublicUrl(raw);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(target, { ...init, redirect: "manual" });
    if (res.status < 300 || res.status > 399) return res;

    const location = res.headers.get("location");
    if (!location) return res;
    // Re-validate: a public URL redirecting to an internal one is the
    // standard way around a first-request-only check.
    target = await assertPublicUrl(new URL(location, target));
  }
  throw new BlockedUrlError("too many redirects");
}
