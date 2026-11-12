import "server-only";
import { randomUUID } from "node:crypto";
import { currentUser } from "@clerk/nextjs/server";
import { paymentFirstAllowed } from "./purchasePolicy";
import { stripe, subscriptionDb, siteUrl, type Stripe } from "./subscription";

export function promoEnabled() { return process.env.NEPTUNE_PROMO_LIFECYCLE_ENABLED === "true"; }
export function promoEndFor(sub: Stripe.Subscription): number | null {
  // Even a returning customer with a saved card must explicitly choose to continue.
  if (sub.items.data.length !== 1 || sub.items.data[0].price.recurring?.interval !== "month") throw new Error("Free promos require the monthly plan");
  const discounts = sub.discounts.filter((d): d is Stripe.Discount => typeof d !== "string");
  const qualifying = discounts.find(d => typeof d.source.coupon === "object" && d.source.coupon?.percent_off === 100 && d.source.coupon.duration === "repeating" && d.source.coupon.duration_in_months === 1);
  if (!qualifying?.end) throw new Error("Use a repeating one-month 100% promo");
  if (qualifying.end !== sub.items.data[0].current_period_end) throw new Error("Promo deadline must match monthly renewal");
  return qualifying.end;
}
async function reconcileUnlocked(sub: Stripe.Subscription, free: boolean, email?: string): Promise<Stripe.Subscription> {
  if (!free || sub.status !== "active" || sub.metadata.promo_continued === "1") return sub;
  sub = await stripe().subscriptions.retrieve(sub.id, { expand: ["discounts.source.coupon", "customer"] });
  if (sub.metadata.promo_continued === "1" || sub.status !== "active") return sub;
  let end: number | null;
  try { end = promoEndFor(sub); }
  catch (error) {
    // An unsupported $0 discount must never become an accidental paid renewal.
    await stripe().subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
    throw error;
  }
  if (!promoEnabled() && sub.metadata.promo_no_card !== "1") {
    await stripe().subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
    throw new Error("Free promo provisioning is not enabled");
  }
  if (!end) return sub;
  if (email) {
    const claimed = await subscriptionDb()`INSERT INTO pro_promo_redemptions (email, stripe_subscription_id)
      VALUES (${email.trim().toLowerCase()}, ${sub.id}) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      WHERE pro_promo_redemptions.stripe_subscription_id = EXCLUDED.stripe_subscription_id RETURNING email`;
    if (!claimed.length) {
      await stripe().subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
      throw new Error("This email has already redeemed a free promo. Start a paid subscription.");
    }
  }
  if (sub.cancel_at === end && sub.metadata.promo_no_card === "1") return sub;
  return stripe().subscriptions.update(sub.id, { cancel_at: end, proration_behavior: "none", metadata: { promo_no_card: "1", promo_redeemed_at: sub.metadata.promo_redeemed_at || String(Math.floor(Date.now() / 1000)) } });
}
// Serialize scheduling and continuation across workers. A crashed worker's lease expires.
async function withPromoLease<T>(id: string, work: () => Promise<T>): Promise<T> {
  const token = randomUUID();
  const rows = await subscriptionDb()`INSERT INTO pro_promo_operation (subscription_id, lease_until, lease_token)
    VALUES (${id}, now() + interval '10 minutes', ${token}) ON CONFLICT (subscription_id) DO UPDATE
    SET lease_until = EXCLUDED.lease_until, lease_token = EXCLUDED.lease_token
    WHERE pro_promo_operation.lease_until < now() RETURNING subscription_id`;
  if (!rows.length) throw new Error("Promo update in progress. Please retry.");
  try { return await work(); }
  finally { await subscriptionDb()`DELETE FROM pro_promo_operation WHERE subscription_id = ${id} AND lease_token = ${token}`; }
}
export async function reconcilePromo(sub: Stripe.Subscription, free: boolean, email?: string): Promise<Stripe.Subscription> {
  if (!free || sub.status !== "active") return sub;
  // Ordinary page reads need no mutation lease once provisioning is complete.
  // Signup and the activation return can otherwise contend for the same lease.
  if (sub.metadata.promo_continued === "1" || (sub.metadata.promo_no_card === "1" && sub.cancel_at)) return sub;
  return withPromoLease(sub.id, () => reconcileUnlocked(sub, free, email));
}
export async function startKeepPro(): Promise<string> {
  if (!promoEnabled() || !paymentFirstAllowed(process.env)) throw new Error("Promo continuation is unavailable");
  const user = await currentUser();
  if (!user) throw new Error("Sign in to continue");
  const rows = await subscriptionDb()`SELECT stripe_subscription_id FROM pro_subscriptions WHERE clerk_user_id = ${user.id} AND status = 'active' AND promo_access_ends_at > now() LIMIT 1`;
  if (!rows.length) throw new Error("This promo has ended. Start a new subscription.");
  const sub = await stripe().subscriptions.retrieve(rows[0].stripe_subscription_id);
  if (sub.status !== "active" || !sub.cancel_at || sub.cancel_at * 1000 <= Date.now() || sub.metadata.promo_no_card !== "1") throw new Error("This promo has ended");
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const session = await stripe().checkout.sessions.create({ mode: "setup", customer, currency: "usd", payment_method_types: ["card"], metadata: { flow: "keep_pro_v1", subscription_id: sub.id, clerk_user_id: user.id }, success_url: `${siteUrl()}/pro/manage?kept=1`, cancel_url: `${siteUrl()}/pro/manage` });
  if (!session.url) throw new Error("Setup checkout unavailable");
  return session.url;
}
async function completeKeepProUnlocked(sessionId: string): Promise<void> {
  const session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["setup_intent"] });
  if (session.mode !== "setup" || session.status !== "complete" || session.metadata?.flow !== "keep_pro_v1") throw new Error("Invalid setup session");
  const sub = await stripe().subscriptions.retrieve(session.metadata.subscription_id);
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const sessionCustomer = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const rows = await subscriptionDb()`SELECT id FROM pro_subscriptions WHERE stripe_subscription_id = ${sub.id} AND stripe_customer_id = ${customer} AND clerk_user_id = ${session.metadata.clerk_user_id}`;
  if (!rows.length || customer !== sessionCustomer) throw new Error("Setup ownership mismatch");
  if (sub.metadata.promo_continued === "1") return;
  // A canceled subscription cannot be resumed. The manage page offers a fresh checkout.
  if (sub.status !== "active" || !sub.cancel_at || sub.cancel_at * 1000 <= Date.now()) return;
  const intent = session.setup_intent;
  if (!intent || typeof intent === "string" || intent.status !== "succeeded") throw new Error("Card setup incomplete");
  const method = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
  if (!method) throw new Error("No payment method");
  // Subscription-level default is sufficient and avoids changing another subscription's card.
  await stripe().subscriptions.update(sub.id, { default_payment_method: method, cancel_at: "", proration_behavior: "none", metadata: { promo_no_card: "", promo_continued: "1" } });
}

export async function completeKeepPro(sessionId: string): Promise<void> {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  if (session.metadata?.flow !== "keep_pro_v1" || !session.metadata.subscription_id) throw new Error("Invalid setup flow");
  return withPromoLease(session.metadata.subscription_id, () => completeKeepProUnlocked(sessionId));
}
