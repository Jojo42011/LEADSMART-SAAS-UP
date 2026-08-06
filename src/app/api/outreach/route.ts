import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { requireEntitlement } from "@/lib/api-entitlement";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  storeConfigured,
  listSitesForEmail,
  listPages,
  listOutreachTargets,
  saveOutreachTargets,
  setOutreachStatus,
} from "@/lib/engine/store";
import { runOutreachResearch } from "@/lib/engine/outreach";
import { splitList } from "@/lib/engine/research";

/**
 * Editorial-placement outreach: GET lists a site's targets, POST runs the
 * research (grounded search + drafted pitches, existence-verified), PATCH
 * moves a target's status as the owner works the list.
 *
 * The scoping guardrails live here. Research requires at least one
 * published page — a pitch with nothing to show an editor is noise, and
 * the gate is also what makes outreach an earned step in the product's
 * story rather than a spam kit. It also spends model quota, so it sits
 * behind entitlement like every other on-demand action, and behind a
 * rate limit because "run research" wired to a button is otherwise a
 * quota-drain loop.
 */
export async function GET(req: NextRequest) {
  if (!storeConfigured()) return NextResponse.json({ ok: true, engine: false, targets: [] });
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  const siteId = req.nextUrl.searchParams.get("siteId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) {
    return NextResponse.json({ ok: false, error: "invalid site id" }, { status: 400 });
  }
  const rows = await listOutreachTargets(siteId, auth.user.email);
  return NextResponse.json({
    ok: true,
    engine: true,
    targets: rows.map((r) => ({
      id: r.id,
      name: r.name,
      url: r.url,
      kind: r.kind,
      why: r.why,
      pitchSubject: r.pitch_subject,
      pitchBody: r.pitch_body,
      status: r.status,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!storeConfigured()) {
    return NextResponse.json({ ok: false, error: "engine not connected" }, { status: 503 });
  }
  const auth = requireSession(req);
  if (auth.response) return auth.response;
  const limited = await enforceRateLimit(req, { bucket: "outreach", limit: 6, windowSeconds: 3600 });
  if (limited) return limited;
  const blocked = await requireEntitlement(auth.user.email);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as { siteId?: string };
  const siteId = (body.siteId || "").trim();
  const site = (await listSitesForEmail(auth.user.email)).find((s) => s.id === siteId);
  if (!site) return NextResponse.json({ ok: false, error: "site not found" }, { status: 404 });

  // The published-page gate. The best live page doubles as the thing the
  // pitch offers the editor.
  const pages = await listPages(siteId);
  const published = pages
    .filter((p) => p.status === "published" && p.live_url)
    .sort((a, b) => b.audit_score - a.audit_score);
  if (published.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Outreach unlocks once the agent has published at least one page — a pitch needs something to show an editor.",
      },
      { status: 409 }
    );
  }

  const result = await runOutreachResearch({
    businessName: site.business_name,
    industry: site.industry,
    city: site.city,
    region: site.region,
    services: splitList(site.services),
    siteUrl: site.url,
    bestPage: { title: published[0].title, liveUrl: published[0].live_url as string },
  });

  const written = await saveOutreachTargets(siteId, result.targets);
  return NextResponse.json({
    ok: true,
    source: result.source,
    found: result.targets.length,
    written,
    dropped: result.dropped,
  });
}

export async function PATCH(req: NextRequest) {
  if (!storeConfigured()) {
    return NextResponse.json({ ok: false, error: "engine not connected" }, { status: 503 });
  }
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: string };
  const id = (body.id || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id) || !body.status) {
    return NextResponse.json({ ok: false, error: "invalid request" }, { status: 400 });
  }
  const changed = await setOutreachStatus(id, auth.user.email, body.status);
  if (!changed) return NextResponse.json({ ok: false, error: "target not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
