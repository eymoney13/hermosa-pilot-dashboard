import "server-only";
import { randomUUID } from "node:crypto";
import { stripe, subscriptionDb, type Stripe } from "./subscription";
import { sendPostHogEvent } from "./posthogCapture";

export const REVENUE_START = Date.parse("2026-09-27T07:00:00Z") / 1000;

// The outbox survives deployments and downstream outages. Schema setup is
// additive and repeatable so deploying cannot leave a missing migration.
export async function revenueDb() {
  const sql = subscriptionDb();
  await sql`CREATE TABLE IF NOT EXISTS stripe_revenue_outbox (
    invoice_id text PRIMARY KEY, payload jsonb NOT NULL,
    delivered_at timestamptz, attempts integer NOT NULL DEFAULT 0,
    retry_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS stripe_revenue_pending
    ON stripe_revenue_outbox (retry_at, created_at) WHERE delivered_at IS NULL`;
  await sql`CREATE TABLE IF NOT EXISTS stripe_revenue_sync_state (
    id integer PRIMARY KEY CHECK (id = 1), cursor text,
    lease_token text, lease_until timestamptz, last_completed_at timestamptz
  )`;
  await sql`INSERT INTO stripe_revenue_sync_state (id) VALUES (1) ON CONFLICT DO NOTHING`;
  return sql;
}

export function invoiceRevenuePayload(invoice: Stripe.Invoice) {
  const paidAt = invoice.status_transitions.paid_at;
  if (!invoice.livemode || invoice.status !== "paid" || !paidAt || paidAt < REVENUE_START) return null;
  const customer = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  const discounts = invoice.discounts ?? [];
  const known = discounts.every((discount) => typeof discount !== "string");
  const codeUsed = discounts.some((discount) => typeof discount !== "string" && Boolean(discount.promotion_code));
  return {
    event: "stripe_invoice_paid",
    distinctId: `stripe:${customer ?? invoice.id}`,
    dedupeKey: invoice.id,
    timestamp: new Date(paidAt * 1000).toISOString(),
    properties: {
      stripe_invoice_id: invoice.id,
      stripe_customer_id: customer ?? null,
      amount_cents: invoice.amount_paid,
      price: invoice.amount_paid / 100,
      currency: invoice.currency.toUpperCase(),
      livemode: invoice.livemode,
      billing_reason: invoice.billing_reason,
      discount_amount_cents: (invoice.total_discount_amounts ?? []).reduce((sum, discount) => sum + discount.amount, 0),
      discount_code_used: codeUsed ? true : known ? false : null,
      source: "stripe_reconciliation",
      $process_person_profile: false,
    },
  };
}

export async function queueRevenueInvoice(invoiceId: string) {
  // Expand on retrieval: webhook payloads may contain only discount IDs.
  const invoice = await stripe().invoices.retrieve(invoiceId, { expand: ["discounts"] });
  const payload = invoiceRevenuePayload(invoice);
  if (!payload) return false;
  const sql = await revenueDb();
  await sql`INSERT INTO stripe_revenue_outbox (invoice_id, payload)
    VALUES (${invoice.id}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT (invoice_id) DO NOTHING`;
  return true;
}

export async function deliverRevenue(limit = 25) {
  const sql = await revenueDb();
  let delivered = 0;
  let failed = 0;
  for (let i = 0; i < limit; i++) {
    // Claim one at a time: never let a batch lease expire before it is sent.
    const rows = await sql`UPDATE stripe_revenue_outbox SET
      lease_until = now() + interval '10 minutes', attempts = attempts + 1
      WHERE invoice_id = (SELECT invoice_id FROM stripe_revenue_outbox
        WHERE delivered_at IS NULL AND retry_at <= now()
          AND (lease_until IS NULL OR lease_until < now())
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING invoice_id, payload`;
    if (!rows.length) break;
    const row = rows[0];
    try {
      const payload = row.payload as ReturnType<typeof invoiceRevenuePayload>;
      if (!payload) throw new Error("Missing revenue payload");
      await sendPostHogEvent({ ...payload, timestamp: new Date(payload.timestamp) });
      await sql`UPDATE stripe_revenue_outbox SET delivered_at = now(), lease_until = NULL
        WHERE invoice_id = ${row.invoice_id}`;
      delivered++;
    } catch {
      await sql`UPDATE stripe_revenue_outbox SET lease_until = NULL,
        retry_at = now() + interval '5 minutes' WHERE invoice_id = ${row.invoice_id}`;
      failed++;
    }
  }
  const [counts] = await sql`SELECT count(*)::integer AS pending,
    min(created_at) AS oldest_pending_at FROM stripe_revenue_outbox WHERE delivered_at IS NULL`;
  return { delivered, failed, pending: counts.pending, oldestPendingAt: counts.oldest_pending_at };
}

export async function reconcileStripeRevenue() {
  const sql = await revenueDb();
  const token = randomUUID();
  const claimed = await sql`UPDATE stripe_revenue_sync_state
    SET lease_token = ${token}, lease_until = now() + interval '10 minutes'
    WHERE id = 1 AND (lease_until IS NULL OR lease_until < now()) RETURNING cursor`;
  if (!claimed.length) return { busy: true };
  let scanned = 0;
  let complete = false;
  let cursor = claimed[0].cursor as string | null;
  try {
    // Continue large accounts across runs; never restart page one forever.
    // Scan all paid invoices, using paid_at (not creation date) for inclusion.
    for (let page = 0; page < 3; page++) {
      const invoices = await stripe().invoices.list({ status: "paid", limit: 100,
        ...(cursor ? { starting_after: cursor } : {}), expand: ["data.discounts"] });
      for (const invoice of invoices.data) {
        const payload = invoiceRevenuePayload(invoice);
        if (payload) await sql`INSERT INTO stripe_revenue_outbox (invoice_id, payload)
          VALUES (${invoice.id}, ${JSON.stringify(payload)}::jsonb)
          ON CONFLICT (invoice_id) DO NOTHING`;
        scanned++;
      }
      complete = !invoices.has_more;
      cursor = complete ? null : invoices.data.at(-1)!.id;
      await sql`UPDATE stripe_revenue_sync_state SET cursor = ${cursor},
        last_completed_at = CASE WHEN ${complete} THEN now() ELSE last_completed_at END
        WHERE id = 1 AND lease_token = ${token}`;
      if (complete) break;
    }
    return { scanned, complete, ...await deliverRevenue() };
  } finally {
    await sql`UPDATE stripe_revenue_sync_state SET lease_token = NULL, lease_until = NULL
      WHERE id = 1 AND lease_token = ${token}`;
  }
}
