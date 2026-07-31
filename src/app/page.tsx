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

/**
 * Organization schema binds the app name and logo to this domain in
 * machine-readable form. It helps search and AI engines resolve the
 * entity, and it is the association an OAuth consent-screen review looks
 * for when checking that an app's declared name and logo match its
 * homepage.
 */
const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: site.name,
  url: `https://${site.domain}`,
  logo: `https://${site.domain}/logo.png`,
  description: site.description,
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
