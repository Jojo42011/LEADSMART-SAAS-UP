/**
 * WordPress refresh: update in place, never duplicate.
 *
 * Without wpPageId a refresh would POST to the collection endpoint again.
 * WordPress de-duplicates the slug to "<slug>-2", so the site would grow a
 * near-duplicate on every refresh while the stale original stayed live and
 * canonical — a silent, compounding failure.
 */
import { createServer } from "node:http";
import { publishWordpress } from "../src/lib/engine/publish";

const HTML = `<!doctype html><html><head><style>body{margin:0}</style></head><body>
<header class="bar">h</header><main><p>Body.</p></main><footer>f</footer></body></html>`;

let hits: string[] = [];
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    hits.push(`${req.method} ${req.url}`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: 42, link: "http://127.0.0.1:8732/slug/" }));
  });
});

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fails++; };

async function main() {
  await new Promise<void>((r) => server.listen(8732, "127.0.0.1", r));
  const base = { site: "http://127.0.0.1:8732", user: "u", appPassword: "p", slug: "slug", title: "T", html: HTML };

  hits = [];
  await publishWordpress({ ...base });
  check("first publish posts to the collection", hits.some((h) => h === "POST /wp-json/wp/v2/pages"), hits.join(" | "));

  hits = [];
  await publishWordpress({ ...base, wpPageId: 42 });
  check("refresh updates page 42 in place", hits.some((h) => h === "POST /wp-json/wp/v2/pages/42"), hits.join(" | "));
  check("refresh does NOT hit the collection", !hits.some((h) => h === "POST /wp-json/wp/v2/pages"), hits.join(" | "));

  server.close();
  process.exit(fails);
}
main();
