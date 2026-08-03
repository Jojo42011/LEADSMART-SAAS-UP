/**
 * A published page must never reference artwork that is not there.
 *
 * The GitHub publisher committed the HTML first and the image afterwards
 * behind a `.catch(() => false)`. The stated reasoning was that a page
 * with a broken image beats no page — but it also meant a failed artwork
 * commit put a live page on a customer's site showing a broken-image
 * icon, and returned ok: true, so nothing reported it. That is exactly
 * what a customer saw.
 *
 * Two properties, both only observable in the order and content of the
 * requests, which is why this test drives a fake GitHub API rather than
 * asserting on the source:
 *
 *   1. The artwork is committed BEFORE the HTML that references it.
 *   2. If the artwork cannot be committed even after retries, the page
 *      still publishes but the <img> is stripped, and the result says so
 *      instead of reporting a clean success.
 */
import { createServer } from "node:http";
import { publishGithub } from "../src/lib/engine/publish";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => {
  console.log(ok ? "PASS" : "FAIL", n, extra);
  if (!ok) fails++;
};

type Call = { path: string; body: string };

/**
 * A stand-in for api.github.com. `failArtwork` makes every PUT of the
 * image fail, so the retry-exhausted branch can be exercised.
 */
function githubStub(opts: { failArtwork: boolean; port: number }) {
  const calls: Call[] = [];
  const server = createServer((req, res) => {
    const url = req.url || "";
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      // package.json probe decides the repo prefix; 404 = plain static repo.
      if (url.includes("package.json")) {
        res.writeHead(404).end("{}");
        return;
      }
      if (req.method === "PUT") {
        calls.push({ path: url, body });
        if (opts.failArtwork && /\.(png|jpe?g|webp|svg)/.test(url)) {
          res.writeHead(500).end(JSON.stringify({ message: "boom" }));
          return;
        }
        res.writeHead(200).end(JSON.stringify({ commit: { sha: "abc123" } }));
        return;
      }
      // GET for an existing file: not found, so no sha is sent.
      res.writeHead(404).end("{}");
    });
  });
  return { calls, server };
}

async function run(failArtwork: boolean, port: number) {
  const { calls, server } = githubStub({ failArtwork, port });
  await new Promise<void>((r) => server.listen(port, r));
  const originalFetch = globalThis.fetch;
  // Redirect only api.github.com at the stub; everything else is untouched.
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input.toString();
    if (href.startsWith("https://api.github.com")) {
      return originalFetch(href.replace("https://api.github.com", `http://127.0.0.1:${port}`), init);
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof fetch;

  const result = await publishGithub({
    token: "t",
    repo: "owner/repo",
    folder: "insights",
    slug: "pool-installation-mesa",
    title: "Pool Installation in Mesa",
    html: `<html><body><img src="/insights/pool-installation-mesa/hero.png" alt="x"><h1>Hi</h1></body></html>`,
    image: { filename: "hero.png", base64: Buffer.from("fake").toString("base64") },
  });

  globalThis.fetch = originalFetch;
  await new Promise<void>((r) => server.close(() => r()));
  return { calls, result };
}

async function main() {
  // --- Happy path: artwork lands first ---------------------------------
  {
    const { calls, result } = await run(false, 45411);
    const puts = calls.map((c) => c.path);
    const imgIndex = puts.findIndex((p) => p.includes("hero.png"));
    const htmlIndex = puts.findIndex((p) => p.includes("index.html"));
    check("both files are committed", imgIndex >= 0 && htmlIndex >= 0, puts.join(" | "));
    check(
      "artwork is committed BEFORE the page that references it",
      imgIndex >= 0 && htmlIndex >= 0 && imgIndex < htmlIndex,
      `image at ${imgIndex}, html at ${htmlIndex}`
    );
    check("publish succeeds", result.ok === true);
    check(
      "the result reports the artwork",
      result.ok === true && "imageNote" in result && result.imageNote === "artwork committed",
      result.ok ? String((result as { imageNote?: string }).imageNote) : ""
    );
    const htmlCall = calls.find((c) => c.path.includes("index.html"));
    const published = Buffer.from(
      JSON.parse(htmlCall!.body).content as string,
      "base64"
    ).toString("utf8");
    check("the published HTML keeps its <img>", published.includes("hero.png"));
  }

  // --- Artwork cannot be committed --------------------------------------
  {
    const { calls, result } = await run(true, 45412);
    const imageAttempts = calls.filter((c) => c.path.includes("hero.png")).length;
    check("the artwork commit is retried, not abandoned on the first failure", imageAttempts >= 2, `${imageAttempts} attempts`);
    check("the page still publishes", result.ok === true);
    check(
      "the failure is reported rather than swallowed",
      result.ok === true &&
        "imageNote" in result &&
        String((result as { imageNote?: string }).imageNote).includes("failed"),
      result.ok ? String((result as { imageNote?: string }).imageNote) : ""
    );
    const htmlCall = calls.find((c) => c.path.includes("index.html"));
    const published = Buffer.from(
      JSON.parse(htmlCall!.body).content as string,
      "base64"
    ).toString("utf8");
    check("no broken <img> ships — the reference is stripped", !published.includes("hero.png"), published.slice(0, 90));
    check("the rest of the page survives the strip", published.includes("<h1>Hi</h1>"));
  }

  if (fails > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
