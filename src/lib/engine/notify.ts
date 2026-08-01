import { sendCustomerMail, customerMailReady } from "../mailer";
import { getTenantNotifyPrefs, recordNotification } from "./store";
import { site } from "../site";

/**
 * Customer notices: welcome, page published, payment failed.
 *
 * Every send is best effort and never blocks the thing that triggered it.
 * A publish that succeeded must not be reported as failed because an
 * email bounced, and a cycle must not be slowed by SMTP — so callers fire
 * these without awaiting a result they would not act on anyway.
 *
 * Each send is recorded, delivered or not, for the same reason support
 * enquiries are: "we emailed them" and "the email arrived" are different
 * claims, and only one of them is ours to make.
 */

const FOOTER = (email: string) =>
  `\n\n—\n${site.name} · ${site.tagline}\nSent to ${email}. Manage notifications in your dashboard under Settings.`;

async function deliver(input: {
  tenantEmail: string;
  kind: string;
  subject: string;
  text: string;
  /** Notices the owner can switch off. Transactional mail ignores this. */
  optional?: boolean;
}): Promise<void> {
  try {
    if (input.optional) {
      const prefs = await getTenantNotifyPrefs(input.tenantEmail);
      if (prefs && !prefs.notifyPublishes) return;
    }
    const ready = customerMailReady();
    if (!ready.ready) {
      await recordNotification(input.tenantEmail, input.kind, false, ready.reason ?? "not configured");
      return;
    }
    const res = await sendCustomerMail({
      to: input.tenantEmail,
      subject: input.subject,
      text: input.text + FOOTER(input.tenantEmail),
    });
    await recordNotification(
      input.tenantEmail,
      input.kind,
      res.delivered,
      res.delivered ? null : res.reason
    );
  } catch {
    // Notification plumbing must never take down its caller.
  }
}

export function notifyWelcome(email: string, businessName: string, siteUrl: string): void {
  void deliver({
    tenantEmail: email,
    kind: "welcome",
    subject: `${site.name} is set up for ${businessName}`,
    text: [
      `Your agent is connected to ${siteUrl} and will start researching keywords and writing pages on the schedule you chose.`,
      "",
      "What happens next:",
      "· The agent researches your market and builds a keyword plan.",
      "· It writes one page per cycle, audits it, and only publishes what clears the quality gate.",
      "· Pages that miss the gate are held rather than published — you will see them, and why, in your dashboard.",
      "",
      "You can pause production at any time with the switch at the top of the dashboard, and every page it publishes can be deleted from there too — which removes it from your live site as well.",
      "",
      "Reply to this email if anything looks wrong. A person reads it.",
    ].join("\n"),
  });
}

export function notifyPagePublished(input: {
  email: string;
  businessName: string;
  title: string;
  keyword: string;
  liveUrl: string;
  auditScore: number;
  auditGrade: string;
}): void {
  void deliver({
    tenantEmail: input.email,
    kind: "page_published",
    optional: true,
    subject: `New page live on ${input.businessName}: ${input.title}`,
    text: [
      `Your agent published a new page and verified it is live.`,
      "",
      `Page:    ${input.title}`,
      `Targets: ${input.keyword}`,
      `Quality: ${input.auditScore}/100 (${input.auditGrade})`,
      `Live at: ${input.liveUrl}`,
      "",
      "It has been added to your sitemap and submitted for indexing. Search engines and AI answer engines typically take a few days to a few weeks to pick up a new page.",
      "",
      "If anything about it looks wrong, you can delete it from your dashboard — that removes it from your live site too.",
    ].join("\n"),
  });
}

export function notifyPaymentFailed(email: string, updateUrl: string): void {
  void deliver({
    tenantEmail: email,
    kind: "payment_failed",
    subject: `Action needed: your ${site.name} payment did not go through`,
    text: [
      "We could not charge the card on file for your subscription.",
      "",
      "Your agent keeps running for now. Stripe will retry over the next few days, and if the payment still does not clear, production stops and your published pages stay exactly where they are — nothing is deleted.",
      "",
      `Update your payment method: ${updateUrl}`,
      "",
      "If you think this is a mistake, or the card is fine and something else is going on, reply to this email.",
    ].join("\n"),
  });
}
