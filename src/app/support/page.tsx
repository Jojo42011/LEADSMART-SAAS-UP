import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";
import { Footer } from "@/components/marketing/Footer";
import { ContactForm } from "@/components/support/ContactForm";
import { site } from "@/lib/site";
import { SUPPORT_INBOX } from "@/lib/mailer";

export const metadata: Metadata = {
  title: "Support",
  description: `Get help with ${site.name} — reach a person about your account, your agent, or a page it published.`,
};

/**
 * Reachable signed in or signed out, and linked from both the dashboard
 * sidebar and the marketing footer: someone locked out of their account is
 * exactly the person who needs this page most, so it must never sit behind
 * the session it might be about.
 */

const answers = [
  {
    q: "A page the agent published looks wrong",
    a: "Paste the page URL in your message. Every page carries its audit score and the run that produced it, so we can trace exactly what was generated and why it passed the gate.",
  },
  {
    q: "The agent has stopped producing pages",
    a: "Check the agent switch at the top of your dashboard first — if it reads Paused, resume it. The Analytics tab shows the last cycle and when the next one is due. If it says running but nothing is arriving, write in.",
  },
  {
    q: "Billing, plan changes, or cancelling",
    a: "Send the email address on the account and what you'd like changed. Subscriptions are handled through Stripe and can be cancelled at any time.",
  },
  {
    q: "Removing a page or taking your site off Ascent",
    a: "You can delete any published page from the dashboard, which also removes it from your repository and your sitemap. To disconnect entirely, say so and we'll walk you through revoking the publishing credentials.",
  },
];

export default function SupportPage() {
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
        <span className="label-mono text-accent">Support</span>
        <h1 className="font-display mt-4 text-4xl leading-[1.08] tracking-tight sm:text-5xl">
          Talk to us
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
          Questions about your account, your agent, or a page it published —
          send them here and they reach a person. We answer from{" "}
          <a
            href={`mailto:${SUPPORT_INBOX}`}
            className="text-ink underline underline-offset-2"
          >
            {SUPPORT_INBOX}
          </a>
          , usually within one business day.
        </p>

        <div className="mt-10">
          <ContactForm inbox={SUPPORT_INBOX} />
        </div>

        <section className="mt-14">
          <h2 className="text-[17px] font-medium tracking-tight">Before you write in</h2>
          <p className="mt-1.5 text-[13.5px] text-muted">
            A few things that are faster to fix yourself.
          </p>
          <ul className="mt-5 grid gap-3">
            {answers.map((item) => (
              <li key={item.q} className="rounded-xl border border-line bg-white p-4">
                <p className="text-[14px] font-medium">{item.q}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink/70">{item.a}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <Footer />
    </div>
  );
}
