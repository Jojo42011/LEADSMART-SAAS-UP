import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { insertSupportMessage, markSupportDelivered, storeConfigured } from "@/lib/engine/store";
import { sendSupportMail, mailConfigured, SUPPORT_INBOX } from "@/lib/mailer";

/**
 * Receives a support enquiry: stores it, then tries to email it on.
 *
 * Deliberately open to signed-out visitors — someone who cannot sign in is
 * exactly the person who most needs to reach support. When a session does
 * exist its email is recorded alongside the message so an enquiry can be
 * tied to an account without the sender having to quote an id.
 *
 * The reply distinguishes "stored and emailed" from "stored but not
 * emailed". Reporting a send that did not happen would leave someone
 * waiting on an answer to a message nobody was ever going to see.
 */
export async function POST(req: NextRequest) {
  let body: { name?: string; email?: string; subject?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const name = (body.name || "").trim().slice(0, 120);
  const email = (body.email || "").trim().slice(0, 200);
  const subject = (body.subject || "").trim().slice(0, 200);
  const message = (body.message || "").trim().slice(0, 8000);

  if (!email || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Enter an email address we can reply to." },
      { status: 400 }
    );
  }
  if (message.length < 10) {
    return NextResponse.json(
      { ok: false, error: "Tell us a little more about what you need — at least a sentence." },
      { status: 400 }
    );
  }

  const session = readSession(req);

  let id: string | null = null;
  try {
    id = await insertSupportMessage({
      name,
      email,
      subject: subject || "Support enquiry",
      message,
      tenantEmail: session?.email ?? null,
    });
  } catch {
    // A store failure must not swallow the enquiry: fall through and try
    // to send it anyway. Email alone is a worse record than email plus a
    // row, but it is far better than nothing.
  }

  const result = await sendSupportMail({
    subject: `[Ascent support] ${subject || "New enquiry"}`,
    replyTo: email,
    text: [
      `From: ${name || "(no name given)"} <${email}>`,
      session?.email ? `Signed in as: ${session.email}` : "Not signed in",
      "",
      message,
    ].join("\n"),
  });

  if (id) {
    await markSupportDelivered(
      id,
      result.delivered,
      result.delivered ? undefined : result.reason
    ).catch(() => {});
  }

  if (result.delivered) {
    return NextResponse.json({ ok: true, delivered: true });
  }

  // Stored but undeliverable. Say so, and hand back the inbox address so
  // the sender can mail it directly rather than wait on silence.
  return NextResponse.json({
    ok: true,
    delivered: false,
    stored: Boolean(id),
    inbox: SUPPORT_INBOX,
    reason: mailConfigured()
      ? "The mail service rejected the send."
      : "Email delivery isn't switched on for this deployment yet.",
    detail: result.reason,
  });
}

/** Lets the page show the real inbox address rather than hard-coding it twice. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    inbox: SUPPORT_INBOX,
    mail: mailConfigured(),
    store: storeConfigured(),
  });
}
