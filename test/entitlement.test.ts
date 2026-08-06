/**
 * Who the agent is allowed to work for.
 *
 * Every rule here has a cost attached in one of two directions: too
 * permissive and cancelled customers get free generation, publishing and
 * model spend; too strict and a paying customer whose card expired loses
 * days of work they intended to pay for. Both are silent failures, which
 * is why they are asserted rather than reasoned about.
 */
import { entitlementFor, planStatusFromStripe, entitledSqlFragment, freeTierSqlFragment, PLAN_GRACE_DAYS, FREE_PAGE_LIMIT } from "../src/lib/engine/entitlement";
import { siteHost } from "../src/lib/url";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fails++; };

const NOW = new Date("2026-08-01T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

/* --------------------------- Entitled states ---------------------------- */
check("a trial works", entitlementFor("trialing", daysAgo(1), NOW).allowed);
check("an active subscription works", entitlementFor("active", daysAgo(30), NOW).allowed);

/* ------------------------------ Trial end -------------------------------- */
// A trial that ends without a usable card becomes `incomplete` in Stripe.
check("a trial ending without payment stops the agent",
  !entitlementFor("incomplete", daysAgo(0), NOW).allowed);
check("an expired incomplete subscription stops the agent",
  !entitlementFor("incomplete_expired", daysAgo(0), NOW).allowed);
check("an unmapped Stripe status is treated as unpaid, not permitted",
  !entitlementFor(planStatusFromStripe("something_new"), daysAgo(0), NOW).allowed);

/* ---------------------------- Failed payment ----------------------------- */
const fresh = entitlementFor("past_due", daysAgo(1), NOW);
check("a failed payment keeps working during the grace window", fresh.allowed, fresh.reason);
check("grace state is reported as its own thing", fresh.state === "grace");
check("grace tells the owner how long is left", /\d+ more day/.test(fresh.reason), fresh.reason);

const expired = entitlementFor("past_due", daysAgo(PLAN_GRACE_DAYS + 1), NOW);
check("a failed payment stops once grace runs out", !expired.allowed, expired.reason);
check("the boundary is inclusive of the last day",
  entitlementFor("past_due", daysAgo(PLAN_GRACE_DAYS - 0.5), NOW).allowed);

/* --------------------------- Settled endings ----------------------------- */
check("cancelled stops immediately, no grace",
  !entitlementFor("canceled", daysAgo(0), NOW).allowed);
check("unpaid stops immediately, no grace",
  !entitlementFor("unpaid", daysAgo(0), NOW).allowed);
check("cancelled copy reassures that pages are kept",
  /stay on your site/i.test(entitlementFor("canceled", null, NOW).reason));

/* ------------------------------ No plan ---------------------------------- */
// Without a free-page count the answer is "no". The closed default matters:
// a caller that has not been taught about the free preview must turn work
// away rather than hand out unmetered generation.
check("a tenant who never subscribed is not entitled",
  !entitlementFor("inactive", null, NOW).allowed);
check("an unknown tenant is not entitled", !entitlementFor(null, null, NOW).allowed);

/* ---------------------------- Free preview ------------------------------- */
// The point of the free tier is that the agent really runs — someone has to
// watch it publish to their own site before paying. So these assert real
// work is permitted, and that it stops dead on the limit.
const free0 = entitlementFor("inactive", null, NOW, 0);
check("a brand new site gets the free preview", free0.allowed, free0.reason);
check("free preview is its own state", free0.state === "free");
check("free preview reports progress structurally, not just in prose",
  free0.free?.used === 0 && free0.free?.limit === FREE_PAGE_LIMIT);
check("free preview says how many pages are left",
  new RegExp(`${FREE_PAGE_LIMIT} page`).test(free0.reason), free0.reason);

check("the agent still runs one page short of the limit",
  entitlementFor("inactive", null, NOW, FREE_PAGE_LIMIT - 1).allowed);

const spent = entitlementFor("inactive", null, NOW, FREE_PAGE_LIMIT);
check("the agent stops exactly on the limit", !spent.allowed, spent.reason);
check("hitting the limit is distinguishable from a billing failure",
  spent.state === "free_limit");
check("the limit copy points at upgrading, not at fixing a card",
  /start a plan/i.test(spent.reason), spent.reason);
check("the limit copy reassures that published pages are kept",
  /stay on your site/i.test(spent.reason), spent.reason);
check("over the limit stays stopped", !entitlementFor("inactive", null, NOW, 99).allowed);

// A second signup on a site that already spent its pages inherits the count
// (freePagesUsedFor counts by host), so it must land straight on the wall.
check("a fresh account on a used-up site gets nothing",
  !entitlementFor("inactive", null, NOW, FREE_PAGE_LIMIT).allowed);

// Paying customers must never be pushed onto the free wall by the count.
check("a paid plan ignores the free-page count",
  entitlementFor("active", daysAgo(1), NOW, 999).allowed);
check("a cancelled plan is not rescued by an unspent free allowance",
  !entitlementFor("canceled", daysAgo(1), NOW, 0).allowed);

/* --------------------------- Stripe mapping ------------------------------ */
const mapping: [string, string][] = [
  ["trialing", "trialing"], ["active", "active"], ["past_due", "past_due"],
  ["unpaid", "unpaid"], ["canceled", "canceled"], ["incomplete", "incomplete"],
  ["incomplete_expired", "incomplete_expired"], ["paused", "paused"],
];
check("every Stripe subscription status is mapped",
  mapping.every(([from, to]) => planStatusFromStripe(from) === to));

/* ----------------------- SQL and TS agree ------------------------------- */
// The scheduler decides in SQL and the buttons decide in TypeScript. If
// those two ever disagree, the product either works for people who stopped
// paying or refuses people who are.
const frag = entitledSqlFragment("t");
check("SQL admits exactly the entitled statuses",
  frag.includes("'active'") && frag.includes("'trialing'") && frag.includes("'past_due'"));
check("SQL does not admit settled endings",
  !frag.includes("'canceled'") && !frag.includes("'unpaid'") && !frag.includes("'incomplete'"));
check("SQL uses the same grace window as the TypeScript",
  frag.includes(`make_interval(days => ${PLAN_GRACE_DAYS})`), frag.replace(/\s+/g, " "));

const freeFrag = freeTierSqlFragment("s", "t");
check("free-tier SQL uses the same page limit as the TypeScript",
  freeFrag.includes(`< ${FREE_PAGE_LIMIT}`), freeFrag.replace(/\s+/g, " "));
check("free-tier SQL only applies to tenants with no plan",
  freeFrag.includes("plan_status = 'inactive'"));
check("free-tier SQL counts published pages, not drafts",
  freeFrag.includes("'published'"));
check("free-tier SQL counts by host, so a second account on the same site inherits the spend",
  freeFrag.includes("fs.host = s.host"), freeFrag.replace(/\s+/g, " "));
check("free-tier SQL refuses a site whose host could not be resolved",
  freeFrag.includes("coalesce(s.host, '') <> ''"), freeFrag.replace(/\s+/g, " "));

/* ------------- The allowance survives a retyped URL ---------------------- */
// The limit is charged against the website. If these normalized to
// different hosts, retyping the URL would mint a fresh allowance — the
// cheapest possible way to defeat the gate.
const spellings = [
  "https://www.Example.com/pricing",
  "example.com",
  "http://example.com",
  "EXAMPLE.com/",
  "https://example.com:443",
];
check("every spelling of one website resolves to one host",
  new Set(spellings.map(siteHost)).size === 1, JSON.stringify(spellings.map(siteHost)));
check("different websites stay different", siteHost("other.com") !== siteHost("example.com"));
check("an unparseable site yields no host to collide on", siteHost("") === "");

process.exit(fails);
