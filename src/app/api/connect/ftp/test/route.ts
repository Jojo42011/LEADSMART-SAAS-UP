import { NextRequest, NextResponse } from "next/server";
import { testFtpConnection, type FtpProtocol } from "@/lib/engine/ftp";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Tests FTP/SFTP credentials before onboarding stores them.
 *
 * One connection, one directory check, nothing stored — the cheapest
 * possible moment to find out a password or hostname is wrong is before
 * launch, not inside a cron run days later. Unauthenticated by design,
 * matching the WordPress test: it runs before an account necessarily
 * exists, and it can only test credentials the caller already holds.
 *
 * Two guards carry the risk here. The rate limit, because a credential
 * tester without one is a password-spraying tool aimed at other people's
 * servers. And assertPublicFtpHost inside testFtpConnection, because a
 * connection opened from inside our network to a caller-named host and
 * port is otherwise an internal port probe — the same SSRF class the
 * WordPress path closes with safeFetch.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, { bucket: "ftp-test", limit: 15, windowSeconds: 600 });
  if (limited) return limited;

  let body: {
    host?: string;
    port?: number | string;
    user?: string;
    password?: string;
    protocol?: string;
    root?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const host = (body.host || "").trim();
  const user = (body.user || "").trim();
  const password = (body.password || "").trim();
  if (!host || !user || !password) {
    return NextResponse.json(
      { ok: false, error: "Server, username, and password are all required." },
      { status: 400 }
    );
  }

  const protocol: FtpProtocol = body.protocol === "ftp" || body.protocol === "sftp" ? body.protocol : "ftps";
  const port = Math.floor(Number(body.port));
  const defaultPort = protocol === "sftp" ? 22 : 21;

  const result = await testFtpConnection({
    host,
    port: Number.isFinite(port) && port >= 1 && port <= 65535 ? port : defaultPort,
    user,
    password,
    protocol,
    root: (body.root || "").trim(),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
