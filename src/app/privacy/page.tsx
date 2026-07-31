import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";
import { Footer } from "@/components/marketing/Footer";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${site.name} collects, stores, and uses data for accounts and connected sites.`,
};

/**
 * Written from what the codebase actually does, not boilerplate: every
 * claim here traces to a real code path (session cookies, secrets.ts
 * encryption, the OAuth callbacks, Stripe, Gemini) so it stays accurate
 * as the product changes rather than silently drifting from reality.
 */

const sections = [
  {
    heading: "What this covers",
    items: [
      `This policy covers ${site.name} (the "Service"), operated to provide autonomous SEO, AEO, and GEO content generation and publishing for a customer's own website.`,
      "It does not cover the content of pages the Service publishes to a customer's site, or that customer's own privacy policy toward their visitors.",
    ],
  },
  {
    heading: "Information we collect",
    items: [
      "Account information: your name and email address, provided directly or through Google or GitHub sign-in.",
      "Site and business information you provide during onboarding: your website URL, business name, phone, address, service area, industry, and services offered. Used to research keywords and write pages that describe your business accurately.",
      "Publishing credentials for the platform you connect: a WordPress application password, or a GitHub personal access token and repository name. These are encrypted (AES-256-GCM) before being stored and are only decrypted at the moment a page is published.",
      "OAuth tokens from Google (sign-in, and optionally Search Console read access) and GitHub (sign-in, and repository publish access), stored encrypted the same way.",
      "Billing information when you subscribe: Stripe processes payment details directly. We store your Stripe customer ID and subscription status, never your card number.",
      "Usage data the Service generates on your behalf: keywords researched, pages drafted and published, audit scores, and run history for your site.",
    ],
  },
  {
    heading: "How we use it",
    items: [
      "To research your market, generate pages, and publish them to your connected site on the schedule you choose.",
      "To authenticate you and keep your account secure.",
      "To show you what the agent has done and is planning to do, in the dashboard.",
      "To process billing through Stripe and keep your subscription status current.",
      "To read Search Console performance data for your own site, only if you explicitly connect it — this is read-only and scoped to your account.",
      "We do not sell personal information, and we do not use your business data to train AI models beyond what a third-party provider (see below) does to generate a single response to a single request.",
    ],
  },
  {
    heading: "Third parties we send data to",
    items: [
      "Google — for sign-in, and if you connect it, read-only Search Console data for your own site.",
      "GitHub — for sign-in, and to publish pages to a repository you explicitly connect.",
      "Google Gemini — receives your business details and target keywords to draft page content. This is a live API call per page; content is not used by us to train models.",
      "Stripe — processes subscription payments. We never receive or store your card number.",
      "WordPress (your own site) — if you connect a WordPress site, published pages are sent directly to your site's REST API using the application password you provide.",
      "We do not share your data with data brokers or advertising networks.",
    ],
  },
  {
    heading: "How we store and protect it",
    items: [
      "Publishing credentials and OAuth refresh tokens are encrypted at rest (AES-256-GCM) and only decrypted in memory at the moment they are used.",
      "Passwords for email accounts are hashed (scrypt), never stored in plain text.",
      "Sessions are authenticated with a signed, httpOnly cookie; it cannot be read or modified by scripts running in your browser.",
      "Access to your site's data is scoped to your account at the database level — no cross-account access exists in the product.",
    ],
  },
  {
    heading: "Your choices",
    items: [
      "You can disconnect Google, GitHub, or Search Console access at any time from your dashboard; this revokes our stored token.",
      "You can request deletion of your account and associated data by contacting us (see below). Pages already published to your live site are yours and are not affected by account deletion.",
      "You can cancel your subscription at any time; published pages remain on your site.",
    ],
  },
  {
    heading: "Changes to this policy",
    items: [
      `We will update this page if how ${site.name} handles data changes, and update the date below when we do.`,
    ],
  },
  {
    heading: "Contact",
    items: [
      "Questions about this policy or your data can be sent through the contact channel listed on our homepage.",
    ],
  },
];

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
          Last updated July 31, 2026. Plain language, describing what {site.name}{" "}
          actually does with your data.
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
