import "server-only";
import Stripe from "stripe";
import { neon } from "@neondatabase/serverless";

// Neptune Pro subscriptions: creating them, recording them, and answering
// whether one is live.
//
// Real money. mode: "subscription", charged monthly from the moment checkout
// completes — not the $0 setup-mode dry run this repo tried earlier and threw
// away. Test keys before live ones, every time.

export const PRO_PRICE_CENTS = 499;
export const PRO_PRICE_LABEL = "$4.99/month";

// Pinned rather than left to the SDK default, so upgrading `stripe` cannot
// quietly change the shape of what we send or get back.
const STRIPE_API_VERSION = "2026-08-26.dahlia";

// Lazy, never at module scope: Next evaluates top-level module code at build
// time, and a build without keys must not crash. It just must not sell
// anything.
function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

/** Whether a subscription can be sold at all: somewhere to charge, somewhere to record it. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.DATABASE_URL);
}

/**
 * Whether entitlement should be decided by a subscription record at all.
 *
 * Separate from isStripeConfigured, and deliberately keyed on the DATABASE
 * alone. It is the fail-closed half: production always has DATABASE_URL, so
 * production always requires a real subscription — even if the Stripe keys
 * went missing, which would otherwise hand Pro to everyone with an account.
 * Only a machine with no database at all falls back to "signed in is enough".
 */
export function subscriptionsEnforced(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

// Stripe statuses that mean "this person has paid and has not run out".
//
// `past_due` is deliberately included: a card that failed its first retry has
// not cancelled anything, and cutting someone off mid-month over a bank blip
// is how a subscription earns a chargeback. Stripe moves them to `canceled` or
// `unpaid` when the retries are exhausted, and that is when access stops.
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export interface SubscriptionRow {
  status: string;
  current_period_end: string | null;
}

/** Whether a stored row still grants access right now. */
export function entitlementFrom(row: SubscriptionRow | undefined): boolean {
  if (!row || !LIVE_STATUSES.has(row.status)) return false;
  // A cancellation mid-month leaves the row live until the period it was paid
  // for runs out. Stripe keeps status "active" until then and only flips it at
  // the boundary, so this is a backstop for a webhook that never arrived
  // rather than the normal path.
  if (row.current_period_end && new Date(row.current_period_end) < new Date()) {
    return false;
  }
  return true;
}

/** Does this account hold a live subscription? */
export async function hasLiveSubscription(clerkUserId: string): Promise<boolean> {
  const rows = (await db()`
    SELECT status, current_period_end
      FROM pro_subscriptions
     WHERE clerk_user_id = ${clerkUserId}
  `) as SubscriptionRow[];
  return entitlementFrom(rows[0]);
}

/**
 * Start a checkout for this account.
 *
 * The price is built inline rather than referencing a dashboard Price, so
 * there is no id to create by hand and no way for the figure here to drift
 * from one configured somewhere else.
 *
 * The Clerk user id rides along twice — as client_reference_id and in metadata
 * — because the webhook has only the session to work from, and one of those
 * two is how the payment finds its way back to an account.
 */
export async function createCheckoutSession(
  clerkUserId: string,
  returnTo: string
): Promise<string> {
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    client_reference_id: clerkUserId,
    metadata: { clerk_user_id: clerkUserId },
    subscription_data: { metadata: { clerk_user_id: clerkUserId } },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: PRO_PRICE_CENTS,
          recurring: { interval: "month" },
          product_data: {
            name: "Neptune Pro",
            description:
              "Full forecasts, historical conditions and email alerts for your beaches.",
          },
        },
      },
    ],
    success_url: `${siteUrl()}/pro/welcome`,
    // Back where they were, not to a dead end. Someone who changes their mind
    // at the card form should land on the board they were reading.
    cancel_url: `${siteUrl()}${returnTo}`,
  });

  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return session.url;
}

function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/**
 * Record what Stripe just told us. Idempotent: Stripe retries a webhook until
 * it gets a 2xx, and a redelivery must change nothing.
 */
export async function recordSubscription(input: {
  clerkUserId: string;
  customerId: string | null;
  subscriptionId: string | null;
  status: string;
  currentPeriodEnd: Date | null;
}): Promise<void> {
  await db()`
    INSERT INTO pro_subscriptions
      (clerk_user_id, stripe_customer_id, stripe_subscription_id, status,
       current_period_end, price_cents)
    VALUES
      (${input.clerkUserId}, ${input.customerId}, ${input.subscriptionId},
       ${input.status}, ${input.currentPeriodEnd?.toISOString() ?? null},
       ${PRO_PRICE_CENTS})
    ON CONFLICT (clerk_user_id) DO UPDATE
      SET stripe_customer_id     = COALESCE(EXCLUDED.stripe_customer_id,
                                            pro_subscriptions.stripe_customer_id),
          stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id,
                                            pro_subscriptions.stripe_subscription_id),
          status                 = EXCLUDED.status,
          current_period_end     = EXCLUDED.current_period_end,
          updated_at             = now()
  `;
}

/**
 * A subscription changed at Stripe's end — renewed, lapsed, cancelled.
 *
 * Matched on the subscription id rather than the Clerk id, because these
 * events carry no idea who our reader is. Without this handler a cancellation
 * would never reach us and a former subscriber would keep Pro forever.
 */
export async function updateSubscriptionStatus(
  subscriptionId: string,
  status: string,
  currentPeriodEnd: Date | null
): Promise<void> {
  await db()`
    UPDATE pro_subscriptions
       SET status             = ${status},
           current_period_end = ${currentPeriodEnd?.toISOString() ?? null},
           updated_at         = now()
     WHERE stripe_subscription_id = ${subscriptionId}
  `;
}

/** Verify a webhook came from Stripe. Throws if the signature does not check out. */
export function constructWebhookEvent(
  payload: string,
  signature: string
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return stripe().webhooks.constructEvent(payload, signature, secret);
}

export type { Stripe };
