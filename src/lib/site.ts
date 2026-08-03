/**
 * Single source of truth for the product brand.
 * Change the name here and it updates everywhere.
 *
 * The domain comes from NEXT_PUBLIC_SITE_DOMAIN so that buying the real
 * one is a host setting rather than a code change. It is baked into
 * canonical URLs, the sitemap, robots.txt, llms.txt, JSON-LD and OG tags,
 * so shipping a placeholder is not cosmetic: search engines canonicalise
 * pages to whatever this says, and Google's OAuth verification requires
 * the privacy policy to be hosted on the same domain as the app.
 *
 * NEXT_PUBLIC_ because these are read during client rendering too. They
 * are public facts about the business, not secrets.
 */
export const site = {
  name: "Ascent",
  domain: process.env.NEXT_PUBLIC_SITE_DOMAIN || "ascent.so",
  tagline: "SEO and AI search on autopilot",
  /**
   * The one-sentence entity definition, reused in metadata and in the
   * JSON-LD on the homepage and /ai-information.
   *
   * It names all three category terms — SEO, answer engine optimization
   * (AEO) and generative engine optimization (GEO) — because an answer
   * engine can only place a product in a category the product has stated.
   * Asked "what are the best generative engine optimization platforms", a
   * model matches against the words on the page; describing ourselves only
   * as "SEO software" is how a GEO product goes uncited for GEO queries.
   * The sentence leads with what Ascent is, in the shape an engine can
   * quote whole.
   */
  description:
    "Ascent is an autonomous SEO, AEO and GEO platform: software that researches a business's market, writes complete pages built to rank on Google and to be cited by AI answer engines like ChatGPT, Perplexity and Google AI Mode, audits them against a quality gate, and publishes them to the business's own website on a schedule — without an agency, a retainer or a content team.",
  /**
   * The address printed on the legal pages. Google's verification
   * reviewers and Stripe both want a reachable human, and "contact us
   * through the homepage" is a routine rejection reason.
   */
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "toolascent@gmail.com",
  /**
   * The legal entity behind the Service, and the jurisdiction whose law
   * governs the terms. Empty until the business is registered — the legal
   * pages omit the sentence rather than printing a placeholder, because a
   * made-up company name on a contract is worse than a missing one.
   */
  legalEntity: process.env.NEXT_PUBLIC_LEGAL_ENTITY || "",
  governingLaw: process.env.NEXT_PUBLIC_GOVERNING_LAW || "",
} as const;
