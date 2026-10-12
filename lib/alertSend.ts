import "server-only";
import { sendSandboxAlerts } from "./sandboxAlertSend";
import nodemailer, { type Transporter } from "nodemailer";
import { neon } from "@neondatabase/serverless";
import { LOCATIONS, type BeachData, type LocationConfig } from "./data";
import { featuresFor } from "./features";
import { loadDashboardData } from "./loadData";
import { composeAlertEmail, type AlertedBeach } from "./alertMail";
import {
  configuredProvider,
  createResendSender,
  fromAddressEmail,
  resendApiKey,
  type AlertSender,
  type OutboundAlert,
} from "./alertProvider";

// The daily alert run: find the beaches that came back elevated, work out who
// asked to hear about them, and send one email per person.
//
// Three rules shape this, and each exists to stop a specific way an alert list
// turns into spam:
//
//  1. ONLY "Not recommended" (the 50%+ tier) counts as elevated. The yellow
//     "Slightly elevated" tier fires far too often to stay meaningful.
//  2. A beach elevated today is worth an email today, whether or not it was
//     elevated yesterday. This is a daily "is my beach safe this morning"
//     read, not a notification about a change of state: someone deciding
//     whether to swim needs telling on day three of a bad stretch as much as
//     on day one. What stops it becoming repetitive is the dedupe below, which
//     is keyed on the PREDICTION DATE - so a stretch sends one email per day,
//     and re-running a day's refresh sends nothing extra.
//  3. A subscriber gets ONE email covering all of their elevated beaches, not
//     one per beach.

// Where the unsubscribe links point.
const SITE_ORIGIN = "https://dashboard.projectneptune.co";

// Sent through the Google Workspace mailbox that already owns this domain, so
// no new DNS is needed - Google's own SPF and DKIM already cover it.
//
// Google will only accept a From that is the authenticated account itself or an
// alias verified under Gmail's "Send mail as", which is why this is ethan@ and
// not alerts@. Adding alerts@ as a Workspace alias and verifying it in Gmail is
// all it would take to change this one line.
const GMAIL_USER = process.env.GMAIL_USER ?? "ethan@projectneptune.co";

// The visible sender, which is NOT necessarily the account that authenticates.
// Google accepts a From that is either the authenticated account or an address
// registered under Gmail's "Send mail as"; alerts@ is a Workspace alias set up
// that way, so it can front the mail while ethan@ does the logging in.
//
// If the alias is ever removed from "Send mail as", Google silently rewrites
// the From back to GMAIL_USER rather than failing, so a test send is the only
// way to confirm this is actually taking effect.
const FROM_ADDRESS = process.env.GMAIL_FROM ?? GMAIL_USER;
const FROM = `Project Neptune <${FROM_ADDRESS}>`;
// Replies go to a mailbox a person actually reads, not the alias.
const REPLY_TO = process.env.GMAIL_REPLY_TO ?? "ethan@projectneptune.co";

export interface SendSummary {
  location: string;
  predictionDate: string | null;
  elevated: string[]; // station codes elevated today
  recipients: number;
  sent: number;
  failed: number;
  skipped?: string; // set when the location was skipped, with the reason
  // Claims the database refused because the row was already 'sent' or held by
  // a concurrent run. Not a failure: it is the duplicate guard doing its job.
  skippedDuplicates?: number;
  // Set on a rehearsal. `sent` stays 0 and wouldNotify carries who a real run
  // would have mailed, so a dry run can never be mistaken for a send.
  dryRun?: boolean;
  wouldNotify?: { email: string; stations: string[] }[];
}

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

export function isAlertSendingConfigured(): boolean {
  if (!process.env.DATABASE_URL) return false;
  // Same two conditions createResendSender() enforces, so the route's
  // readiness check and the sender can never disagree about whether a run is
  // configured. ALERT_FROM_ADDRESS is required outright -- RESEND_EMAIL_DOMAIN
  // is deliberately not accepted as a substitute, see resendFrom().
  return configuredProvider() === "resend"
    ? Boolean(resendApiKey() && fromAddressEmail(process.env.ALERT_FROM_ADDRESS))
    : Boolean(process.env.GMAIL_APP_PASSWORD);
}

