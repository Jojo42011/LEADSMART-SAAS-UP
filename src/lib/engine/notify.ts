import { sendCustomerMail, customerMailReady } from "../mailer";
import { getTenantNotifyPrefs, recordNotification, notificationSentWithin } from "./store";
import { site } from "../site";
import { PLAN_GRACE_DAYS } from "./entitlement";

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
  /** Suppress if one of this kind already went out inside this window. */
  onceWithinHours?: number;
}): Promise<void> {
  try {
    if (input.onceWithinHours && (await notificationSentWithin(input.tenantEmail, input.kind, input.onceWithinHours))) {
      return;
    }
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
  // The number comes from the entitlement rule rather than being written
  // into the prose. An earlier version of this email promised the agent
  // "keeps running" while the scheduler cut service on the first decline —
  // the copy and the code disagreed, and the customer would have believed
  // the copy.
  const graceDays = PLAN_GRACE_DAYS;
  void deliver({
    tenantEmail: email,
    kind: "payment_failed",
    subject: `Action needed: your ${site.name} payment did not go through`,
    text: [
      "We could not charge the card on file for your subscription.",
      "",
      `Your agent keeps running for ${graceDays} more day${graceDays === 1 ? "" : "s"} while Stripe retries the card. If the payment still has not cleared by then, production stops — your published pages stay exactly where they are, and nothing is deleted.`,
      "",
      `Update your payment method: ${updateUrl}`,
      "",
      "If you think this is a mistake, or the card is fine and something else is going on, reply to this email.",
    ].join("\n"),
  });
}

/**
 * The agent has stopped because of billing.
 *
 * Transactional, so it ignores the publish-notice preference: this is the
 * product ceasing to do the thing it is paid for, and somebody who
 * switched off "tell me when a page goes live" has not consented to
 * silence about that.
 *
 * The copy is explicit that nothing is deleted. The fear on receiving
 * this mail is that a billing lapse costs you the work already done, and
 * leaving that unanswered is how a recoverable card problem turns into a
 * cancellation.
 */
export function notifyAgentSuspended(email: string, reason: string): void {
  void deliver({
    tenantEmail: email,
    kind: "agent_suspended",
    // Webhook and reconciliation can both notice the same suspension.
    onceWithinHours: 24,
    subject: "Your Ascent agent has paused",
    text: [
      reason,
      "",
      "What this means:",
      "· The agent has stopped researching and publishing new pages.",
      "· Every page it already published stays exactly where it is. Nothing is deleted, and nothing is removed from your site.",
      "· Your keyword plan, settings and history are kept — the agent picks up where it left off the moment billing is sorted.",
      "",
      "Update your payment method from the Plan panel in your dashboard, and the agent restarts on the next cycle.",
      "",
      "If you think this is a mistake, reply to this email.",
    ].join("\n"),
  });
}

/** Billing recovered and production has restarted. */
export function notifyAgentResumed(email: string): void {
  void deliver({
    tenantEmail: email,
    kind: "agent_resumed",
    onceWithinHours: 24,
    subject: "Your Ascent agent is running again",
    text: [
      "Your payment went through and the agent is back at work.",
      "",
      "It resumes from where it stopped — the keyword plan and everything already published are intact, and the next page goes out on your normal cadence.",
    ].join("\n"),
  });
}

/**
 * A trial ending within a few days, sent once.
 *
 * Sent because the alternative is a customer discovering the end of their
 * trial as a charge they did not expect, or as an agent that stopped for
 * no reason they can see. Both are avoidable with three days' notice.
 */
export function notifyTrialEnding(email: string, daysLeft: number, amount: string): void {
  void deliver({
    tenantEmail: email,
    kind: "trial_ending",
    // Recomputed from the trial date on every heartbeat, so without this
    // it would send once a day through the whole warning window.
    onceWithinHours: 72,
    subject: `Your Ascent trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    text: [
      `Your free trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}, and the card on file will be charged ${amount}.`,
      "",
      "Nothing changes if you do nothing — the agent keeps publishing on your cadence.",
      "",
      "If you would rather not continue, cancel from the Plan panel in your dashboard before then and you will not be charged. Pages already published stay on your site either way.",
    ].join("\n"),
  });
}
