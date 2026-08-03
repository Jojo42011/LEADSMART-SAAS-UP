/**
 * Pricing.
 *
 * Every number a customer is shown or charged comes from here, so an error
 * is either an overcharge or revenue quietly given away, and neither shows
 * up in a build. The reason the module exists is that the checkout, the
 * billing panel, the marketing page, the site switcher and the Stripe line
 * items all used to do their own arithmetic — which is how a page ends up
 * advertising one number while the card is charged another.
 */
import { quoteFor, describeQuote, PRICE_PER_SITE } from "../src/lib/pricing";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fails++; };

/* ------------------------------- Per site -------------------------------- */
check("one site is the headline price", quoteFor(1).total === PRICE_PER_SITE, `$${quoteFor(1).total}`);
check("two sites", quoteFor(2).total === 98, `$${quoteFor(2).total}`);
check("three sites are flat-rated — no pack discount", quoteFor(3).total === 147, `$${quoteFor(3).total}`);
check("four sites", quoteFor(4).total === 196, `$${quoteFor(4).total}`);
check("ten sites", quoteFor(10).total === 490, `$${quoteFor(10).total}`);
check("the quote reports the site count it priced", quoteFor(7).sites === 7);

/* --------------------------- The step is even ---------------------------- */
// The property to protect now the three-pack is gone: every additional
// website costs exactly the sticker price, so the "+$49" the site switcher
// shows before charging is never a surprise at any seat count.
let evenSteps = true;
let firstBadStep = 0;
for (let n = 1; n < 20; n++) {
  if (quoteFor(n + 1).total - quoteFor(n).total !== PRICE_PER_SITE) {
    evenSteps = false;
    firstBadStep = firstBadStep || n;
  }
}
check("each additional site costs exactly the sticker price", evenSteps, firstBadStep ? `breaks at ${firstBadStep}` : "");

/* ---------------------------- Input hardening ---------------------------- */
// These arrive from a request body and from a stepper control.
check("zero is treated as one site", quoteFor(0).sites === 1 && quoteFor(0).total === PRICE_PER_SITE);
check("negatives are treated as one site", quoteFor(-5).sites === 1);
check("fractions round down to whole sites", quoteFor(2.9).sites === 2 && quoteFor(2.9).total === 98);
check("NaN falls back to one site", quoteFor(Number.NaN).sites === 1);

/* ------------------------------ Description ------------------------------ */
check("one site reads in the singular", describeQuote(quoteFor(1)) === `1 website × $${PRICE_PER_SITE}`, describeQuote(quoteFor(1)));
check("several sites read in the plural", describeQuote(quoteFor(3)) === `3 websites × $${PRICE_PER_SITE}`, describeQuote(quoteFor(3)));

if (fails > 0) process.exitCode = 1;
