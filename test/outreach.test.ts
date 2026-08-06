/**
 * The outreach engine's pure parts: the fallback targets and the pitch.
 *
 * Two rules under test, both from the scoping decision. Targets must
 * never be invented — the no-model fallback may only offer SEARCHES
 * (queries are honest; invented outlet names are not). And the pitch
 * carries only given facts, because it goes out under the owner's own
 * name — a fabricated credential in it would be the product putting
 * words in a real person's mouth.
 */
import { draftPitch, fallbackTargets, type OutreachInput } from "../src/lib/engine/outreach";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fails++; };

const input: OutreachInput = {
  businessName: "Acme Pools",
  industry: "custom pool construction",
  city: "Scottsdale",
  region: "AZ",
  services: ["pool building", "pool remodeling"],
  siteUrl: "https://acmepools.example",
  bestPage: {
    title: "Pool Remodeling in Scottsdale",
    liveUrl: "https://acmepools.example/services/pool-remodeling-scottsdale/",
  },
};

/* ---------------------------- fallback targets --------------------------- */
const fb = fallbackTargets(input);
check("fallback offers searches, never invented outlets",
  fb.every((t) => t.url.startsWith("https://www.google.com/search?q=")),
  fb.map((t) => t.url).join(" "));
check("fallback is marked as searches", fb.every((t) => t.kind === "search"));
check("the roundup search leads", /best/i.test(fb[0].name) && /pool building/i.test(fb[0].name));
check("the search queries carry the real place",
  fb.some((t) => decodeURIComponent(t.url).includes("Scottsdale")));
check("every fallback row explains why", fb.every((t) => t.why.length > 40));
check("every fallback row ships with a ready pitch",
  fb.every((t) => t.pitchSubject.length > 0 && t.pitchBody.length > 0));

/* -------------------------------- the pitch ------------------------------- */
const roundup = draftPitch(input, { name: "Best pools list", kind: "roundup" });
check("roundup pitch asks for inclusion, by the business's real name",
  /considered for inclusion/i.test(roundup.body) && roundup.body.includes("Acme Pools"));
check("the pitch offers the real published page",
  roundup.body.includes("https://acmepools.example/services/pool-remodeling-scottsdale/") &&
  roundup.body.includes("Pool Remodeling in Scottsdale"));
check("the pitch names the real city", roundup.body.includes("Scottsdale"));
check("the pitch signs with the business and site",
  roundup.body.trimEnd().endsWith("https://acmepools.example"));
check("subject is inbox-sized", roundup.subject.length <= 90, roundup.subject);

const press = draftPitch(input, { name: "Scottsdale Gazette", kind: "press" });
check("press pitch offers a source, not an inclusion",
  /happy to be a source/i.test(press.body));

// Only given facts. The words a pitch template is most tempted to invent.
const forbidden = [/licensed/i, /insured/i, /award/i, /\byears of experience\b/i, /5-star/i, /\breviews?\b/i, /top.rated/i, /#1\b/];
check("no fabricated credentials in any pitch",
  [roundup, press].every((p) => forbidden.every((re) => !re.test(p.body) && !re.test(p.subject))),
  forbidden.filter((re) => re.test(roundup.body) || re.test(press.body)).map(String).join(","));

/* --------------------------- absent facts omitted ------------------------- */
const noPage = draftPitch({ ...input, bestPage: null }, { name: "x", kind: "roundup" });
check("no published page, no page line", !noPage.body.includes("recent page"));

const noCity = draftPitch({ ...input, city: "", bestPage: null }, { name: "x", kind: "press" });
check("no city, no invented location", !noCity.body.includes(" in .") && !/ in\s*$/m.test(noCity.body));

const noOwner = draftPitch(input, { name: "x", kind: "press" });
check("no owner name given, signs as the business", noOwner.body.includes("\nAcme Pools\n"));
const named = draftPitch({ ...input, ownerName: "Dana Reyes" }, { name: "x", kind: "press" });
check("an owner name is used when given", named.body.includes("\nDana Reyes\n"));

process.exit(fails);
