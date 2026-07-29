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

export default function Home() {
  // Nav and Footer sit outside <main> so their banner/contentinfo landmarks
  // survive — nesting them inside main strips both from the a11y tree.
  return (
    <>
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
