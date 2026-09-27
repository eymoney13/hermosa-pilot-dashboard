import "server-only";
import { neon } from "@neondatabase/serverless";
import { isValidEmail, normalizeEmail } from "./alerts";

// Reading and editing one person's alert list, a beach at a time.
//
// SEPARATE FILE ON PURPOSE. lib/alerts.ts is shared with /southbay's signup
// form and is off-limits for this UI work, so nothing here modifies it — the
// two helpers it already exports are imported so both paths agree on what one
// address is.
//
// It also cannot do the job on its own: subscribe() rejects an empty station
// list ("Select at least one beach"), which is correct for a form whose only
// submit means "here is my whole selection", but makes "unsubscribe from my
// last beach" impossible to express. That case needs the delete below.

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

/** The station codes this address currently gets alerts for on this board. */
export async function listAlertStations(
  emailRaw: string,
  location: string
): Promise<string[]> {
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) return [];
  const rows = (await db()`
    SELECT x.station_code
      FROM alert_subscribers s
      JOIN alert_subscriptions x ON x.subscriber_id = s.id
     WHERE s.email = ${email} AND s.location = ${location}
     ORDER BY x.station_code
  `) as Array<{ station_code: string }>;
  return rows.map((r) => r.station_code);
}

/**
 * Replace this address's list for this board.
 *
 * `validStations` is the board's live roster; anything outside it is dropped,
 * so a hand-posted request cannot write arbitrary codes into the table — the
 * same guarantee subscribe() gives.
 *
 * An empty list removes the subscriber row outright rather than leaving an
 * address on file with nothing attached to it. The cascade on
 * alert_subscriptions takes the rest.
 */
export async function setAlertStations(
  emailRaw: string,
  location: string,
  stationCodes: string[],
  validStations: string[]
): Promise<{ ok: boolean; stations?: string[]; error?: string }> {
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) return { ok: false, error: "Invalid email address." };

  const allowed = new Set(validStations);
  const stations = [...new Set(stationCodes)].filter((c) => allowed.has(c));
  if (stations.length > 25) return { ok: false, error: "Too many beaches selected." };

  const sql = db();

  if (stations.length === 0) {
    await sql`DELETE FROM alert_subscribers WHERE email = ${email} AND location = ${location}`;
    return { ok: true, stations: [] };
  }

  const [subscriber] = await sql`
    INSERT INTO alert_subscribers (email, location)
    VALUES (${email}, ${location})
    ON CONFLICT (email, location) DO UPDATE SET updated_at = now()
    RETURNING id
  `;
  const subscriberId = subscriber.id as number;

  await sql`DELETE FROM alert_subscriptions WHERE subscriber_id = ${subscriberId}`;
  await sql`
    INSERT INTO alert_subscriptions (subscriber_id, station_code)
    SELECT ${subscriberId}, unnest(${stations}::text[])
    ON CONFLICT DO NOTHING
  `;
  return { ok: true, stations };
}
