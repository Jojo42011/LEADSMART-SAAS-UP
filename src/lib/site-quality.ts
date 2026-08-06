import type { SiteIngest } from "./site-ingest";

/**
 * How good a shape the customer's existing website is in, judged only
 * from what the ingest actually read.
 *
 * This exists because the agent's output inherits the site it publishes
 * into. Generated pages take their colours, fonts, logo and navigation
 * from the brand snapshot, so a source site with no discernible design
 * produces pages that look plain no matter how good the writing is — the
 * ceiling on what the agent can ship is set by the site underneath it.
 * Naming that ceiling is the first honest step toward offering to raise
 * it.
 *
 * Three rules govern everything here, because this score is used to tell
 * someone their website is bad and then offer to sell them a new one, and
 * that is a conflict of interest unless it is handled carefully:
 *
 *  1. Every finding cites a signal the ingest genuinely observed. No
 *     finding is inferred from another finding, and nothing is asserted
 *     about a site we could not read.
 *  2. Findings are phrased as the measurement, not as a verdict on the
 *     owner's taste. "No brand colours were found in the stylesheet" is
 *     checkable; "your site looks dated" is an opinion that happens to
 *     end in a payment.
 *  3. When the ingest failed, the result is "unknown" — never "poor".
 *     A site we could not fetch must never be sold a rebuild on the
 *     strength of our own network error.
 */

export type QualityFinding = {
  key:
    | "clientRendered"
    | "noBrandColors"
    | "noLogo"
    | "thinNavigation"
    | "noMetaDescription"
    | "noHeading"
    | "fewPages"
    | "noPhone";
  /** What was measured, in the owner's terms. */
  label: string;
  /** Why it limits what the agent can do — the reason it is on this list. */
  consequence: string;
  /** How much it drags the score down. */
  weight: number;
  /**
   * True when this alone justifies offering a rebuild: the site is not
   * merely plain, it is structurally failing at something the agent
   * cannot fix by publishing more pages.
   */
  severe: boolean;
};

export type SiteQuality = {
  /** 0-100, higher is better. Null when the site could not be read. */
  score: number | null;
  /** Findings, worst first. Empty when the site is in good shape. */
  findings: QualityFinding[];
  /**
   * Whether to offer a rebuild. Deliberately not a bare score threshold:
   * see shouldOfferRebuild.
   */
  offerRebuild: boolean;
  /** One sentence for the UI, always true of what was measured. */
  summary: string;
};

/**
 * The rebuild is offered when the site is genuinely holding the agent
 * back, which is a different question from "is the score low".
 *
 * A site can score poorly for reasons a rebuild would not fix (a missing
 * phone number), and a site can score respectably while failing at the
 * one thing that matters most (server-rendered nothing). So the offer
 * needs either a severe structural finding, or enough separate weaknesses
 * that the brand basis really is too thin to build on.
 */
const OFFER_SCORE_THRESHOLD = 55;
const OFFER_MIN_FINDINGS = 3;

/**
 * The ingest this reads is often a snapshot cached in a customer's
 * browser, saved by a version of the app that predates fields added
 * since — nav, logo and footerLinks all arrived after the first
 * snapshots were written. Reading `.length` off one of those absent
 * arrays throws, and it would throw inside onboarding, on the step where
 * someone is looking at their own website. So every field is read
 * through these rather than trusted to exist, and an absent field means
 * "not observed" — which is never reported as a finding, because a
 * finding has to correspond to something actually measured.
 */
const arr = <T,>(v: T[] | undefined | null): T[] => (Array.isArray(v) ? v : []);
const str = (v: string | undefined | null): string => (typeof v === "string" ? v : "");

