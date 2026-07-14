import { Nav } from "@/components/marketing/Nav";
import { Hero } from "@/components/marketing/Hero";
import { StatStrip } from "@/components/marketing/StatStrip";
import { KeywordMarquee } from "@/components/marketing/KeywordMarquee";
import { Pipeline } from "@/components/marketing/Pipeline";
import { Features } from "@/components/marketing/Features";
import { Scoring } from "@/components/marketing/Scoring";
import { Platforms } from "@/components/marketing/Platforms";
import { Pricing } from "@/components/marketing/Pricing";
import { Faq } from "@/components/marketing/Faq";
import { ClosingCta } from "@/components/marketing/ClosingCta";
import { Footer } from "@/components/marketing/Footer";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <StatStrip />
      <KeywordMarquee />
      <Pipeline />
      <Features />
      <Scoring />
      <Platforms />
      <Pricing />
      <Faq />
      <ClosingCta />
      <Footer />
    </main>
  );
}
