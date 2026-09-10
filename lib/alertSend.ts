import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { neon } from "@neondatabase/serverless";
import { LOCATIONS, type BeachData, type LocationConfig } from "./data";
import { featuresFor } from "./features";
import { loadDashboardData } from "./loadData";
import { composeAlertEmail, type AlertedBeach } from "./alertMail";

// The daily alert run: find the beaches that came back elevated, work out who
// asked to hear about them, and send one email per person.
//
// Three rules shape this, and each exists to stop a specific way an alert list
// turns into spam:
//
//  1. ONLY "Not recommended" (the 50%+ tier) counts as elevated. The yellow
//     "Slightly elevated" tier fires far too often to stay meaningful.
//  2. A beach is only worth an email the day it BECOMES elevated. Staying
//     elevated for a week is one email, not seven (see isNewlyElevated).
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
  newlyElevated: string[]; // ...of those, the ones that just crossed over
  recipients: number;
  sent: number;
  failed: number;
  skipped?: string; // set when the location was skipped, with the reason
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
  return Boolean(process.env.DATABASE_URL && process.env.GMAIL_APP_PASSWORD);
}

/**
 * Did this beach just cross into "Not recommended", or was it already there?
 *
 * Read off the day before this run in the beach's own history, which the board
 * already loads. A beach with no history behind it counts as newly elevated:
 * on a board's first run everything is new, and staying quiet then would mean
 * the alerts never start.
 */
export function isNewlyElevated(beach: BeachData): boolean {
  if (beach.status !== "Not recommended") return false;
  // pastDays is chronological, so the last entry is the day before today's run.
  const yesterday = beach.pastDays.at(-1);
  if (!yesterday) return true;
  return yesterday.status !== "Not recommended";
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
    console.error("[alerts/send] smtp rejected", err);
    return false;
  }
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
  dryRun = false
): Promise<SendSummary> {
  const base: SendSummary = {
    location: config.slug,
    predictionDate: null,
    elevated: [],
    newlyElevated: [],
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

  const elevated = beaches.filter((b) => b.status === "Not recommended");
  base.elevated = elevated.map((b) => b.code);

  const newly = elevated.filter(isNewlyElevated);
  base.newlyElevated = newly.map((b) => b.code);
  if (newly.length === 0) return base;

  const sql = db();
  const codes = newly.map((b) => b.code);

  // Everyone subscribed to at least one newly elevated beach here, and which of
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

  const beachByCode = new Map(newly.map((b) => [b.code, b]));

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
      config.slug,
      unsubscribeUrl
    );

    if (dryRun) {
      // Everything above this line is the real thing: the roster read, the
      // staleness check, the newly-elevated rule and the join that excludes
      // anyone already told. Only the two actions with consequences are
      // skipped - the send, and the alert_notifications write below. Recording
      // a rehearsal would mark people as notified and silently cancel the real
      // alert that follows.
      base.wouldNotify?.push({ email: entry.email, stations: alerted.map((b) => b.code) });
      continue;
    }

    const ok = await sendEmail(entry.email, subject, html, text, oneClickUrl);
    if (!ok) {
      base.failed += 1;
      continue;
    }
    base.sent += 1;

    // Recorded only after the mail server accepts it, so a failed send is retried by the
    // next run rather than being silently marked as delivered.
    for (const code of entry.stations) {
      await sql`
        INSERT INTO alert_notifications (subscriber_id, station_code, last_notified_date)
        VALUES (${subscriberId}, ${code}, ${predictionDate}::date)
        ON CONFLICT (subscriber_id, station_code)
          DO UPDATE SET last_notified_date = EXCLUDED.last_notified_date,
                        updated_at = now()
      `;
    }
  }

  return base;
}

// Every location whose board offers alerts. Driven off the same feature flag
// the signup card is, so turning a board on turns on both halves at once.
export function alertEnabledLocations(): LocationConfig[] {
  return Object.values(LOCATIONS).filter((c) => featuresFor(c.slug).beachAlerts);
}

export async function sendAllAlerts(
  today: string,
  dryRun = false
): Promise<SendSummary[]> {
  const summaries: SendSummary[] = [];
  for (const config of alertEnabledLocations()) {
    summaries.push(await sendAlertsForLocation(config, today, dryRun));
  }
  return summaries;
}
