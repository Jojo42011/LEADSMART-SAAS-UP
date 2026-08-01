/**
 * WordPress publish: artwork resolution.
 *
 * The generator writes root-relative image paths (/insights/<slug>/hero.png)
 * that only resolve on a GitHub publish, where the file is committed beside
 * the page. WordPress has no such file, so every page published there
 * pointed at artwork that did not exist — undetected because no automated
 * check had ever exercised this path.
 *
 * Run: npm test
 */
import { createServer } from "node:http";
import { publishWordpress } from "../src/lib/engine/publish";

const PAGE_HTML = `<!doctype html><html><head><style>body{margin:0}.hero{min-height:62vh}</style></head><body>
<header class="bar"><a class="brand">Biz</a></header>
<nav class="crumbs"><a href="/">Home</a></nav>
<section class="hero"><img class="bg" src="/insights/my-slug/hero-abc.png" alt="Biz — kw" fetchpriority="high"><h1>T</h1></section>
<main><p>Body.</p><figure><img src="/insights/my-slug/hero-abc.png" alt="Biz — kw" loading="lazy"><figcaption>C</figcaption></figure></main>
<footer>f</footer></body></html>`;

let mediaUploads: { contentType: string; disposition: string; bytes: number }[] = [];
let pageBody: any = null;
let mediaShouldFail = false;

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    if (req.url?.startsWith("/wp-json/wp/v2/media/")) { res.writeHead(200, {"content-type":"application/json"}); return res.end("{}"); }
    if (req.url === "/wp-json/wp/v2/media") {
      if (mediaShouldFail) { res.writeHead(500, {"content-type":"application/json"}); return res.end(JSON.stringify({message:"sorry, you are not allowed to upload"})); }
      mediaUploads.push({ contentType: req.headers["content-type"] as string, disposition: req.headers["content-disposition"] as string, bytes: body.length });
      res.writeHead(201, {"content-type":"application/json"});
      return res.end(JSON.stringify({ id: 77, source_url: "http://127.0.0.1:8731/wp-content/uploads/hero-abc.png" }));
    }
    if (req.url === "/wp-json/wp/v2/pages") {
      pageBody = JSON.parse(body.toString());
      res.writeHead(201, {"content-type":"application/json"});
      return res.end(JSON.stringify({ id: 12, link: "http://127.0.0.1:8731/my-slug/" }));
    }
    res.writeHead(200); res.end("ok");
  });
});

const PNG_B64 = Buffer.from("fakepngbytes").toString("base64");
const SVG_B64 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>').toString("base64");
let fails = 0;
const check = (name: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", name, extra); if (!ok) fails++; };

async function main() {
  await new Promise<void>((r) => server.listen(8731, "127.0.0.1", r));
  const base = { site: "http://127.0.0.1:8731", user: "u", appPassword: "p", slug: "my-slug", title: "T" };

  // --- 1. raster image: uploaded to the media library, src rewritten
  let res: any = await publishWordpress({ ...base, html: PAGE_HTML,
    image: { filename: "hero-abc.png", base64: PNG_B64, mimeType: "image/png", alt: "Biz — kw" } });
  check("raster: publish ok", res.ok === true);
  check("raster: uploaded once", mediaUploads.length === 1, JSON.stringify(mediaUploads));
  check("raster: binary content-type", mediaUploads[0]?.contentType === "image/png");
  check("raster: filename in disposition", /filename="hero-abc\.png"/.test(mediaUploads[0]?.disposition || ""));
  check("raster: real bytes sent", mediaUploads[0]?.bytes === Buffer.from(PNG_B64, "base64").length);
  check("raster: no local path left", !pageBody.content.includes("/insights/my-slug/"));
  check("raster: both imgs rewritten", (pageBody.content.match(/wp-content\/uploads\/hero-abc\.png/g) || []).length === 2);
  check("raster: imageNote", res.imageNote === "media uploaded", res.imageNote);
  check("raster: rewritten html returned for persisting", res.html.includes("wp-content/uploads") && !res.html.includes("/insights/my-slug/"));

  // --- 2. svg fallback: inlined, never uploaded (WP blocks SVG by default)
  mediaUploads = []; pageBody = null;
  res = await publishWordpress({ ...base, html: PAGE_HTML.replace(/hero-abc\.png/g, "mark.svg"),
    image: { filename: "mark.svg", base64: SVG_B64, mimeType: "image/svg+xml", alt: "Biz" } });
  check("svg: no upload attempted", mediaUploads.length === 0);
  check("svg: inlined as data uri", pageBody.content.includes("data:image/svg+xml;base64,"));
  check("svg: no local path left", !pageBody.content.includes("/insights/my-slug/"));
  check("svg: imageNote", res.imageNote === "svg inlined", res.imageNote);

  // --- 3. upload rejected: falls back to inline rather than shipping a broken img
  mediaShouldFail = true; mediaUploads = []; pageBody = null;
  res = await publishWordpress({ ...base, html: PAGE_HTML,
    image: { filename: "hero-abc.png", base64: PNG_B64, mimeType: "image/png", alt: "a" } });
  check("upload-fail: still publishes", res.ok === true);
  check("upload-fail: inlined instead", pageBody.content.includes("data:image/png;base64,"));
  check("upload-fail: no broken local path", !pageBody.content.includes("/insights/my-slug/"));
  check("upload-fail: reason surfaced", /media upload failed/.test(res.imageNote || ""), res.imageNote);

  // --- 4. republish with no image (stored row): orphan refs stripped, not left broken
  mediaShouldFail = false; pageBody = null;
  res = await publishWordpress({ ...base, html: PAGE_HTML });
  check("no-image: publishes", res.ok === true);
  check("no-image: orphan img removed", !pageBody.content.includes("/insights/my-slug/hero-abc.png"));
  check("no-image: page content survives", pageBody.content.includes("Body."));
  check("no-image: note explains", res.imageNote === "orphaned artwork references removed", res.imageNote);

  // --- 5. already-rewritten html (a real republish) keeps its media URL untouched
  pageBody = null;
  const rewritten = PAGE_HTML.replace(/\/insights\/my-slug\/hero-abc\.png/g, "http://127.0.0.1:8731/wp-content/uploads/hero-abc.png");
  res = await publishWordpress({ ...base, html: rewritten });
  check("republish: media url preserved", (pageBody.content.match(/wp-content\/uploads/g) || []).length === 2);

  server.close();
  process.exit(fails);

}
main();
