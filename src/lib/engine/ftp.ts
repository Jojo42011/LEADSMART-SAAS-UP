import { promises as dns } from "dns";
import { Readable, Writable } from "stream";
import { isPrivateAddress, BlockedUrlError } from "../safe-fetch";
import {
  verifyLive,
  indexNowKeyFor,
  sitemapXml,
  folderIndexHtml,
  type PublishedPageRef,
  type PublishResult,
} from "./publish";

/**
 * Publishing over FTP / FTPS / SFTP — the universal fallback for hosting
 * that is neither WordPress nor a GitHub-deployed repo (GoDaddy,
 * HostGator, generic cPanel, plain VPS hosting).
 *
 * This is deliberately the same job a human SEO contractor does with
 * FileZilla: connect with the owner's credentials, create the folder,
 * upload the page, check it serves. No host-specific API, which is
 * exactly why it works on hosts that have none.
 *
 * Two honesty notes about transport security, because the choices here
 * are trade-offs and should not look like oversights:
 *
 * - FTPS certificates on shared hosting are routinely issued for the
 *   host's machine name (server123.hostgator.com), not the customer's
 *   domain, so strict verification would refuse most real cPanel hosts.
 *   We encrypt the channel but do not authenticate the peer — the same
 *   posture as clicking "accept" on FileZilla's certificate prompt.
 * - SFTP host keys are trusted on first use; there is no known_hosts to
 *   check against. Same posture as every deploy tool in this class.
 *
 * Plain FTP is supported because some budget hosts still offer nothing
 * else, but the wizard defaults to FTPS and describes plain FTP as the
 * last resort it is.
 */

export type FtpProtocol = "ftps" | "ftp" | "sftp";

export type FtpCredentials = {
  host: string;
  port: number;
  user: string;
  password: string;
  protocol: FtpProtocol;
  /**
   * Remote directory that serves the site root — "public_html" on most
   * cPanel hosts, sometimes "www" or an absolute path. Empty means the
   * login already lands in the web root.
   */
  root: string;
};

/**
 * Refuses hosts that resolve into private or link-local address space.
 *
 * The FTP host is customer-supplied and these connections originate
 * inside our deployment's network, so this is the same SSRF surface
 * safeFetch closes for HTTP: without it, "connect to my FTP server" is a
 * port probe against internal services and the cloud metadata endpoint.
 * One private answer among many is treated as hostile, matching
 * assertPublicUrl's stance on split-horizon DNS.
 */
export async function assertPublicFtpHost(host: string): Promise<void> {
  // The same dev-only escape hatch safeFetch honours, so a local test rig
  // needs exactly one switch. Never set in production.
  if (process.env.INGEST_ALLOW_PRIVATE_HOSTS === "1") return;
  let addrs: { address: string; family: number }[];
  try {
    addrs = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new BlockedUrlError(`Could not resolve "${host}" — check the server address.`);
  }
  if (addrs.length === 0) {
    throw new BlockedUrlError(`Could not resolve "${host}" — check the server address.`);
  }
  for (const a of addrs) {
    if (isPrivateAddress(a.address, a.family)) {
      throw new BlockedUrlError(`"${host}" resolves to a private address and cannot be used.`);
    }
  }
}

/**
 * Joins the owner's web-root setting with our folder/slug into one remote
 * directory, refusing anything that could step outside it.
 *
 * folder and slug come from our own slugifier, but root is typed by the
 * owner, and this string goes straight into mkdir/cd on their server —
 * ".." here would let a typo (or a hostile value in a shared browser's
 * localStorage) write files outside the web root. Exported for tests.
 */
