import "server-only";
import { randomUUID } from "node:crypto";
import { currentUser, clerkClient } from "@clerk/nextjs/server";
import nodemailer from "nodemailer";
import { purchaseEmail } from "./purchaseEmail";
import { stripe, subscriptionDb as db, siteUrl, PRO_PLANS, isProPlan, hasLiveSubscription, type ProPlan, type Stripe } from "./subscription";
import { normalizedEmail, verifiedBuyer, paymentFirstAllowed, paidCheckout } from "./purchasePolicy";

export function isPaymentFirstEnabled(): boolean { return paymentFirstAllowed(process.env); }
export function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  const raw = sub.items.data[0]?.current_period_end;
  return typeof raw === "number" ? new Date(raw * 1000) : null;
}
function validEmail(email: string) { return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

// POST only. The database elects a single checkout attempt for an email across
// tabs/processes. Stripe idempotency makes retries return that same checkout.
export async function startPurchase(plan: ProPlan, rawEmail: string): Promise<string> {
  if (!isPaymentFirstEnabled()) throw new Error("Checkout is unavailable");
  if (!process.env.PRO_ACTIVATION_EMAIL_FROM || !process.env.GMAIL_APP_PASSWORD) throw new Error("Activation email is not configured");
  siteUrl(); // Validate the return origin before creating anything at Stripe.
  const email = normalizedEmail(rawEmail);
  if (!validEmail(email)) throw new Error("Enter a valid checkout email");
  const user = await currentUser();
  if (user && await hasLiveSubscription(user.id)) return `${siteUrl()}/sandbox`;
  const paid = await db()`SELECT checkout_session_id FROM pro_subscriptions
    WHERE checkout_email = ${email} AND status IN ('active', 'trialing', 'past_due')
    LIMIT 1`;
  // Don't expose another customer's receipt or whether the email is registered.
  if (paid.length) return `${siteUrl()}/pro/recover`;
  // Before replacing an expired attempt, reconcile a completed checkout whose
  // webhook or browser return was lost. Never charge again for that purchase.
  const previous = await db()`SELECT checkout_session_id FROM pro_checkout_attempts WHERE email = ${email}`;
  if (previous[0]?.checkout_session_id) {
    const receipt = await syncPurchase(previous[0].checkout_session_id);
    if (receipt?.active) return `${siteUrl()}/pro/recover`;
  }
  const attempts = await db()`INSERT INTO pro_checkout_attempts (email, attempt_id, plan, expires_at)
    VALUES (${email}, ${randomUUID()}, ${plan}, now() + interval '1 hour')
    ON CONFLICT (email) DO UPDATE SET
      attempt_id = CASE WHEN pro_checkout_attempts.expires_at < now() THEN EXCLUDED.attempt_id ELSE pro_checkout_attempts.attempt_id END,
      checkout_session_id = CASE WHEN pro_checkout_attempts.expires_at < now() THEN NULL ELSE pro_checkout_attempts.checkout_session_id END,
      plan = CASE WHEN pro_checkout_attempts.expires_at < now() THEN EXCLUDED.plan ELSE pro_checkout_attempts.plan END,
      expires_at = CASE WHEN pro_checkout_attempts.expires_at < now() THEN EXCLUDED.expires_at ELSE pro_checkout_attempts.expires_at END
    RETURNING attempt_id, plan, expires_at, checkout_session_id` as Array<{attempt_id: string; plan: ProPlan; expires_at: string; checkout_session_id: string | null}>;
  const attempt = attempts[0];
  // Reuse an existing session before creating: expires_at must be >=30 minutes
  // when Stripe first creates it, but subsequent POSTs may arrive later.
  const existing = attempt.checkout_session_id ? await stripe().checkout.sessions.retrieve(attempt.checkout_session_id) : null;
  if (existing?.status === "complete") return `${siteUrl()}/pro/recover`;
  if (existing?.status === "open" && existing.url) return existing.url;
  if (new Date(attempt.expires_at).getTime() - Date.now() < 31 * 60_000) throw new Error("Please try again after this checkout expires");
  const { cents, interval } = PRO_PLANS[attempt.plan];
  const session = await stripe().checkout.sessions.create({
    mode: "subscription", customer_email: email, payment_method_types: ["card"],
    expires_at: Math.floor(new Date(attempt.expires_at).getTime() / 1000),
    metadata: { flow: "payment_first_v1", plan: attempt.plan, attempt_id: attempt.attempt_id },
    subscription_data: { metadata: { flow: "payment_first_v1", plan: attempt.plan } },
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: cents,
      recurring: { interval }, product_data: { name: "Neptune Pro" } } }],
    success_url: `${siteUrl()}/pro/activate?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}/sandbox#sandbox-pro`,
  }, { idempotencyKey: `neptune-purchase-${attempt.attempt_id}` });
  await db()`UPDATE pro_checkout_attempts SET checkout_session_id = ${session.id} WHERE email = ${email} AND attempt_id = ${attempt.attempt_id}`;
  if (!session.url) throw new Error("Checkout is unavailable");
  return session.url;
}

