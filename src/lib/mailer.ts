import nodemailer from "nodemailer";

/**
 * Outbound mail for support enquiries.
 *
 * Two transports, tried in order, because the right one depends on how far
 * along the deployment is:
 *
 *   SMTP  — works today with a Gmail app password and no domain of our own.
 *   Resend — HTTP API, for once a custom domain is verified and we want
 *            deliverability and logs rather than a personal mailbox.
 *
 * When neither is configured this reports that plainly instead of
 * returning success. A contact form that says "message sent" while nothing
 * left the building is worse than one that admits it cannot send: the
 * sender walks away believing they have been heard.
 */

export const SUPPORT_INBOX = process.env.SUPPORT_EMAIL || "toolascent@gmail.com";

export type MailResult =
  | { delivered: true; via: "smtp" | "resend" }
  | { delivered: false; reason: string };

export type Mail = {
  subject: string;
  text: string;
  /** The person who wrote in, so a plain Reply goes back to them. */
  replyTo?: string;
};

export function mailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY || (process.env.SMTP_USER && process.env.SMTP_PASS)
  );
}

export async function sendSupportMail(mail: Mail): Promise<MailResult> {
  const resendKey = process.env.RESEND_API_KEY;
  const smtpUser = process.env.SMTP_USER?.trim();
  // Google shows app passwords grouped as "abcd efgh ijkl mnop" and the
  // spaces are display only — pasted verbatim they authenticate as a
  // 19-character password and Gmail rejects the login. Stripping
  // whitespace here turns the single most likely setup mistake into a
  // non-event rather than an opaque 535.
  const smtpPass = process.env.SMTP_PASS?.replace(/\s+/g, "");

  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || "Ascent <onboarding@resend.dev>",
          to: [SUPPORT_INBOX],
          reply_to: mail.replyTo,
          subject: mail.subject,
          text: mail.text,
        }),
      });
      if (res.ok) return { delivered: true, via: "resend" };
      // Surface Resend's own words rather than a generic failure: the
      // usual cause is an unverified sending domain, and "domain not
      // verified" is the only message that tells you what to fix.
      const body = await res.text();
      return { delivered: false, reason: `Resend ${res.status}: ${body.slice(0, 300)}` };
    } catch (e) {
      return { delivered: false, reason: e instanceof Error ? e.message : "Resend request failed" };
    }
  }

  if (smtpUser && smtpPass) {
    try {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT || 465),
        secure: Number(process.env.SMTP_PORT || 465) === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
      await transport.sendMail({
        // Gmail rewrites From to the authenticated account anyway, so the
        // sender's address goes in Reply-To where it actually works.
        from: process.env.SMTP_FROM || `Ascent support <${smtpUser}>`,
        to: SUPPORT_INBOX,
        replyTo: mail.replyTo,
        subject: mail.subject,
        text: mail.text,
      });
      return { delivered: true, via: "smtp" };
    } catch (e) {
      return { delivered: false, reason: e instanceof Error ? e.message : "SMTP send failed" };
    }
  }

  return {
    delivered: false,
    reason:
      "No mail transport is configured on this deployment (set SMTP_USER and SMTP_PASS, or RESEND_API_KEY).",
  };
}

/**
 * Verifies the SMTP login without sending anything.
 *
 * Setup fails silently in a way that is miserable to debug — a wrong app
 * password looks identical to a working one until someone writes in and
 * never gets a reply. This proves the credentials authenticate, and
 * returns Gmail's own words when they don't.
 */
export async function probeMail(): Promise<{ ok: boolean; via: string; error: string | null }> {
  if (process.env.RESEND_API_KEY) {
    // Resend has no cheap auth-only endpoint that doesn't send, so this
    // reports configuration rather than claiming a verified connection.
    return { ok: true, via: "resend", error: null };
  }
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "");
  if (!user || !pass) {
    return { ok: false, via: "none", error: "SMTP_USER and SMTP_PASS are not both set." };
  }
  try {
    const port = Number(process.env.SMTP_PORT || 465);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transport.verify();
    return { ok: true, via: "smtp", error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "SMTP verify failed";
    const hint = /535|Username and Password not accepted|BadCredentials/i.test(msg)
      ? " Gmail rejected the login. SMTP_PASS must be a 16-character App Password created under Google Account > Security > 2-Step Verification > App passwords — a normal account password will always fail here."
      : "";
    return { ok: false, via: "smtp", error: `${msg}${hint}` };
  }
}
