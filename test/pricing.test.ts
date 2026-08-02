/**
 * Pricing.
 *
 * Every number a customer is shown or charged comes from here, so an error
 * is either an overcharge or revenue quietly given away, and neither shows
 * up in a build. The bundle rule in particular has an edge that is easy to
 * get wrong: it must not apply below three sites, where it would cost the
 * customer more than paying per site.
 */
import { quoteFor, describeQuote, bundleUpsell, PRICE_PER_SITE, BUNDLE_PRICE, BUNDLE_SITES } from "../src/lib/pricing";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fails++; };

/* ------------------------------- Per site -------------------------------- */
check("one site is the headline price", quoteFor(1).total === 49, `$${quoteFor(1).total}`);
check("two sites are per-site, not bundled", quoteFor(2).total === 98 && quoteFor(2).plan === "per-site",
  `$${quoteFor(2).total} on ${quoteFor(2).plan}`);
check("the bundle never makes two sites more expensive", quoteFor(2).total < BUNDLE_PRICE);

/* -------------------------------- Bundle --------------------------------- */
check("three sites take the bundle", quoteFor(3).total === 99 && quoteFor(3).plan === "bundle",
  `$${quoteFor(3).total} on ${quoteFor(3).plan}`);
check("three sites beat paying per site", quoteFor(3).total < 3 * PRICE_PER_SITE,
  `$${quoteFor(3).total} vs $${3 * PRICE_PER_SITE}`);
check("the saving is reported", quoteFor(3).savedVersusPerSite === 48, `$${quoteFor(3).savedVersusPerSite}`);

/* ---------------------------- Beyond the pack ---------------------------- */
check("a fourth site adds the per-site price", quoteFor(4).total === 99 + 49, `$${quoteFor(4).total}`);
check("a tenth site follows the same rule", quoteFor(10).total === 99 + 7 * 49, `$${quoteFor(10).total}`);
check("the bundle still applies above three", quoteFor(10).plan === "bundle");

/* ----------------------- Always the cheaper of the two ------------------- */
let monotonic = true, cheapest = true;
for (let n = 1; n <= 25; n++) {
  const q = quoteFor(n);
  if (q.total > n * PRICE_PER_SITE) cheapest = false;
  if (n > 1 && q.total < quoteFor(n - 1).total) monotonic = false;
}
check("no site count is ever charged above the per-site rate", cheapest);
check("adding a site never reduces the bill", monotonic);

/* ------------------------------ Edge inputs ------------------------------ */
check("zero is treated as one", quoteFor(0).total === 49);
check("negative is treated as one", quoteFor(-3).total === 49);
check("fractional is floored to a whole site", quoteFor(3.9).total === 99);

/* ------------------------------ Descriptions ----------------------------- */
check("one site reads naturally", describeQuote(quoteFor(1)) === "1 website × $49", describeQuote(quoteFor(1)));
check("the pack is named", describeQuote(quoteFor(3)) === "3 websites for $99", describeQuote(quoteFor(3)));
check("extras beyond the pack are itemised",
  describeQuote(quoteFor(5)) === "3 websites for $99, plus 2 more at $49 each", describeQuote(quoteFor(5)));

/* -------------------------------- Upsell --------------------------------- */
const at2 = bundleUpsell(2);
// $98 for two against $99 for three. The message says "$1", not "free" —
// a dollar is not nothing, and rounding it away to make the offer sound
// better is the kind of small dishonesty customers notice on the invoice.
check("at two sites the third costs a dollar and says so",
  at2.worthIt && /1 more for \$1 instead of \$49/.test(at2.message), at2.message);
check("at one site the offer is honest about the difference",
  /\$\d+ instead of \$\d+/.test(bundleUpsell(1).message), bundleUpsell(1).message);
check("no upsell once already on the pack", !bundleUpsell(BUNDLE_SITES).worthIt);

process.exit(fails);
