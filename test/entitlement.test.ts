/**
 * Who the agent is allowed to work for.
 *
 * Every rule here has a cost attached in one of two directions: too
 * permissive and cancelled customers get free generation, publishing and
 * model spend; too strict and a paying customer whose card expired loses
 * days of work they intended to pay for. Both are silent failures, which
 * is why they are asserted rather than reasoned about.
 */
import { entitlementFor, planStatusFromStripe, entitledSqlFragment, PLAN_GRACE_DAYS } from "../src/lib/engine/entitlement";

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
check("a tenant who never subscribed is not entitled",
  !entitlementFor("inactive", null, NOW).allowed);
check("an unknown tenant is not entitled", !entitlementFor(null, null, NOW).allowed);

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

process.exit(fails);
