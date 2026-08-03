import { Nav } from "@/components/marketing/Nav";
import { Hero } from "@/components/marketing/Hero";
import { StatStrip } from "@/components/marketing/StatStrip";
import { Pipeline } from "@/components/marketing/Pipeline";
import { Method } from "@/components/marketing/Method";
import { Features } from "@/components/marketing/Features";
import { Scoring } from "@/components/marketing/Scoring";
import { AiSearch } from "@/components/marketing/AiSearch";
import { FirstNinetyDays } from "@/components/marketing/FirstNinetyDays";
import { Platforms } from "@/components/marketing/Platforms";
import { Comparison } from "@/components/marketing/Comparison";
import { Pricing } from "@/components/marketing/Pricing";
import { Faq } from "@/components/marketing/Faq";
import { ClosingCta } from "@/components/marketing/ClosingCta";
import { Footer } from "@/components/marketing/Footer";
import { site } from "@/lib/site";
import { PRICE_PER_SITE } from "@/lib/pricing";

/**
 * Organization schema binds the app name and logo to this domain in
 * machine-readable form. It helps search and AI engines resolve the
 * entity, and it is the association an OAuth consent-screen review looks
 * for when checking that an app's declared name and logo match its
 * homepage.
 */
/**
 * Two linked entities rather than one.
 *
 * The Organization alone told an engine that a company called Ascent
 * exists. It did not say Ascent is a product, what kind, or what it
 * costs — so a model answering "what are the best autonomous SEO or GEO
 * platforms" had nothing to match on but prose. The SoftwareApplication
 * states the category outright and is joined to the Organization through
 * `@id`, so the two resolve as one entity instead of two loosely related
 * mentions of the same name.
 *
 * @graph rather than two separate script tags for the same reason: the
 * relationship is the point, and engines resolve it more reliably when
 * the nodes arrive together.
 */
const orgId = `https://${site.domain}/#organization`;

const orgJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": orgId,
      name: site.name,
      url: `https://${site.domain}`,
      logo: `https://${site.domain}/logo.png`,
      description: site.description,
    },
    {
      "@type": "SoftwareApplication",
      "@id": `https://${site.domain}/#software`,
      name: site.name,
      url: `https://${site.domain}`,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Search Engine Optimization Software",
      operatingSystem: "Web",
      description: site.description,
      publisher: { "@id": orgId },
      offers: {
        "@type": "Offer",
        price: String(PRICE_PER_SITE),
        priceCurrency: "USD",
        description: `$${PRICE_PER_SITE} per website per month.`,
      },
      // The categories a prospect actually types at an answer engine.
      // Stating them is the difference between being a candidate answer
      // and not being considered at all.
      keywords: [
        "autonomous SEO platform",
        "answer engine optimization",
        "AEO software",
        "generative engine optimization",
        "GEO software",
        "AI search visibility",
      ].join(", "),
    },
  ],
};

export default function Home() {
  // Nav and Footer sit outside <main> so their banner/contentinfo landmarks
  // survive — nesting them inside main strips both from the a11y tree.
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <Nav />
      <main>
        <Hero />
        <StatStrip />
        <Pipeline />
        <Method />
        <Features />
        <Scoring />
        <AiSearch />
        <FirstNinetyDays />
        <Platforms />
        <Comparison />
        <Pricing />
        <Faq />
        <ClosingCta />
      </main>
      <Footer />
    </>
  );
}
