/**
 * The FTP adapter's two safety properties.
 *
 * Both guard against inputs that reach dangerous machinery verbatim. The
 * remote path is built partly from an owner-typed web root and then handed
 * to mkdir/cd on THEIR server — ".." in it writes outside the web root.
 * The host is caller-supplied and the connection originates inside our
 * network — a private address is a port probe against internal services
 * and the cloud metadata endpoint, the same SSRF class safeFetch closes
 * for HTTP.
 */
import { ftpRemoteDir, assertPublicFtpHost } from "../src/lib/engine/ftp";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fails++; };

async function main() {
  /* ------------------------------ path building --------------------------- */
  check("cPanel default", ftpRemoteDir("public_html", "services", "pool-repair") === "public_html/services/pool-repair");
  check("absolute root keeps its leading slash",
    ftpRemoteDir("/var/www/html", "services", "x") === "/var/www/html/services/x");
  check("empty root means the login home",
    ftpRemoteDir("", "services", "x") === "services/x");
  check("trailing slashes and doubled separators collapse",
    ftpRemoteDir("public_html//", "services", "x") === "public_html/services/x");
  check("windows-style separators are normalized",
    ftpRemoteDir("public_html\\www", "a", "b") === "public_html/www/a/b");
  check("single dots vanish", ftpRemoteDir("./public_html", "a", "b") === "public_html/a/b");
  check("root alone works", ftpRemoteDir("public_html") === "public_html");
  check("empty everything yields empty", ftpRemoteDir("") === "");

  const throws = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };
  check("dot-dot in the root is refused", throws(() => ftpRemoteDir("public_html/../../etc", "a", "b")));
  check("dot-dot in a segment is refused", throws(() => ftpRemoteDir("public_html", "..", "b")));
  check("a lone dot-dot is refused", throws(() => ftpRemoteDir("..")));

  /* ------------------------------- host guard ----------------------------- */
  // Literal IPs resolve without touching the network, so these run offline.
  const rejects = async (host: string) => {
    try { await assertPublicFtpHost(host); return false; } catch { return true; }
  };
  check("loopback is refused", await rejects("127.0.0.1"));
  check("RFC1918 10/8 is refused", await rejects("10.0.0.5"));
  check("RFC1918 172.16/12 is refused", await rejects("172.16.0.1"));
  check("RFC1918 192.168/16 is refused", await rejects("192.168.1.1"));
  check("the cloud metadata endpoint is refused", await rejects("169.254.169.254"));
  check("IPv6 loopback is refused", await rejects("::1"));
  check("a public address passes", !(await rejects("93.184.216.34")));
  check("an unresolvable name is refused, not passed through",
    await rejects("definitely-not-a-real-host.invalid"));

  process.exit(fails);
}
main();
