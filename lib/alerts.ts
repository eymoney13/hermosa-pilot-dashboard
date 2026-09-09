import "server-only";
import { neon } from "@neondatabase/serverless";

// Email alert subscriptions — "tell me when one of these beaches comes back
// elevated". Storage only: this module records who wants what. Nothing here
// sends mail; the daily job that reads these rows is a separate piece.
//
// Backed by the Neon Postgres attached to this Vercel project. Schema (and how
// to apply it) lives in scripts/alerts-schema.sql.

// Signing up for more than this many beaches at once is not a person filling in
// a form. The South Bay roster is 8, and the largest board (Boston) is 13, so
// this leaves headroom for a board to grow without ever being reachable by a
// real submission.
const MAX_STATIONS_PER_SUBMISSION = 25;

// Deliberately permissive. Server-side email validation exists to reject
// obvious junk and things that would break a mail header, not to adjudicate the
// RFC — the only real proof an address works is mail arriving at it, which the
// confirmation step in the sending job will provide.
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>.]+(\.[^\s@,;<>.]+)+$/;
const EMAIL_MAX_LENGTH = 254; // RFC 5321 maximum

export interface SubscribeResult {
  ok: boolean;
  error?: string;
}

// Lazy, not module-level: neon() throws when DATABASE_URL is unset, and Next
// evaluates top-level module code at build time. A build in an environment
// without the database wired up must not crash — it just must not serve
// signups either.
function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

// Whether signups can be accepted at all right now. Lets the UI say "not
// available" instead of throwing a 500 at someone who filled in a form.
export function isAlertsConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

// One canonical form per address, so re-subscribing updates the existing row
// rather than creating a near-duplicate that would double every alert.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  return email.length <= EMAIL_MAX_LENGTH && EMAIL_RE.test(email);
}

/**
 * Record (or replace) one address's alert subscriptions for a location.
 *
 * Re-submitting the same address for the same location REPLACES its station
 * list rather than adding to it, because the form shows the full roster with
 * checkboxes: what the user submitted is the complete set they want, so a
 * second submission with one box unticked has to mean "stop alerting me about
 * that one". Additive merging would make unsubscribing from a single beach
 * impossible through the only UI we give them.
 *
 * `validStations` is the caller's roster — the live set of station codes on
 * that board. Anything outside it is dropped, so a hand-posted request can't
 * write arbitrary strings into the table.
 */
export async function subscribe(
  emailRaw: string,
  location: string,
  stationCodes: string[],
  validStations: string[]
): Promise<SubscribeResult> {
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  // Dedupe before the length check so a payload repeating one station 40 times
  // reads as the single beach it is.
  const allowed = new Set(validStations);
  const stations = [...new Set(stationCodes)].filter((c) => allowed.has(c));

  if (stations.length === 0) {
    return { ok: false, error: "Select at least one beach." };
  }
  if (stations.length > MAX_STATIONS_PER_SUBMISSION) {
    return { ok: false, error: "Too many beaches selected." };
  }

  const sql = db();

  // Upsert the subscriber, then replace their station list. Two statements
  // rather than one because the HTTP driver sends a statement per call; the
  // window between them is one address's own rows, and the worst case is a
  // duplicate submission landing on the same set it was already writing.
  const [subscriber] = await sql`
    INSERT INTO alert_subscribers (email, location)
    VALUES (${email}, ${location})
    ON CONFLICT (email, location)
      DO UPDATE SET updated_at = now()
    RETURNING id
  `;

  const subscriberId = subscriber.id as number;

  await sql`
    DELETE FROM alert_subscriptions WHERE subscriber_id = ${subscriberId}
  `;
  await sql`
    INSERT INTO alert_subscriptions (subscriber_id, station_code)
    SELECT ${subscriberId}, unnest(${stations}::text[])
    ON CONFLICT DO NOTHING
  `;

  return { ok: true };
}
