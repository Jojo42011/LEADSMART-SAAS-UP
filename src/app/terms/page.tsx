import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";
import { Footer } from "@/components/marketing/Footer";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms for using ${site.name} to research, write, and publish pages to your website.`,
};

const sections = [
  {
    heading: "The Service",
    items: [
      `${site.name} is autonomous software that researches your market, drafts pages, audits them against a quality gate, and publishes them to a website you connect. It is software, not a marketing agency, and does not guarantee search rankings or traffic.`,
      "You must own or have authorization to publish to any website you connect. Providing credentials for a site you do not control is a violation of these terms.",
    ],
  },
  {
    heading: "Your account",
    items: [
      "You are responsible for the accuracy of the business information you provide during onboarding; the agent writes from what you give it.",
      "You are responsible for keeping your login credentials and any connected OAuth tokens secure.",
      "One account is intended for one business's website(s); reselling access without a separate agreement is not permitted.",
    ],
  },
  {
    heading: "Content the agent publishes",
    items: [
      `${site.name} only generates content from real, verifiable information: your business details, publicly available research, and structured facts. It does not fabricate quotes, statistics, reviews, or credentials, and will not do so even if asked.`,
      "Autopilot mode publishes pages that pass the quality gate without further review. Review mode holds pages for your approval first. You choose the mode per site.",
      "You are responsible for reviewing published content on your live site and requesting removal of anything you disagree with; the dashboard's delete control removes a page from your site and its listing.",
      "You retain ownership of every page published to your site. If you cancel your subscription, published pages remain live; the Service simply stops publishing new ones.",
    ],
  },
  {
    heading: "Billing",
    items: [
      "Subscriptions are billed monthly in advance through Stripe. Pricing is published on the homepage and may change with notice.",
      "You can cancel at any time; cancellation takes effect at the end of the current billing period, and no partial refunds are issued for unused time.",
    ],
  },
  {
    heading: "Third-party services",
    items: [
      "The Service depends on third parties (Google, GitHub, Gemini, Stripe, and the platform hosting your own site). We are not responsible for outages or changes on their end that affect the Service.",
      "Connecting Google Search Console, GitHub, or WordPress to the Service is optional and can be revoked by you at any time.",
    ],
  },
  {
    heading: "Acceptable use",
    items: [
      "You will not use the Service to publish content that is illegal, defamatory, or that misrepresents your business's identity or credentials.",
      "You will not attempt to circumvent the Service's quality or safety gates, or use it to generate content for a website you are not authorized to publish to.",
    ],
  },
  {
    heading: "Disclaimers and limits",
    items: [
      'The Service is provided "as is." We do not guarantee specific search rankings, traffic, or AI-answer citations — these depend on factors outside our control, including search engine and AI provider behavior.',
      "To the extent permitted by law, our liability for any claim relating to the Service is limited to the amount you paid us in the three months before the claim arose.",
    ],
  },
  {
    heading: "Changes",
    items: [
      "We may update these terms as the Service changes; the date below reflects the latest version. Continued use after a change means you accept the update.",
    ],
  },
  {
    heading: "Contact",
    items: [
      "Questions about these terms can be sent through the contact channel listed on our homepage.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper-warm">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Wordmark />
          <Link href="/" className="text-sm text-muted transition-colors hover:text-ink">
            &larr; Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <span className="label-mono text-accent">Legal</span>
        <h1 className="font-display mt-4 text-4xl leading-[1.08] tracking-tight sm:text-5xl">
          Terms of Service
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
          Last updated July 31, 2026. The terms for using {site.name} on your
          own website.
        </p>

        <div className="mt-12 grid gap-10">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-[17px] font-medium tracking-tight">{section.heading}</h2>
              <ul className="mt-4 grid gap-3">
                {section.items.map((item) => (
                  <li
                    key={item}
                    className="rounded-xl border border-line bg-white p-4 text-[14px] leading-relaxed text-ink/80"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
