import "server-only";
import { fromAddressEmail, resendApiKey } from "./alertProvider";
import { guardRecipient } from "./mailGuard";

// Pro account mail (activation, recovery, lifecycle reminders) goes out through
// Resend from the same verified domain as beach alerts, with replies to a person.
//
// It used to go through Gmail SMTP, logging in as PRO_ACTIVATION_EMAIL_FROM. That
// tied the From address to whichever Google account owned the app password, gave
// no Reply-To, and left Preview with no way to send at all.
//
//   From:     PRO_EMAIL_FROM, else "Neptune Pro <address of ALERT_FROM_ADDRESS>"
//   Reply-To: ALERT_REPLY_TO, else ethan@projectneptune.co
//   Key:      resendApiKey(), the same key alerts use (ALERT_RESEND_API_KEY first)
//
// Outside production every message is rerouted by lib/mailGuard.ts.

export interface ProMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function proMailFrom(): string | null {
  const explicit = process.env.PRO_EMAIL_FROM?.trim();
  if (explicit && fromAddressEmail(explicit)) {
    return explicit.includes("<") ? explicit : `Neptune Pro <${explicit}>`;
  }
  const address = fromAddressEmail(process.env.ALERT_FROM_ADDRESS);
  return address ? `Neptune Pro <${address}>` : null;
}

/** True when Pro mail can actually be sent. Checkout refuses to start otherwise. */
export function proMailConfigured(): boolean {
  return Boolean(resendApiKey() && proMailFrom());
}

export async function sendProMail(mail: ProMail, fetchImpl: typeof fetch = fetch): Promise<void> {
  const apiKey = resendApiKey();
  const from = proMailFrom();
  if (!apiKey || !from) throw new Error("Pro email is not configured");
  const { to, subject } = guardRecipient(mail.to, mail.subject);
  const res = await fetchImpl(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html: mail.html,
      text: mail.text,
      reply_to: process.env.ALERT_REPLY_TO ?? "ethan@projectneptune.co",
      ...(mail.headers ? { headers: mail.headers } : {}),
    }),
  });
  if (!res.ok) {
    // Status and Resend's error name only: the body can echo the recipient.
    let name = "";
    try { name = String(((await res.json()) as { name?: unknown })?.name ?? ""); } catch {}
    throw new Error(`Resend rejected Pro email (${res.status}${name ? ` ${name}` : ""})`);
  }
}
