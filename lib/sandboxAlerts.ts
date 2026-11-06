import "server-only";
import { neon } from "@neondatabase/serverless";
import { isValidEmail, normalizeEmail } from "./alerts";

// California Pro follows retain the historical "sandbox" storage namespace.
// Public route changes never move subscriber IDs or invalidate unsubscribe tokens.
// This is production storage, not a test database. Tests use a separate Neon branch.

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
  location = location === "california" ? "sandbox" : location;
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
  validStations: string[],
  clerkUserId: string
): Promise<{ ok: boolean; stations?: string[]; error?: string }> {
  location = location === "california" ? "sandbox" : location;
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) return { ok: false, error: "Invalid email address." };

  const allowed = new Set(validStations);
  const stations = [...new Set(stationCodes)].filter((c) => allowed.has(c));
  // Pro can follow the entire live roster; duplicates and unknown codes are removed above.

  const sql = db();

  if (location === "sandbox") {
    await sql`SELECT set_california_pro_alerts(${email}, ${stations}::text[], ${clerkUserId})`;
    return { ok: true, stations };
  }

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
