/**
 * When Ascent tells someone their website is bad.
 *
 * This module decides whether to offer a paid rebuild, which makes every
 * finding a sales argument as well as a measurement. The rules that keep
 * that honest are asserted here rather than trusted:
 *
 *  - a site we could not read is never judged, and never sold to
 *  - every finding corresponds to a signal the ingest genuinely observed
 *  - a good site is told it is good, with nothing to buy
 *
 * The failure this guards against is the profitable one: a scoring
 * function that drifts toward finding fault, because finding fault is
 * what triggers the offer.
 */
import { assessSiteQuality } from "../src/lib/site-quality";
import type { SiteIngest } from "../src/lib/site-ingest";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fails++; };

/** A site with nothing wrong with it. */
const healthy: SiteIngest = {
  ok: true,
  url: "https://acme.example",
  platform: "wordpress",
  title: "Acme Pools — Custom Pool Building in Scottsdale",
  description: "Acme Pools designs and builds custom pools across Scottsdale and Phoenix.",
  h1: "Custom pool building in Scottsdale",
  phone: "(480) 555 0184",
  navLinks: ["Services", "About", "Gallery", "Contact"],
  nav: [
    { label: "Services", href: "/services" },
    { label: "About", href: "/about" },
    { label: "Gallery", href: "/gallery" },
    { label: "Contact", href: "/contact" },
  ],
  footerLinks: [{ label: "Privacy", href: "/privacy" }],
  logo: "https://acme.example/logo.png",
  colors: ["#0a7d55", "#123456"],
  fonts: ["Inter"],
  pageCount: 24,
  rawTextChars: 4200,
  clientRendered: false,
};

/* ---------------------------- the healthy case --------------------------- */
const good = assessSiteQuality(healthy);
check("a good site scores 100", good.score === 100, String(good.score));
check("a good site has no findings", good.findings.length === 0);
check("a good site is NOT offered a rebuild", !good.offerRebuild);
check("a good site is told it is good", /solid base/i.test(good.summary), good.summary);

/* ------------------------- unreadable is not poor ------------------------ */
// The profitable mistake: our own fetch failure becoming their bad site.
for (const [label, value] of [
  ["a failed ingest", { ...healthy, ok: false }],
  ["a null ingest", null],
  ["an undefined ingest", undefined],
] as [string, SiteIngest | null | undefined][]) {
  const r = assessSiteQuality(value);
  check(`${label} yields no score`, r.score === null);
  check(`${label} yields no findings`, r.findings.length === 0);
  check(`${label} is NEVER offered a rebuild`, !r.offerRebuild);
  check(`${label} says so plainly`, /could not be read/i.test(r.summary), r.summary);
}

/* --------------------------- the severe finding -------------------------- */
// A client-rendered site is invisible to AI crawlers, which is the one
// thing publishing more pages cannot fix.
const spa = assessSiteQuality({ ...healthy, clientRendered: true, rawTextChars: 120 });
check("a client-rendered site is flagged", spa.findings.some((f) => f.key === "clientRendered"));
check("...as severe", spa.findings.find((f) => f.key === "clientRendered")?.severe === true);
check("...and is offered a rebuild on that alone",
  spa.offerRebuild, "severe findings must not need a low total score");
check("...with a summary naming the actual problem",
  /JavaScript/i.test(spa.summary), spa.summary);

/* ------------------- one small flaw is not a sales pitch ------------------ */
// The other direction of the same bias: a site that is basically fine
// must not be talked into buying something.
const oneFlaw = assessSiteQuality({ ...healthy, phone: "" });
check("a single small flaw is reported", oneFlaw.findings.length === 1);
check("...but does NOT trigger an offer", !oneFlaw.offerRebuild);
check("...and is described as mostly solid", /mostly solid/i.test(oneFlaw.summary), oneFlaw.summary);

const twoFlaws = assessSiteQuality({ ...healthy, phone: "", description: "" });
check("two small flaws still do not trigger an offer", !twoFlaws.offerRebuild,
  `score ${twoFlaws.score}, findings ${twoFlaws.findings.length}`);

/* ------------------------ genuinely thin sites do ------------------------ */
const plain = assessSiteQuality({
  ...healthy,
  colors: [],
  logo: "",
  nav: [],
  navLinks: [],
  description: "",
  h1: "",
  pageCount: 2,
  phone: "",
});
check("a genuinely bare site is offered a rebuild", plain.offerRebuild);
check("...scoring low", (plain.score ?? 100) < 55, String(plain.score));
check("...with every weakness enumerated", plain.findings.length === 7, String(plain.findings.length));
check("...worst first", plain.findings[0].weight >= plain.findings[plain.findings.length - 1].weight);
check("score never goes negative", (plain.score ?? -1) >= 0, String(plain.score));

/* --------------------- findings track real signals only ------------------ */
// pageCount null means "no sitemap could be read", which is not the same
// fact as "this site is small" and must not be reported as one.
const noSitemap = assessSiteQuality({ ...healthy, pageCount: null });
check("an unreadable sitemap is not reported as a small site",
  !noSitemap.findings.some((f) => f.key === "fewPages"));

// Each flaw, alone, produces exactly its own finding and no others.
const singles: [string, Partial<SiteIngest>, string][] = [
  ["colors", { colors: [] }, "noBrandColors"],
  ["logo", { logo: "" }, "noLogo"],
  ["nav", { nav: [], navLinks: [] }, "thinNavigation"],
  ["description", { description: "" }, "noMetaDescription"],
  ["h1", { h1: "" }, "noHeading"],
  ["pageCount", { pageCount: 2 }, "fewPages"],
  ["phone", { phone: "" }, "noPhone"],
];
for (const [label, patch, key] of singles) {
  const r = assessSiteQuality({ ...healthy, ...patch });
  check(`missing ${label} produces exactly the ${key} finding`,
    r.findings.length === 1 && r.findings[0].key === key,
    r.findings.map((f) => f.key).join(","));
  check(`  ...and explains why it matters`, r.findings[0].consequence.length > 30);
}

/* ------------------ snapshots saved by an older version ------------------ */
// The ingest is cached in customers' browsers. nav, logo and footerLinks
// were all added after the first snapshots were written, so a real user
// can be holding an object without them — and this runs on the onboarding
// step where they are looking at their own site. Reading .length off an
// absent array there would throw in front of them.
const ancient = {
  ok: true,
  url: "https://old.example",
  platform: "wordpress",
  title: "Old",
  description: "A description",
  h1: "A heading",
  phone: "555",
  navLinks: [],
  colors: ["#123456"],
  fonts: [],
  pageCount: 12,
  // nav, footerLinks, logo, rawTextChars, clientRendered all absent
} as unknown as SiteIngest;

let threw = false;
let ancientResult: ReturnType<typeof assessSiteQuality> | null = null;
try {
  ancientResult = assessSiteQuality(ancient);
} catch {
  threw = true;
}
check("an old snapshot missing newer fields does not throw", !threw);
check("...and still scores", typeof ancientResult?.score === "number");
check("...reporting only what an old snapshot can actually evidence",
  (ancientResult?.findings ?? []).every((f) => ["noLogo", "thinNavigation"].includes(f.key)),
  (ancientResult?.findings ?? []).map((f) => f.key).join(","));

process.exit(fails);
