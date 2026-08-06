/**
 * The FTP adapter against a real FTP server (ftp-srv on localhost).
 *
 * Two things only this can prove. That a publish round-trips — connect,
 * mkdir, upload page + artwork, and the bytes on disk are the bytes we
 * sent. And the overwrite rule: publishFtpSupportFiles writes into the
 * customer's real web root, where an index.html that already exists and
 * does not carry our sentinel is THEIR page — the one file this adapter
 * must never touch. That rule lives in code reading a remote filesystem,
 * so it is asserted against one.
 */
process.env.INGEST_ALLOW_PRIVATE_HOSTS = "1"; // localhost server; dev-only escape

import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { publishFtp, publishFtpSupportFiles, testFtpConnection, type FtpCredentials } from "../src/lib/engine/ftp";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fails++; };

async function main() {
  let FtpSrv: typeof import("ftp-srv").FtpSrv;
  try {
    ({ FtpSrv } = await import("ftp-srv"));
  } catch {
    console.log("SKIP ftp live test — ftp-srv not installed");
    process.exit(0);
  }

  const rootDir = await fs.mkdtemp(join(tmpdir(), "ascent-ftp-"));
  await fs.mkdir(join(rootDir, "public_html"), { recursive: true });

  const PORT = 21721;
  // A logger that says nothing: the default bunyan instance prints a JSON
  // line per FTP command, which buries the PASS/FAIL output this exists for.
  const quiet: Record<string, unknown> = {};
  for (const m of ["trace", "debug", "info", "warn", "error", "fatal"]) quiet[m] = () => {};
  quiet.child = () => quiet;
  const server = new FtpSrv({
    url: `ftp://127.0.0.1:${PORT}`,
    pasv_url: "127.0.0.1",
    anonymous: false,
    log: quiet as never,
  });
  server.on("login", ({ username, password }, resolve, reject) => {
    if (username === "ascent" && password === "scratch-pw") resolve({ root: rootDir });
    else reject(new Error("bad credentials"));
  });
  await server.listen();

  const credentials: FtpCredentials = {
    host: "127.0.0.1",
    port: PORT,
    user: "ascent",
    password: "scratch-pw",
    protocol: "ftp", // ftp-srv speaks plain FTP; TLS variants share this code path
    root: "public_html",
  };

  /* ---------------------------- connection test --------------------------- */
  const good = await testFtpConnection(credentials);
  check("valid credentials connect", good.ok, good.error ?? "");
  const bad = await testFtpConnection({ ...credentials, password: "wrong" });
  check("a wrong password is reported, not thrown", !bad.ok && Boolean(bad.error));

  /* ------------------------------- publish -------------------------------- */
  const html = "<!doctype html><title>Pool Repair</title><img src=\"/services/pool-repair/hero.png\"><p>page body</p>";
  const res = await publishFtp({
    credentials,
    folder: "services",
    slug: "pool-repair",
    title: "Pool Repair",
    html,
    image: { filename: "hero.png", base64: Buffer.from("png-bytes").toString("base64") },
  });
  check("publish reports ok", res.ok, res.ok ? "" : `${res.error}: ${res.detail}`);

  const uploaded = await fs.readFile(join(rootDir, "public_html/services/pool-repair/index.html"), "utf8").catch(() => null);
  check("the page's bytes round-tripped", uploaded === html);
  const art = await fs.readFile(join(rootDir, "public_html/services/pool-repair/hero.png"), "utf8").catch(() => null);
  check("the artwork landed beside it", art === "png-bytes");

  /* ----------------------------- support files ---------------------------- */
  // The customer's own index at the web root's services folder — no sentinel.
  await fs.writeFile(join(rootDir, "public_html/services/index.html"), "<html>the customer's real page</html>");

  const pages = [{
    folder: "services", slug: "pool-repair", title: "Pool Repair",
    liveUrl: "https://example.com/services/pool-repair/", publishedAt: new Date().toISOString(),
  }];
  const support = await publishFtpSupportFiles({
    credentials,
    siteId: "site-1",
    siteUrl: "https://example.com",
    businessName: "Acme Pools",
    accent: "#0a7",
    pages,
  });
  check("support files publish reports ok", support.ok, support.failed.join(", "));

  const sitemap = await fs.readFile(join(rootDir, "public_html/sitemap-ascent.xml"), "utf8").catch(() => null);
  check("sitemap landed at the web root", Boolean(sitemap?.includes("pool-repair")));
  const keyFiles = (await fs.readdir(join(rootDir, "public_html"))).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  check("IndexNow key file landed", keyFiles.length === 1, keyFiles.join(","));

  const customerIndex = await fs.readFile(join(rootDir, "public_html/services/index.html"), "utf8");
  check("THE CUSTOMER'S OWN index.html WAS NOT TOUCHED",
    customerIndex === "<html>the customer's real page</html>");

  /* -------- our own generated index updates, recognised by sentinel ------- */
  await fs.rm(join(rootDir, "public_html/services/index.html"));
  const second = await publishFtpSupportFiles({
    credentials, siteId: "site-1", siteUrl: "https://example.com",
    businessName: "Acme Pools", accent: "#0a7", pages,
  });
  check("with no index present, ours is created", second.ok);
  const ours = await fs.readFile(join(rootDir, "public_html/services/index.html"), "utf8").catch(() => null);
  check("...and carries the sentinel that marks it ours",
    Boolean(ours?.includes("<!-- ascent-generated -->")));

  const third = await publishFtpSupportFiles({
    credentials, siteId: "site-1", siteUrl: "https://example.com",
    businessName: "Acme Pools", accent: "#0a7",
    pages: [...pages, {
      folder: "services", slug: "pool-cleaning", title: "Pool Cleaning",
      liveUrl: "https://example.com/services/pool-cleaning/", publishedAt: new Date().toISOString(),
    }],
  });
  const updated = await fs.readFile(join(rootDir, "public_html/services/index.html"), "utf8").catch(() => null);
  check("a sentinel-marked index is ours and DOES update",
    third.ok && Boolean(updated?.includes("pool-cleaning")));

  /* ------------------------------ path safety ----------------------------- */
  const escape = await publishFtp({
    credentials: { ...credentials, root: "../outside" },
    folder: "a", slug: "b", title: "x", html: "<p>x</p>",
  });
  check("a root trying to escape the jail is refused before any upload", !escape.ok);

  await server.close();
  await fs.rm(rootDir, { recursive: true, force: true });
  process.exit(fails);
}
main();