// Fresh Stripe state, not a success URL or an old webhook snapshot. Observation
// timestamps prevent a slower, older retrieval overwriting a newer result.
export async function syncPurchase(sessionId: string) {
  if (!/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) return null;
  const observed = new Date().toISOString();
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  if (!paidCheckout(session)) return null;
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const email = session.customer_details?.email;
  if (!subId || !customerId || !email || !isProPlan(session.metadata?.plan)) return null;
  const sub = await stripe().subscriptions.retrieve(subId);
  const end = subscriptionPeriodEnd(sub);
  const plan = session.metadata!.plan as ProPlan;
  await db()`INSERT INTO pro_subscriptions
    (clerk_user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end,
     price_cents, plan, checkout_session_id, checkout_email, stripe_observed_at)
    VALUES (NULL, ${customerId}, ${subId}, ${sub.status}, ${end?.toISOString() ?? null},
      ${PRO_PLANS[plan].cents}, ${plan}, ${session.id}, ${normalizedEmail(email)}, ${observed})
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
      status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end,
      stripe_observed_at = EXCLUDED.stripe_observed_at, updated_at = now()
    WHERE pro_subscriptions.stripe_observed_at <= EXCLUDED.stripe_observed_at`;
  return { sessionId: session.id, email: normalizedEmail(email), subscriptionId: subId,
    active: sub.status === "active" && !!end && end.getTime() > Date.now() };
}
export async function refreshPurchaseSubscription(id: string): Promise<void> {
  const observed = new Date().toISOString();
  const sub = await stripe().subscriptions.retrieve(id);
  const end = subscriptionPeriodEnd(sub);
  await db()`UPDATE pro_subscriptions SET status = ${sub.status}, current_period_end = ${end?.toISOString() ?? null},
    stripe_observed_at = ${observed}, updated_at = now()
    WHERE stripe_subscription_id = ${id} AND stripe_observed_at <= ${observed}`;
}
export async function activatePurchase(sessionId: string): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  const purchase = await syncPurchase(sessionId);
  if (!purchase?.active || !verifiedBuyer(purchase.email, user.emailAddresses)) return false;
  // Unique constraints and a conditional UPDATE prevent concurrent reassignment.
  const rows = await db()`UPDATE pro_subscriptions SET clerk_user_id = ${user.id}, updated_at = now()
    WHERE checkout_session_id = ${sessionId} AND checkout_email = ${purchase.email}
      AND status = 'active' AND current_period_end > now()
      AND (clerk_user_id IS NULL OR clerk_user_id = ${user.id})
      AND NOT EXISTS (SELECT 1 FROM pro_subscriptions other
        WHERE other.clerk_user_id = ${user.id} AND other.status IN ('active', 'trialing', 'past_due')
          AND other.checkout_session_id IS DISTINCT FROM ${sessionId})
    RETURNING id`;
  return rows.length === 1;
}
// Uniform public response; links go only to the checkout mailbox. Database
// throttling survives concurrent requests. SMTP configuration is required.
export async function sendRecovery(email: string, initialOnly = false): Promise<void> {
  email = normalizedEmail(email);
  if (!validEmail(email)) throw new Error("Invalid email");
  const sender = process.env.PRO_ACTIVATION_EMAIL_FROM;
  const password = process.env.GMAIL_APP_PASSWORD;
  if (!sender || !password) throw new Error("Activation email is not configured");
  const rows = await db()`UPDATE pro_subscriptions SET recovery_sent_at = now()
    WHERE checkout_email = ${email} AND checkout_session_id IS NOT NULL
      AND (${initialOnly} = false OR recovery_sent_at IS NULL)
      AND (recovery_sent_at IS NULL OR recovery_sent_at < now() - interval '10 minutes')
    RETURNING checkout_session_id` as Array<{ checkout_session_id: string }>;
  if (!rows.length) return;
  const transport = nodemailer.createTransport({service: "gmail", auth: { user: sender, pass: password.replace(/\s+/g, "") }});
  try {
    const client = await clerkClient();
    const existing = await client.users.getUserList({emailAddress: [email], limit: 1});
    const links: string[] = [];
    for (const row of rows) {
      const purchase = await syncPurchase(row.checkout_session_id);
      if (!purchase?.active || normalizedEmail(purchase.email) !== email) continue;
      if (existing.data.length) {
        links.push(`${siteUrl()}/sign-in?purchase=${encodeURIComponent(row.checkout_session_id)}`);
      } else {
        // Invitation tickets verify email ownership. Send them ONLY to the
        // verified Stripe checkout mailbox; never return one to the browser.
        const pending = await client.invitations.getInvitationList({query: email, status: "pending", limit: 100});
        const reusable = pending.data.find(invite => normalizedEmail(invite.emailAddress) === email &&
          invite.publicMetadata?.checkout_session_id === row.checkout_session_id && invite.url &&
          Number(invite.publicMetadata?.neptune_invite_expires_at) > Date.now() + 60_000);
        const invitation = reusable ?? await client.invitations.createInvitation({
          emailAddress: email, notify: false, ignoreExisting: true, expiresInDays: 7,
          redirectUrl: `${siteUrl()}/sign-up?purchase=${encodeURIComponent(row.checkout_session_id)}`,
          publicMetadata: {checkout_session_id: row.checkout_session_id,
            neptune_invite_expires_at: Date.now() + 7 * 24 * 60 * 60_000},
        });
        if (!invitation.url) throw new Error("Invitation unavailable");
        links.push(invitation.url);
      }
    }
    if (!links.length) return;
    await transport.sendMail({ from: {name: "Neptune Pro", address: sender}, to: email,
      ...purchaseEmail(links, existing.data.length > 0) });
  } catch (error) {
    await db()`UPDATE pro_subscriptions SET recovery_sent_at = NULL WHERE checkout_email = ${email}`;
    throw error;
  }
}
