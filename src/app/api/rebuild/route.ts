import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  storeConfigured,
  listSitesForEmail,
  saveRebuildPreview,
  getRebuildForEmail,
} from "@/lib/engine/store";
import { buildHomepage } from "@/lib/engine/rebuild";
import { splitList } from "@/lib/engine/research";

/**
 * The homepage rebuild: GET reports where a site's rebuild stands, POST
 * generates (or regenerates) the preview.
 *
 * Generating is free and repeatable — the preview is the sales pitch, and
 * charging to look at it would invert the deal the feature was scoped
 * around (preview before publish). saveRebuildPreview refuses to touch a
 * row that is already paid or published, so regeneration can never
 * replace a document someone has bought.
 */

async function ownedSite(req: NextRequest) {
  const auth = requireSession(req);
  if (auth.response) return { response: auth.response, site: null, email: "" };
  const siteId = req.nextUrl.searchParams.get("siteId") || "";
  const site = (await listSitesForEmail(auth.user.email)).find((s) => s.id === siteId);
  if (!site) {
    return {
      response: NextResponse.json({ ok: false, error: "site not found" }, { status: 404 }),
      site: null,
      email: "",
    };
  }
  return { response: null, site, email: auth.user.email };
}

export async function GET(req: NextRequest) {
  if (!storeConfigured()) {
    return NextResponse.json({ ok: true, engine: false, rebuild: null });
  }
  const { response, site, email } = await ownedSite(req);
  if (response || !site) return response;

  const row = await getRebuildForEmail(site.id, email);
  return NextResponse.json({
    ok: true,
    engine: true,
    rebuild: row
      ? {
          status: row.status,
          title: row.title,
          paidAt: row.paid_at,
          publishedAt: row.published_at,
          liveUrl: row.live_url,
          liveStatus: row.live_status,
        }
      : null,
  });
}

export async function POST(req: NextRequest) {
  if (!storeConfigured()) {
    return NextResponse.json({ ok: false, error: "engine not connected" }, { status: 503 });
  }
  const { response, site, email } = await ownedSite(req);
  if (response || !site) return response;

  const existing = await getRebuildForEmail(site.id, email);
  if (existing && existing.status !== "preview") {
    return NextResponse.json(
      { ok: false, error: "This rebuild is already paid for — regenerating would replace the document you bought." },
      { status: 409 }
    );
  }

  const brand = (site.brand ?? {}) as {
    colors?: string[];
    description?: string;
    logo?: string;
    nav?: { label: string; href: string }[];
  };
  const page = buildHomepage({
    businessName: site.business_name,
    industry: site.industry,
    city: site.city,
    region: site.region,
    serviceArea: site.service_area,
    phone: site.phone,
    address: site.address,
    services: splitList(site.services),
    locations: splitList(site.target_locations),
    siteUrl: site.url,
    description: brand.description,
    logo: brand.logo,
    colors: brand.colors,
    nav: brand.nav,
  });

  const saved = await saveRebuildPreview(site.id, page.html, page.title);
  if (!saved) {
    return NextResponse.json(
      { ok: false, error: "Could not save the preview — it may already be paid for." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true, status: "preview", title: page.title });
}