// One SMTP connection reused across a run, rather than a fresh handshake per
// recipient. Built lazily so importing this module never opens a socket.
let transport: Transporter | null = null;

function mailer(): Transporter {
  if (transport) return transport;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) throw new Error("GMAIL_APP_PASSWORD is not configured");
  transport = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      // A Google app password, not the account password. Shown with spaces in
      // Google's UI and pasted that way often enough to be worth stripping.
      pass: pass.replace(/\s+/g, ""),
    },
  });
  return transport;
}

// Reuse the alert transport for accountless ownership verification.
export async function sendAlertVerification(to: string, code: string): Promise<void> {
  await mailer().sendMail({from: FROM, replyTo: REPLY_TO, to,
    subject: "Your Neptune email verification code",
    text: `Your Neptune code is ${code}. It expires in 10 minutes. Enter it on the California dashboard to manage your beach alerts. If you did not request this, ignore this email.`});
}

// Send one message. Returns true when the SMTP server accepted it.
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
  oneClickUrl: string
): Promise<boolean> {
  try {
    await mailer().sendMail({
      from: FROM,
      replyTo: REPLY_TO,
      to,
      subject,
      html,
      text,
      headers: {
        // Gmail and Outlook render their own one-click unsubscribe from these,
        // which is what keeps a list off the spam-complaint path. RFC 8058.
        "List-Unsubscribe": `<${oneClickUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    return true;
  } catch (err) {
    // Drop the cached transport. A dead or throttled Gmail connection used to
    // stay cached for the life of the lambda, so the first rejection in a run
    // turned into a rejection for every remaining recipient -- which is how
    // 2026-10-12 produced 69 failed and 0 sent. The next send rebuilds it.
    transport = null;
    // err can carry the envelope, and the envelope carries the recipient.
    console.error("[alerts/send] smtp rejected", errorCode(err));
    return false;
  }
}

/** A short, non-identifying reason string. Never an address, never a secret. */
function errorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { code?: unknown; responseCode?: unknown };
    if (typeof e.code === "string") return e.code;
    if (typeof e.responseCode === "number") return `smtp_${e.responseCode}`;
  }
  return "unknown_error";
}

/** Gmail, wrapped in the provider interface so the run is transport-agnostic. */
function gmailSender(): AlertSender {
  return {
    name: "gmail",
    async send(msg: OutboundAlert): Promise<
      { ok: true; id: string | null; deduplicated: boolean } | { ok: false; code: string; retryable: boolean }
    > {
      const ok = await sendEmail(msg.to, msg.subject, msg.html, msg.text, msg.oneClickUrl);
      // SMTP gives no message id back through this path, and no way to tell a
      // throttle from a hard bounce, so every failure is treated as retryable.
      return ok
        ? { ok: true, id: null, deduplicated: false }
        : { ok: false, code: "smtp_rejected", retryable: true };
    },
  };
}

/** The transport this run should use. Injectable so tests never touch a network. */
export function alertSender(): AlertSender {
  return configuredProvider() === "resend" ? createResendSender() : gmailSender();
}

/**
 * Stable, non-reversible id for a recipient, so an idempotency key can be
 * per-person without carrying the person's address.
 */
export function recipientTag(email: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < email.length; i++) {
    h ^= email.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * Run the alert pass for one location.
 *
 * `today` is the date the run considers current, as YYYY-MM-DD. A location
 * whose published forecast is not for that date is SKIPPED rather than mailed
 * about: the daily refresh occasionally leaves one board a day behind, and an
 * alert about yesterday's water is worse than no alert.
 */
export async function sendAlertsForLocation(
  config: LocationConfig,
  today: string,
  dryRun = false,
  // Injected by tests so no test can reach a real mail provider.
  sender: AlertSender = alertSender()
): Promise<SendSummary> {
  const base: SendSummary = {
    location: config.slug,
    predictionDate: null,
    elevated: [],
    recipients: 0,
    sent: 0,
    failed: 0,
    ...(dryRun ? { dryRun: true, wouldNotify: [] } : {}),
  };

  const { beaches, predictionDate } = await loadDashboardData(config);
  base.predictionDate = predictionDate || null;

  if (!predictionDate) {
    return { ...base, skipped: "no forecast published" };
  }
  if (predictionDate !== today) {
    return {
      ...base,
      skipped: `stale forecast (${predictionDate}, expected ${today})`,
    };
  }

  if (config.slug === "sandbox" || config.slug === "california") {
    // Keeps its own lease/state machine in sandbox_alert_delivery, which
    // already prevents duplicates, so only the transport changes here. The key
    // identifies the person without carrying their address.
    const send = async (
      to: string, subject: string, html: string, text: string, oneClickUrl: string
    ): Promise<boolean> => {
      const key = `alert:${config.slug}:${recipientTag(to)}:${predictionDate}`;
      const outcome = await sender.send({ to, subject, html, text, oneClickUrl }, key);
      return outcome.ok;
    };
    return sendSandboxAlerts(beaches, predictionDate, dryRun, send);
  }

  const elevated = beaches.filter((b) => b.status === "Not recommended");
  base.elevated = elevated.map((b) => b.code);

  if (elevated.length === 0) return base;

  const sql = db();
  const codes = elevated.map((b) => b.code);

  // Everyone subscribed to at least one elevated beach here, and which of
  // those beaches they have NOT already been told about for this date. The
  // date check is what makes a second run of the job on the same day a no-op.
  const rows = await sql`
    SELECT s.id, s.email, s.unsubscribe_token, x.station_code
    FROM alert_subscribers s
    JOIN alert_subscriptions x ON x.subscriber_id = s.id
    LEFT JOIN alert_notifications n
      ON n.subscriber_id = s.id AND n.station_code = x.station_code
    WHERE s.location = ${config.slug}
      AND x.station_code = ANY(${codes}::text[])
      AND (s.location <> 'southbay' OR EXISTS (
        SELECT 1 FROM legacy_alert_grants g
        WHERE g.subscriber_id = s.id AND g.station_code = x.station_code
      ))
      AND NOT EXISTS (
        SELECT 1 FROM alert_subscribers paid
        JOIN alert_subscriptions px ON px.subscriber_id = paid.id
        JOIN sandbox_alert_delivery d ON d.subscriber_id = paid.id
        LEFT JOIN pro_subscriptions p ON p.clerk_user_id = d.clerk_user_id
        WHERE paid.email = s.email AND paid.location = 'sandbox'
          AND px.station_code = x.station_code
          AND ((d.free_enabled AND d.clerk_user_id IS NULL) OR (p.status IN ('active','trialing','past_due')
          AND (p.current_period_end IS NULL OR p.current_period_end > now())))
      )
      AND NOT EXISTS (
        SELECT 1 FROM alert_subscribers other
        JOIN alert_notifications sent ON sent.subscriber_id = other.id
        WHERE other.email = s.email AND other.location IN ('sandbox','southbay')
          AND sent.station_code = x.station_code AND sent.last_notified_date >= ${predictionDate}::date
      )
      AND (n.last_notified_date IS NULL OR n.last_notified_date <> ${predictionDate}::date)
  `;

  // Group into one message per person, so somebody following three beaches that
  // all turned today gets one email listing three, not three emails.
  const bySubscriber = new Map<
    number,
    { email: string; token: string; stations: string[] }
  >();
  for (const row of rows) {
    const id = row.id as number;
    const entry = bySubscriber.get(id) ?? {
      email: row.email as string,
      token: row.unsubscribe_token as string,
      stations: [],
    };
    entry.stations.push(row.station_code as string);
    bySubscriber.set(id, entry);
  }
  base.recipients = bySubscriber.size;

  const beachByCode = new Map(elevated.map((b) => [b.code, b]));
  const work: SendJob[] = [];

  for (const [subscriberId, entry] of bySubscriber) {
    const alerted: AlertedBeach[] = entry.stations
      .map((code) => beachByCode.get(code))
      .filter((b): b is BeachData => b != null)
      // Worst first: the reason they opened the email is the highest number.
      .sort((a, b) => b.probability - a.probability)
      .map((b) => ({
        code: b.code,
        name: b.name,
        probability: b.probability,
        status: b.status,
      }));
    if (alerted.length === 0) continue;

    // Two URLs, deliberately. The link in the body goes to a page that shows
    // the reader what they are unsubscribing from; the List-Unsubscribe header
    // must point at something that accepts a bare POST, because that is what
    // Gmail's own unsubscribe control sends.
    const unsubscribeUrl = `${SITE_ORIGIN}/unsubscribe/${entry.token}`;
    const oneClickUrl = `${SITE_ORIGIN}/api/alerts/unsubscribe/${entry.token}`;
    const { subject, html, text } = composeAlertEmail(
      alerted,
      predictionDate,
      config.slug === "southbay" ? "california" : config.slug,
      unsubscribeUrl
    );

    if (dryRun) {
      // Everything above this line is the real thing: the roster read, the
      // staleness check, the elevated-tier rule and the join that excludes
      // anyone already told. Only the two actions with consequences are
      // skipped - the send, and the alert_notifications write below. Recording
      // a rehearsal would mark people as notified and silently cancel the real
      // alert that follows.
      base.wouldNotify?.push({ email: entry.email, stations: alerted.map((b) => b.code) });
      continue;
    }

    work.push({ subscriberId, email: entry.email, stations: entry.stations, subject, html, text, oneClickUrl });
  }

  if (dryRun) return base;

  // Claim -> send -> settle, a few at a time.
  //
  // Serial sends inside one request is what put the old run at the mercy of
  // its own duration: 69 of them is where it fell over, and thousands could
  // never finish inside maxDuration at all. Resend's documented limit is 10
  // requests/second per team, so the pool stays under that rather than at it.
  const results = await pool(work, SEND_CONCURRENCY, async (job) => {
    const key = `alert:${config.slug}:${job.subscriberId}:${predictionDate}`;

    // The database, not this code, decides whether this send may happen. A
    // second concurrent run claims nothing and sends nothing.
    const claimed = await claimDelivery(sql, job.subscriberId, predictionDate, job.stations, key);
    if (!claimed) return "skipped" as const;

    const outcome = await sender.send(
      { to: job.email, subject: job.subject, html: job.html, text: job.text, oneClickUrl: job.oneClickUrl },
      key
    );

    if (outcome.ok) {
      // ACCEPTED, not delivered. The provider has taken responsibility for the
      // message; whether it reaches an inbox is only knowable from the
      // provider's own delivery events, which this code does not see.
      await settleSent(sql, job.subscriberId, predictionDate, sender.name, outcome.id);
      for (const code of job.stations) {
        await sql`
          INSERT INTO alert_notifications (subscriber_id, station_code, last_notified_date)
          VALUES (${job.subscriberId}, ${code}, ${predictionDate}::date)
          ON CONFLICT (subscriber_id, station_code)
            DO UPDATE SET last_notified_date = EXCLUDED.last_notified_date,
                          updated_at = now()
        `;
      }
      return "sent" as const;
    }

    // Left as 'failed' with the lease cleared, so the next run picks it up
    // again. A permanent rejection is recorded the same way but will simply
    // fail again rather than being retried forever by this run.
    await settleFailed(sql, job.subscriberId, predictionDate, sender.name, outcome.code);
    return "failed" as const;
  });

  for (const r of results) {
    if (r === "sent") base.sent += 1;
    else if (r === "failed") base.failed += 1;
    else base.skippedDuplicates = (base.skippedDuplicates ?? 0) + 1;
  }

  return base;
}

const SEND_CONCURRENCY = 4;
const LEASE_MINUTES = 5;

interface SendJob {
  subscriberId: number;
  email: string;
  stations: string[];
  subject: string;
  html: string;
  text: string;
  oneClickUrl: string;
}

type Sql = ReturnType<typeof db>;

/**
 * Reserve this person's email for this date, or return false because somebody
 * else holds it or it already went.
 *
 * The PRIMARY KEY (subscriber_id, prediction_date) is what makes this safe:
 * two runs racing cannot both insert, and the DO UPDATE only fires when the
 * row is not already 'sent' and its lease has expired. A crashed run therefore
 * costs one lease period, not the alert -- which is the difference between
 * this and simply writing a pending row and never retrying it.
 *
 * The idempotency key is COALESCEd, never overwritten, so every retry of the
 * same person/date reaches the provider under the key it used the first time.
 */
async function claimDelivery(
  sql: Sql,
  subscriberId: number,
  predictionDate: string,
  stations: string[],
  key: string
): Promise<boolean> {
  const rows = await sql`
    INSERT INTO alert_deliveries
      (subscriber_id, prediction_date, status, stations, idempotency_key, attempts, lease_until)
    VALUES
      (${subscriberId}, ${predictionDate}::date, 'sending', ${stations}, ${key}, 1,
       now() + (${LEASE_MINUTES} || ' minutes')::interval)
    ON CONFLICT (subscriber_id, prediction_date) DO UPDATE
      SET status      = 'sending',
          attempts    = alert_deliveries.attempts + 1,
          stations    = EXCLUDED.stations,
          lease_until = now() + (${LEASE_MINUTES} || ' minutes')::interval,
          updated_at  = now()
      WHERE alert_deliveries.status <> 'sent'
        AND (alert_deliveries.lease_until IS NULL OR alert_deliveries.lease_until < now())
    RETURNING subscriber_id
  `;
  return rows.length > 0;
}

async function settleSent(
  sql: Sql,
  subscriberId: number,
  predictionDate: string,
  provider: string,
  messageId: string | null
): Promise<void> {
  await sql`
    UPDATE alert_deliveries
       SET status = 'sent', provider = ${provider}, provider_message_id = ${messageId},
           last_error = NULL, lease_until = NULL, updated_at = now()
     WHERE subscriber_id = ${subscriberId} AND prediction_date = ${predictionDate}::date
  `;
}

async function settleFailed(
  sql: Sql,
  subscriberId: number,
  predictionDate: string,
  provider: string,
  code: string
): Promise<void> {
  await sql`
    UPDATE alert_deliveries
       SET status = 'failed', provider = ${provider}, last_error = ${code},
           lease_until = NULL, updated_at = now()
     WHERE subscriber_id = ${subscriberId} AND prediction_date = ${predictionDate}::date
  `;
}

/** Run `fn` over `items`, at most `limit` in flight. Order is not preserved. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out.push(await fn(items[i]));
    }
  });
  await Promise.all(workers);
  return out;
}

// Every location whose board offers alerts. Driven off the same feature flag
// the signup card is, so turning a board on turns on both halves at once.
export function alertEnabledLocations(): LocationConfig[] {
  return Object.values(LOCATIONS).filter((c) => c.slug !== "sandbox" && featuresFor(c.slug).beachAlerts);
}

export async function sendAllAlerts(
  today: string,
  dryRun = false,
  sender: AlertSender = alertSender()
): Promise<SendSummary[]> {
  const summaries: SendSummary[] = [];
  for (const config of alertEnabledLocations()) {
    summaries.push(await sendAlertsForLocation(config, today, dryRun, sender));
  }
  return summaries;
}
