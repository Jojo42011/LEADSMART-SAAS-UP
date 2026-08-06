import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  storeConfigured,
  disconnectService,
  getGscRefreshToken,
  type ConnectedService,
} from "@/lib/engine/store";
import { decryptSecret } from "@/lib/secrets";

/**
 * Disconnect a connected service from a site.
 *
 * The privacy policy tells customers this "revokes our stored token", so
 * for Google it is not enough to forget the token locally — a forgotten
 * token is still a live grant sitting in the customer's Google account,
 * and Google's OAuth reviewers check that revocation claims are honoured.
 * So the refresh token is revoked at Google's endpoint first, and only
 * then dropped from our own storage.
 *
 * Local deletion happens even when the remote revoke fails. Google
 * rejects a token that is already expired or was revoked from the
 * customer's own account settings, and refusing to disconnect because of
 * that would leave a dead credential stored forever — the opposite of
 * what was asked for. The response says which of the two happened rather
 * than reporting a clean success either way.
 */
export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  if (!storeConfigured()) {
    return NextResponse.json(
      { ok: false, error: "No database is connected, so there is nothing stored to disconnect." },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    siteId?: string;
    service?: string;
  };
  const siteId = (body.siteId || "").trim();
  const service = body.service as ConnectedService | undefined;

  if (!siteId || !service || !["wordpress", "github", "gsc", "ftp"].includes(service)) {
    return NextResponse.json(
      { ok: false, error: "A siteId and a service of wordpress, github, gsc or ftp are required." },
      { status: 400 }
    );
  }

  let revokedRemotely: boolean | null = null;

  if (service === "gsc") {
    revokedRemotely = false;
    try {
      const stored = await getGscRefreshToken(auth.user.email, siteId);
      if (stored) {
        const token = decryptSecret(stored);
        if (token) {
          const res = await fetch("https://oauth2.googleapis.com/revoke", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token }).toString(),
            signal: AbortSignal.timeout(10000),
          });
          revokedRemotely = res.ok;
        }
      }
    } catch {
      // Network failure revoking at Google. The local drop still runs;
      // see the note above on why that is the right trade.
      revokedRemotely = false;
    }
  }

  const changed = await disconnectService(auth.user.email, siteId, service);
  if (!changed) {
    return NextResponse.json(
      { ok: false, error: "That site was not found on your account." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    service,
    revokedRemotely,
    note:
      service === "gsc" && revokedRemotely === false
        ? "Removed from Ascent. Google did not confirm the revoke — the grant may already have expired. You can also remove it at myaccount.google.com/permissions."
        : undefined,
  });
}
