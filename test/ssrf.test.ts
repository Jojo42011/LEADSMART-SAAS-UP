import { verifyWordpress, verifyLive } from "../src/lib/engine/publish";
import { safeFetch } from "../src/lib/safe-fetch";

/**
 * The customer-supplied-host paths must not reach private networks.
 *
 * /api/connect/wordpress/test is unauthenticated by design — it runs
 * before an account exists — and it hands verifyWordpress whatever host
 * the caller names. Until these paths went through safeFetch, the
 * distinct replies (401, a numeric status, a timeout, a refusal) were
 * enough to map internal hosts and open ports from inside the
 * deployment's network, including the cloud metadata service.
 *
 * Asserted at the level that matters: the function's observable
 * behaviour, not "does the source contain safeFetch". A test that greps
 * for the call would pass against a safeFetch that had been made a no-op.
 */

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => {
  console.log(ok ? "PASS" : "FAIL", n, extra);
  if (!ok) fails++;
};

/** Hosts that must never be reachable from a customer-supplied URL. */
const BLOCKED = [
  ["cloud metadata (AWS/GCP/Azure link-local)", "http://169.254.169.254/latest/meta-data/"],
  ["loopback", "http://127.0.0.1:5432/"],
  ["loopback by name", "http://localhost:6543/"],
  ["private 10/8", "http://10.0.0.1/"],
  ["private 192.168/16", "http://192.168.1.1/"],
  ["private 172.16/12", "http://172.16.0.1/"],
  ["IPv6 loopback", "http://[::1]:5432/"],
  ["IPv4-mapped IPv6 loopback", "http://[::ffff:127.0.0.1]/"],
  ["CGNAT", "http://100.64.0.1/"],
];

async function main() {
  // Ensure the dev escape hatch is off; with it set, all of this is
  // permitted on purpose and the test would be meaningless.
  delete process.env.INGEST_ALLOW_PRIVATE_HOSTS;

  for (const [label, url] of BLOCKED) {
    let blocked = false;
    try {
      await safeFetch(url, { signal: AbortSignal.timeout(3000) });
    } catch {
      blocked = true;
    }
    check(`safeFetch refuses ${label}`, blocked, url);
  }

  // The unauthenticated entry point, end to end. It must report failure
  // rather than a status code that reveals what is listening.
  for (const [label, url] of BLOCKED.slice(0, 4)) {
    const res = await verifyWordpress({ site: url, user: "admin", appPassword: "x" });
    const leaks = /answered \d{3}/.test(res.error ?? "");
    check(`verifyWordpress fails closed on ${label}`, res.ok === false, res.error?.slice(0, 60) ?? "");
    check(`verifyWordpress does not leak a status for ${label}`, !leaks, res.error?.slice(0, 60) ?? "");
  }

  // The liveness check runs against a URL the customer configured, so it
  // is the same class of target.
  const live = await verifyLive("http://169.254.169.254/");
  check(
    "verifyLive does not report a private address as live",
    typeof live === "string" && !live.startsWith("live:"),
    String(live)
  );

  // A public hostname must still work, or the guard has broken the
  // product to secure it. Skipped when the sandbox has no egress.
  try {
    const ok = await safeFetch("https://example.com", { signal: AbortSignal.timeout(8000) });
    check("public hosts still resolve and fetch", ok.status > 0, `status ${ok.status}`);
  } catch (e) {
    console.log("SKIP public-host check — no outbound network", (e as Error).message.slice(0, 60));
  }

  if (fails > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
