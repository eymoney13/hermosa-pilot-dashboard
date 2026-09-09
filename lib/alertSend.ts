import "server-only";
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

const FROM = "Project Neptune <alerts@projectneptune.co>";
// Replies reach a person rather than a send-only mailbox nobody reads.
const REPLY_TO = "ethan@projectneptune.co";

export interface SendSummary {
  location: string;
  predictionDate: string | null;
  elevated: string[]; // station codes elevated today
  newlyElevated: string[]; // ...of those, the ones that just crossed over
  recipients: number;
  sent: number;
  failed: number;
  skipped?: string; // set when the location was skipped, with the reason
}

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

export function isAlertSendingConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.RESEND_API_KEY);
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

// Send one message through Resend. Returns true when Resend accepted it.
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
  oneClickUrl: string
): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      reply_to: REPLY_TO,
      to: [to],
      subject,
      html,
      text,
      // Gmail and Outlook render their own one-click unsubscribe from these,
      // which is what keeps a list off the spam-complaint path. RFC 8058.
      headers: {
        "List-Unsubscribe": `<${oneClickUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (!res.ok) {
    console.error("[alerts/send] resend rejected", res.status, await res.text());
    return false;
  }
  return true;
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
  today: string
): Promise<SendSummary> {
  const base: SendSummary = {
    location: config.slug,
    predictionDate: null,
    elevated: [],
    newlyElevated: [],
    recipients: 0,
    sent: 0,
    failed: 0,
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

    const ok = await sendEmail(entry.email, subject, html, text, oneClickUrl);
    if (!ok) {
      base.failed += 1;
      continue;
    }
    base.sent += 1;

    // Recorded only after Resend accepts it, so a failed send is retried by the
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

export async function sendAllAlerts(today: string): Promise<SendSummary[]> {
  const summaries: SendSummary[] = [];
  for (const config of alertEnabledLocations()) {
    summaries.push(await sendAlertsForLocation(config, today));
  }
  return summaries;
}
