import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  storeConfigured,
  listCitationStatuses,
  setCitationStatus,
} from "@/lib/engine/store";
import { directoriesFor, CITATION_STATUSES } from "@/lib/citations";

/**
 * Directory-listing progress for the citations checklist.
 *
 * The catalog itself ships with the client (it is public information);
 * this endpoint only carries the owner's per-directory status. Ownership
 * lives inside the store helpers via the tenant join, so a foreign
 * siteId reads empty and writes nothing.
 */
export async function GET(req: NextRequest) {
  if (!storeConfigured()) return NextResponse.json({ ok: true, engine: false, statuses: {} });
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  const siteId = req.nextUrl.searchParams.get("siteId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) {
    return NextResponse.json({ ok: false, error: "invalid site id" }, { status: 400 });
  }
  const statuses = await listCitationStatuses(siteId, auth.user.email);
  return NextResponse.json({ ok: true, engine: true, statuses });
}

export async function POST(req: NextRequest) {
  if (!storeConfigured()) {
    return NextResponse.json({ ok: false, error: "engine not connected" }, { status: 503 });
  }
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  const body = (await req.json().catch(() => ({}))) as {
    siteId?: string;
    directory?: string;
    status?: string;
    industry?: string;
    services?: string;
  };
  const siteId = (body.siteId || "").trim();
  const directory = (body.directory || "").trim();
  const status = CITATION_STATUSES.find((s) => s.value === body.status)?.value;

  // The directory must be one the catalog actually offers this business —
  // the status table is not a free-form key-value store.
  const known = directoriesFor(body.industry || "", body.services || "").some(
    (d) => d.key === directory
  );
  if (!/^[0-9a-f-]{36}$/i.test(siteId) || !known || !status) {
    return NextResponse.json({ ok: false, error: "invalid request" }, { status: 400 });
  }

  const changed = await setCitationStatus(siteId, auth.user.email, directory, status);
  if (!changed) {
    return NextResponse.json({ ok: false, error: "site not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