export function ftpRemoteDir(root: string, ...segments: string[]): string {
  const cleanRoot = (root || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  const parts = [cleanRoot, ...segments]
    .join("/")
    .split("/")
    .filter((p) => p !== "" && p !== ".");
  if (parts.some((p) => p === "..")) {
    throw new Error(`Remote path may not contain ".." (got "${[root, ...segments].join("/")}")`);
  }
  const absolute = cleanRoot.startsWith("/");
  return (absolute ? "/" : "") + parts.join("/");
}

/**
 * The minimal remote-filesystem surface publishing needs, so the FTP and
 * SFTP clients are interchangeable and the publish logic exists once.
 */
type RemoteWriter = {
  ensureDir(dir: string): Promise<void>;
  write(dir: string, filename: string, content: Buffer): Promise<void>;
  /** Null when the file does not exist; other failures also read as null —
   * callers use this only for "is this file one of ours" checks, where a
   * transient read failure must fail safe (treat as not ours, skip). */
  read(dir: string, filename: string): Promise<string | null>;
  close(): Promise<void>;
};

const CONNECT_TIMEOUT_MS = 15_000;

async function ftpWriter(c: FtpCredentials): Promise<RemoteWriter> {
  const { Client } = await import("basic-ftp");
  const client = new Client(CONNECT_TIMEOUT_MS);
  await client.access({
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
    // Port 990 is implicit FTPS by convention — TLS from the first byte
    // rather than upgraded via AUTH TLS.
    secure: c.protocol === "ftp" ? false : c.port === 990 ? "implicit" : true,
    secureOptions: { rejectUnauthorized: false },
  });
  // ensureDir both creates a path and CHANGES INTO it, and a relative
  // path resolves from wherever the previous call left the connection —
  // so two writes with the same relative dir nested the second inside the
  // first ("public_html/services/x/public_html/services/x"), while the
  // publish still reported ok. Every path is therefore anchored to the
  // login home captured here, making each operation independent of
  // whatever the one before it did to the cwd.
  const home = (await client.pwd()).replace(/\/+$/, "");
  const abs = (dir: string) => (dir.startsWith("/") ? dir : `${home}/${dir}`.replace(/\/+/g, "/"));
  return {
    async ensureDir(dir) {
      await client.ensureDir(abs(dir));
    },
    async write(dir, filename, content) {
      // ensureDir leaves the cwd inside the (absolute) target, so the
      // upload target is just the bare filename.
      await client.ensureDir(abs(dir));
      await client.uploadFrom(Readable.from(content), filename);
    },
    async read(dir, filename) {
      const chunks: Buffer[] = [];
      const sink = new Writable({
        write(chunk, _enc, cb) {
          chunks.push(Buffer.from(chunk));
          cb();
        },
      });
      try {
        await client.cd(abs(dir));
        await client.downloadTo(sink, filename);
        return Buffer.concat(chunks).toString("utf8");
      } catch {
        return null;
      }
    },
    async close() {
      client.close();
    },
  };
}

async function sftpWriter(c: FtpCredentials): Promise<RemoteWriter> {
  const { default: SftpClient } = await import("ssh2-sftp-client");
  const sftp = new SftpClient();
  await sftp.connect({
    host: c.host,
    port: c.port,
    username: c.user,
    password: c.password,
    readyTimeout: CONNECT_TIMEOUT_MS,
  });
  return {
    async ensureDir(dir) {
      if (!(await sftp.exists(dir))) await sftp.mkdir(dir, true);
    },
    async write(dir, filename, content) {
      if (!(await sftp.exists(dir))) await sftp.mkdir(dir, true);
      await sftp.put(content, `${dir}/${filename}`);
    },
    async read(dir, filename) {
      try {
        const path = `${dir}/${filename}`;
        if (!(await sftp.exists(path))) return null;
        const buf = await sftp.get(path);
        return buf.toString("utf8");
      } catch {
        return null;
      }
    },
    async close() {
      await sftp.end();
    },
  };
}

async function openWriter(c: FtpCredentials): Promise<RemoteWriter> {
  await assertPublicFtpHost(c.host);
  return c.protocol === "sftp" ? sftpWriter(c) : ftpWriter(c);
}

/**
 * Connects, confirms the web root exists, and reports what went wrong in
 * the owner's terms when it does not. Powers the wizard's "Test
 * connection" button — the cheapest possible moment to find out a
 * password is wrong is before launch, not on the first cycle.
 */
export async function testFtpConnection(
  c: FtpCredentials
): Promise<{ ok: boolean; error?: string }> {
  let writer: RemoteWriter | null = null;
  try {
    const dir = ftpRemoteDir(c.root);
    writer = await openWriter(c);
    // ensureDir rather than a listing: proves we can both reach the root
    // and create directories under the account, which is what publishing
    // actually requires.
    await writer.ensureDir(dir === "" ? "." : dir);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "connection failed";
    return { ok: false, error: msg.slice(0, 300) };
  } finally {
    await writer?.close().catch(() => {});
  }
}

/**
 * Publishes one page over FTP/SFTP: artwork first, then the HTML that
 * references it — the same honest ordering as the GitHub path, so a page
 * never goes live pointing at bytes that failed to arrive.
 */
export async function publishFtp(input: {
  credentials: FtpCredentials;
  folder: string;
  slug: string;
  title: string;
  html: string;
  siteUrl?: string;
  image?: { filename: string; base64: string };
}): Promise<PublishResult> {
  let writer: RemoteWriter | null = null;
  try {
    const dir = ftpRemoteDir(input.credentials.root, input.folder, input.slug);
    writer = await openWriter(input.credentials);

    let html = input.html;
    let imageNote: string | null = null;
    if (input.image) {
      try {
        await writer.write(dir, input.image.filename, Buffer.from(input.image.base64, "base64"));
        imageNote = "artwork uploaded";
      } catch {
        // Same treatment as a failed GitHub artwork commit: publish the
        // page anyway, strip the reference so the reader gets the hero's
        // brand-coloured ground rather than a broken-image icon, and say
        // so in the result instead of reporting a clean success.
        const orphan = new RegExp(
          `<img\\b[^>]*src="[^"]*${input.image.filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`,
          "gi"
        );
        html = html.replace(orphan, "");
        imageNote = "artwork upload failed; image reference removed";
      }
    }

    await writer.write(dir, "index.html", Buffer.from(html, "utf8"));

    const liveUrl = input.siteUrl
      ? `${input.siteUrl.replace(/\/$/, "")}/${input.folder}/${input.slug}/`
      : null;
    const liveStatus = liveUrl ? await verifyLive(liveUrl) : null;
    return {
      ok: true,
      platform: "ftp",
      path: `${dir}/index.html`,
      liveUrl,
      liveStatus,
      imageNote,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upload failed";
    return { ok: false, error: "FTP publish failed", detail: msg.slice(0, 300) };
  } finally {
    await writer?.close().catch(() => {});
  }
}

/**
 * Marks every file this module generates, so a later run can tell its own
 * work from the customer's. An index.html that already exists on the
 * server and does NOT carry this marker is the customer's real page, and
 * overwriting it would be destroying their site one file at a time —
 * the one mistake this adapter must never make.
 */
const GENERATED_MARK = "<!-- ascent-generated -->";

/**
 * Support files over FTP: sitemap, IndexNow key, and a folder index per
 * folder — the same discovery set the GitHub path commits, built by the
 * same builders so the two platforms cannot drift in content.
 *
 * The folder-index overwrite rule differs from GitHub's by necessity. On
 * GitHub, "does the repo contain our index file" answers whether the file
 * is ours. On a raw filesystem there is no such provenance, so ours are
 * recognised by the GENERATED_MARK sentinel: no file → create; file with
 * the mark → ours, update; file without it → the customer's, never touch.
 */
export async function publishFtpSupportFiles(input: {
  credentials: FtpCredentials;
  siteId: string;
  siteUrl: string;
  businessName: string;
  accent: string;
  nav?: { label: string; href: string }[];
  pages: PublishedPageRef[];
}): Promise<{ ok: boolean; failed: string[] }> {
  const failed: string[] = [];
  let writer: RemoteWriter | null = null;
  try {
    writer = await openWriter(input.credentials);
    const rootDir = ftpRemoteDir(input.credentials.root) || ".";

    const put = async (dir: string, filename: string, content: string) => {
      try {
        await writer!.write(dir, filename, Buffer.from(content, "utf8"));
      } catch {
        failed.push(`${dir}/${filename}`);
      }
    };

    await put(rootDir, "sitemap-ascent.xml", sitemapXml(input.pages));
    const key = indexNowKeyFor(input.siteId);
    await put(rootDir, `${key}.txt`, key);

    const folders = [...new Set(input.pages.map((p) => p.folder))];
    for (const folder of folders) {
      const dir = ftpRemoteDir(input.credentials.root, folder);
      const existing = await writer.read(dir, "index.html");
      if (existing !== null && !existing.includes(GENERATED_MARK)) continue;
      await put(
        dir,
        "index.html",
        folderIndexHtml({
          businessName: input.businessName,
          siteUrl: input.siteUrl,
          folder,
          accent: input.accent,
          nav: input.nav,
          pages: input.pages.filter((p) => p.folder === folder),
        }).replace("<!doctype html>", `<!doctype html>\n${GENERATED_MARK}`)
      );
    }

    return { ok: failed.length === 0, failed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "connection failed";
    return { ok: false, failed: [msg.slice(0, 120)] };
  } finally {
    await writer?.close().catch(() => {});
  }
}

/**
 * Replaces the homepage over FTP/SFTP, returning what was there before.
 *
 * The one deliberately destructive write in this module, and it is only
 * reachable from the rebuild's publish step — behind a preview the owner
 * saw and a payment they chose to make. The previous bytes are read
 * FIRST and handed back to the caller to store, so "never delete" holds
 * in the only form an overwrite allows: the old page is always
 * recoverable, even though the file on disk is replaced.
 */
export async function publishFtpHomepage(input: {
  credentials: FtpCredentials;
  html: string;
}): Promise<{ ok: true; previousHtml: string | null } | { ok: false; error: string }> {
  let writer: RemoteWriter | null = null;
  try {
    const dir = ftpRemoteDir(input.credentials.root) || ".";
    writer = await openWriter(input.credentials);
    const previousHtml = await writer.read(dir, "index.html");
    await writer.write(dir, "index.html", Buffer.from(input.html, "utf8"));
    return { ok: true, previousHtml };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upload failed";
    return { ok: false, error: msg.slice(0, 300) };
  } finally {
    await writer?.close().catch(() => {});
  }
}
