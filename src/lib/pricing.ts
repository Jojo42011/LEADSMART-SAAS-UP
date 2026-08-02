/**
 * What a given number of websites costs.
 *
 * One definition, used by the checkout, the billing panel, the marketing
 * pricing section and the Stripe line items. Pricing duplicated across
 * surfaces is how a page ends up advertising one number while the card is
 * charged another, and the customer is right to treat that as dishonesty
 * rather than a bug.
 *
 * Two ways to pay, and the customer is always given the cheaper one
 * rather than the one they happened to pick:
 *
 *   Per site   $49 each.
 *   Three-pack $99 for three, then $49 for each site beyond.
 *
 * The bundle only wins from the third site (3 × $49 = $147 against $99),
 * so below that the per-site price applies by itself. Charging the higher
 * of the two because somebody did not notice the bundle would be revenue
 * taken from inattention, which is not a business worth building.
 */

export const PRICE_PER_SITE = 49;
export const BUNDLE_SITES = 3;
export const BUNDLE_PRICE = 99;

export type Quote = {
  sites: number;
  /** Dollars per month, total. */
  total: number;
  /** Which structure produced it. */
  plan: "per-site" | "bundle";
  /** What the same sites would cost per-site, when the bundle beats it. */
  savedVersusPerSite: number;
  /** Average per site, for comparison against the headline price. */
  effectivePerSite: number;
};

export function quoteFor(siteCount: number): Quote {
  const sites = Math.max(1, Math.floor(siteCount) || 1);

  const perSiteTotal = sites * PRICE_PER_SITE;
  // Beyond the pack, extra sites are the ordinary per-site price.
  const bundleTotal =
    sites >= BUNDLE_SITES
      ? BUNDLE_PRICE + (sites - BUNDLE_SITES) * PRICE_PER_SITE
      : Infinity;

  const useBundle = bundleTotal < perSiteTotal;
  const total = useBundle ? bundleTotal : perSiteTotal;

  return {
    sites,
    total,
    plan: useBundle ? "bundle" : "per-site",
    savedVersusPerSite: useBundle ? perSiteTotal - total : 0,
    effectivePerSite: Math.round((total / sites) * 100) / 100,
  };
}

/**
 * How the total is described in one line, for a receipt or a plan card.
 */
export function describeQuote(quote: Quote): string {
  if (quote.plan === "bundle") {
    const extra = quote.sites - BUNDLE_SITES;
    const base = `${BUNDLE_SITES} websites for $${BUNDLE_PRICE}`;
    if (extra === 0) return base;
    return extra === 1
      ? `${base}, plus 1 more at $${PRICE_PER_SITE}`
      : `${base}, plus ${extra} more at $${PRICE_PER_SITE} each`;
  }
  return `${quote.sites} website${quote.sites === 1 ? "" : "s"} × $${PRICE_PER_SITE}`;
}

/**
 * The saving a customer would make by moving up to the three-pack, if any.
 *
 * Surfaced at two sites, where adding a third costs nothing extra — it is
 * $98 for two against $99 for three. Telling somebody that is worth more
 * than the dollar it forgoes.
 */
export function bundleUpsell(currentSites: number): { worthIt: boolean; message: string } {
  if (currentSites >= BUNDLE_SITES) return { worthIt: false, message: "" };
  const now = quoteFor(currentSites).total;
  const atBundle = quoteFor(BUNDLE_SITES).total;
  const extraSites = BUNDLE_SITES - currentSites;
  const difference = atBundle - now;

  if (difference <= 0) {
    return {
      worthIt: true,
      message: `Adding ${extraSites} more website${extraSites === 1 ? "" : "s"} costs nothing — three are $${BUNDLE_PRICE}, the same as you pay now.`,
    };
  }
  return {
    worthIt: difference < extraSites * PRICE_PER_SITE,
    message: `${BUNDLE_SITES} websites are $${BUNDLE_PRICE} — ${extraSites} more for $${difference} instead of $${extraSites * PRICE_PER_SITE}.`,
  };
}