export function assessSiteQuality(ingest: SiteIngest | null | undefined): SiteQuality {
  // Could not read the site. Not a judgement, and explicitly not a reason
  // to sell anything — the failure may well be ours.
  if (!ingest || !ingest.ok) {
    return {
      score: null,
      findings: [],
      offerRebuild: false,
      summary: "This site could not be read, so nothing is being judged about it.",
    };
  }

  const findings: QualityFinding[] = [];

  if (ingest.clientRendered) {
    findings.push({
      key: "clientRendered",
      label: "The page serves almost no text until JavaScript runs.",
      consequence:
        "No major AI crawler runs JavaScript, so answer engines see an empty page here — the pages the agent publishes would be readable, but the site around them is not.",
      weight: 30,
      severe: true,
    });
  }

  if (arr(ingest.colors).length === 0) {
    findings.push({
      key: "noBrandColors",
      label: "No brand colours could be found in the site's stylesheet.",
      consequence:
        "Published pages are styled from the site's own palette, so with none to read they fall back to plain black and white.",
      weight: 18,
      severe: false,
    });
  }

  if (!str(ingest.logo)) {
    findings.push({
      key: "noLogo",
      label: "No logo image was found in the header.",
      consequence:
        "Generated pages show the business name as plain text where a real site shows its mark, which is the usual tell that a page is not quite part of the site.",
      weight: 12,
      severe: false,
    });
  }

  const navCount = arr(ingest.nav).length;
  if (navCount < 3) {
    findings.push({
      key: "thinNavigation",
      label: `The main navigation has ${navCount === 0 ? "no links" : `only ${navCount} link${navCount === 1 ? "" : "s"}`}.`,
      consequence:
        "Generated pages reproduce the real navigation, and they inherit whatever is there — thin navigation also gives search engines and readers little to follow.",
      weight: 14,
      severe: false,
    });
  }

  if (!str(ingest.description).trim()) {
    findings.push({
      key: "noMetaDescription",
      label: "The homepage has no meta description.",
      consequence:
        "Search results and AI answers fall back to whatever text they can scrape, rather than a summary the business chose.",
      weight: 10,
      severe: false,
    });
  }

  if (!str(ingest.h1).trim()) {
    findings.push({
      key: "noHeading",
      label: "The homepage has no H1 heading.",
      consequence:
        "The single strongest on-page signal of what a page is about is missing, and it is the one an answer engine reads first.",
      weight: 12,
      severe: false,
    });
  }

  // Only asserted when a sitemap was actually read. A null count means we
  // could not tell, which is not the same as a small site.
  if (ingest.pageCount !== null && ingest.pageCount < 5) {
    findings.push({
      key: "fewPages",
      label: `The sitemap lists ${ingest.pageCount} page${ingest.pageCount === 1 ? "" : "s"}.`,
      consequence:
        "There is little existing content for new pages to link into, and internal links are one of the things that make published pages rank.",
      weight: 10,
      severe: false,
    });
  }

  if (!str(ingest.phone).trim()) {
    findings.push({
      key: "noPhone",
      label: "No phone number was found on the homepage.",
      consequence:
        "Local search and AI recommendations lean on consistent contact details, and generated pages repeat whatever the site already shows.",
      weight: 6,
      severe: false,
    });
  }

  findings.sort((a, b) => b.weight - a.weight);

  const score = Math.max(0, 100 - findings.reduce((sum, f) => sum + f.weight, 0));
  const severe = findings.some((f) => f.severe);
  const offerRebuild =
    severe || (score < OFFER_SCORE_THRESHOLD && findings.length >= OFFER_MIN_FINDINGS);

  const summary = severe
    ? "This site serves almost nothing to crawlers that don't run JavaScript, which is most of the AI ones."
    : findings.length === 0
      ? "This site gives the agent a solid base to publish into."
      : offerRebuild
        ? `${findings.length} things about this site limit what the agent can publish into it.`
        : `Mostly solid — ${findings.length} smaller thing${findings.length === 1 ? "" : "s"} the agent works around.`;

  return { score, findings, offerRebuild, summary };
}
