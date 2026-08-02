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
    // Google requires data obtained through sensitive scopes to be
    // described SEPARATELY rather than folded into broad terms alongside
    // everything else, and requires an explicit Limited Use affirmation.
    // Verification is refused without both, so this section is deliberately
    // its own heading naming the exact scope rather than a line in the
    // general "what we collect" list above.
    heading: "Google user data",
    items: [
      `Signing in with Google gives ${site.name} your name, email address and profile picture, used only to create and authenticate your account.`,
      "Connecting Search Console is optional and separate from signing in. It requests one scope, https://www.googleapis.com/auth/webmasters.readonly, which is read-only: it cannot change, publish to, or delete anything in your Search Console account.",
      "What we access with it: impressions, clicks, average position and the queries your own verified properties rank for. What we do with it: show your rankings in your dashboard, and let the agent prioritise keywords where you already have traction. Nothing else.",
      "How it is stored: the refresh token is encrypted (AES-256-GCM) at rest and decrypted in memory only when fetching your data. Performance data is stored against your account and is readable only by your account.",
      "Who it is shared with: nobody. Search Console data is never sold, never shared with advertisers or data brokers, never used for advertising, and never sent to an AI model — including the Gemini calls that draft your pages.",
      "How to revoke it: disconnect Search Console from your dashboard at any time, which deletes our stored token, or revoke access directly at myaccount.google.com/permissions.",
      `${site.name}'s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.`,
    ],
  },
  {
    heading: "Cookies",
    items: [
      "We set one cookie: a signed, httpOnly session cookie that keeps you logged in. It cannot be read by scripts in your browser.",
      "We do not use advertising, tracking, or third-party analytics cookies, and there is nothing here to opt out of because there is no cross-site tracking to disable.",
      "Theme and which website you are viewing are stored in your browser's local storage, not sent to us.",
    ],
  },
  {
    heading: "How long we keep it",
    items: [
      "Account, site and page data is kept while your account is open, so the agent can build on its own history rather than restarting each cycle.",
      "Publishing credentials and OAuth tokens are deleted when you disconnect the service they belong to.",
      "On account deletion we remove your account, site configuration, credentials and generated page records within 30 days. Pages already published to your own site are yours and are unaffected.",
      "Billing records are retained as long as tax and accounting law requires, which is separate from account deletion.",
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
      // A reachable address, not a pointer to one. Google's reviewers and
      // Stripe both check this, and "see our homepage" fails both.
      `Questions about this policy, requests to access or delete your data, and privacy complaints: ${site.supportEmail}. A person reads it.`,
      ...(site.legalEntity ? [`The Service is operated by ${site.legalEntity}.`] : []),
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper-warm">
      <header className="border-b border-line bg-paper">
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
          Last updated August 2, 2026. Plain language, describing what {site.name}{" "}
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
                    className="rounded-xl border border-line bg-paper p-4 text-[14px] leading-relaxed text-ink/80"
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
