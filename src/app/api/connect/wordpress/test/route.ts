import { NextRequest, NextResponse } from "next/server";
import { verifyWordpress } from "@/lib/engine/publish";

/**
 * Tests WordPress credentials against the live site before onboarding
 * stores them.
 *
 * Credentials arrive in the request body and are used for one
 * authenticated read (wp/v2/users/me) — nothing is stored here and no
 * page is created. Without this, onboarding recorded whatever was typed
 * and the first evidence of a typo was a publish failing days later
 * inside a cron run nobody was watching.
 *
 * Unauthenticated by design, matching the ingest route: it runs before an
 * account necessarily exists, and it can only test credentials the caller
 * already holds.
 */
export async function POST(req: NextRequest) {
  let body: { site?: string; user?: string; appPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const site = (body.site || "").trim();
  const user = (body.user || "").trim();
  const appPassword = (body.appPassword || "").trim();
  if (!site || !user || !appPassword) {
    return NextResponse.json(
      { ok: false, error: "Site URL, username, and application password are all required." },
      { status: 400 }
    );
  }

  const origin = /^https?:\/\//i.test(site) ? site : `https://${site}`;
  const result = await verifyWordpress({ site: origin, user, appPassword });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
