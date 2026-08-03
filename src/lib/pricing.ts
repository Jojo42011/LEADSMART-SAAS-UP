/**
 * What a given number of websites costs.
 *
 * One definition, used by the checkout, the billing panel, the marketing
 * pricing section and the Stripe line items. Pricing duplicated across
 * surfaces is how a page ends up advertising one number while the card is
 * charged another, and the customer is right to treat that as dishonesty
 * rather than a bug.
 *
 * One rate: $49 per website, per month. Kept as a module rather than a
 * bare constant so the surfaces that read it never grow their own
 * arithmetic again, which is how they drifted apart the first time.
 */

export const PRICE_PER_SITE = 49;

export type Quote = {
  sites: number;
  /** Dollars per month, total. */
  total: number;
};

export function quoteFor(siteCount: number): Quote {
  const sites = Math.max(1, Math.floor(siteCount) || 1);
  return { sites, total: sites * PRICE_PER_SITE };
}

/**
 * How the total is described in one line, for a receipt or a plan card.
 */
export function describeQuote(quote: Quote): string {
  return `${quote.sites} website${quote.sites === 1 ? "" : "s"} × $${PRICE_PER_SITE}`;
}
