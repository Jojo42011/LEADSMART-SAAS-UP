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
  description:
    "Ascent is an autonomous SEO and AEO platform. It researches your market, writes pages built to rank on Google and get cited by AI answers, and publishes them to your live site on schedule.",
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
