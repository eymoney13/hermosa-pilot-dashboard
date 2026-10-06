import "server-only";
import { createHash } from "node:crypto";

// Server-side PostHog events over the plain capture API, for the few facts only
// the server can vouch for (a payment Stripe confirmed). No client SDK here.
//
// uuid is derived from dedupeKey so a retried webhook does not count the same
// payment twice. Never throws: analytics must not fail the caller.
export async function capturePostHogEvent({
  event,
  distinctId,
  dedupeKey,
  timestamp,
  properties = {},
}: {
  event: string;
  distinctId: string | null;
  dedupeKey: string;
  timestamp: Date;
  properties?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) return;

  const hex = createHash("sha256").update(`${event}:${dedupeKey}`).digest("hex");
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;

  try {
    await fetch(`${host.replace(/\/$/, "")}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event,
        uuid,
        timestamp: timestamp.toISOString(),
        // No browser id means no funnel to join; still count the payment,
        // but don't mint a person profile for it.
        distinct_id: distinctId ?? `server:${dedupeKey}`,
        properties: distinctId ? properties : { ...properties, $process_person_profile: false },
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Dropped analytics are acceptable; a failed webhook is not.
  }
}
