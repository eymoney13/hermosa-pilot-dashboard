import "server-only";
import { stripe, type Stripe } from "./subscription";
import { revenueDb, deliverRevenue } from "./stripeRevenueSync";

export function promoSignupPayload(session: Stripe.Checkout.Session, accountCreatedAt: number) {
  // The caller has already verified email ownership and claimed active access.
  // Old accounts signing in or redeeming again are not newly created accounts.
  if (session.metadata?.flow !== "payment_first_v1" || !session.metadata.redeem_promotion_id ||
    !Number.isFinite(accountCreatedAt) || accountCreatedAt < session.created * 1000 ||
    !["paid", "no_payment_required"].includes(session.payment_status)) return null;
  return {
    event: "promo_account_created",
    distinctId: session.metadata.posthog_distinct_id || null,
    dedupeKey: session.id,
    timestamp: new Date().toISOString(),
    properties: {
      board_location: "California", checkout_entry: "promo_redemption",
      checkout_session_id: session.id, plan: "monthly", new_account: true,
      email_verified: true, pro_activated: true, livemode: session.livemode,
    },
  };
}

export async function recordPromoSignup(sessionId: string, accountCreatedAt: number) {
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    const payload = promoSignupPayload(session, accountCreatedAt);
    if (!payload) return;
    const sql = await revenueDb();
    // Use the existing durable delivery worker and daily retry. A replay of
    // account activation cannot enqueue another conversion for this receipt.
    await sql`INSERT INTO stripe_revenue_outbox (invoice_id, payload)
      VALUES (${`promo_account_created:${session.id}`}, ${JSON.stringify(payload)}::jsonb)
      ON CONFLICT (invoice_id) DO NOTHING`;
    await deliverRevenue(1);
  } catch {
    // Access has already been granted. Analytics cannot block account access.
    console.error("[promo/signup] Analytics delivery could not be queued or completed");
  }
}
