import "server-only";
import { neon } from "@neondatabase/serverless";

// Unsubscribing, by the opaque token carried in every alert email.
//
// The token is the only credential: anyone holding it can unsubscribe that
// address, which is exactly the property a one-click unsubscribe needs. It
// grants nothing else - it cannot be used to read another address, change a
// selection, or sign anyone up.

// Tokens are gen_random_uuid(). Checking the shape before touching the database
// keeps malformed input from reaching a query at all.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Subscription {
  email: string;
  location: string;
  stations: string[];
}

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

export function isValidToken(token: string): boolean {
  return UUID_RE.test(token);
}

// What a token currently points at, or null if it has already been used, was
// never valid, or the address unsubscribed some other way. Callers treat null
// as "already unsubscribed" rather than as an error - clicking the link twice
// is ordinary, and a second click should not look like a failure.
export async function findSubscription(
  token: string
): Promise<Subscription | null> {
  if (!isValidToken(token)) return null;
  const rows = await db()`
    SELECT s.email, s.location,
           coalesce(array_agg(x.station_code ORDER BY x.station_code)
                    FILTER (WHERE x.station_code IS NOT NULL), '{}') AS stations
    FROM alert_subscribers s
    LEFT JOIN alert_subscriptions x ON x.subscriber_id = s.id
    WHERE s.unsubscribe_token = ${token}::uuid
    GROUP BY s.id
  `;
  if (rows.length === 0) return null;
  return {
    email: rows[0].email as string,
    location: rows[0].location as string,
    stations: (rows[0].stations as string[]) ?? [],
  };
}

/**
 * Remove the subscriber this token belongs to.
 *
 * Deletes the whole subscriber row rather than blanking its stations, so the
 * address leaves the database entirely: alert_subscriptions and
 * alert_notifications both cascade off it. Someone who unsubscribes has asked
 * to be forgotten, not to be kept on file with an empty list.
 *
 * Idempotent - unsubscribing an already-unsubscribed token is a no-op that
 * still reports success, because to the person clicking, it worked.
 */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  if (!isValidToken(token)) return false;
  await db()`
    DELETE FROM alert_subscribers WHERE unsubscribe_token = ${token}::uuid
  `;
  return true;
}
