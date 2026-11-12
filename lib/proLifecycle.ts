import "server-only";
import { randomUUID } from "node:crypto";
import { subscriptionDb as db, siteUrl, stripe } from "./subscription";
import { refreshPurchaseSubscription, syncPurchase, sendRecovery } from "./purchase";
import { promoEnabled } from "./promoAccess";
import { proMailer } from "./proMailer";
import { lifecycleEmail, type LifecycleKind } from "./proLifecycleEmail";

// Only promo-origin subscriptions enter this queue. Paid cancellations are unaffected.
export async function runProLifecycle(subscriptionId: string | null = null) {
  if (!promoEnabled()) return { sent: 0, failed: 0 };
  // Completed browser returns whose webhook failed provisioning get another attempt.
  const attempts = subscriptionId ? [] : await db()`SELECT checkout_session_id FROM pro_direct_checkout_reconcile
    WHERE next_attempt_at <= now() ORDER BY next_attempt_at LIMIT 30`;
  let failed = 0, sent = 0;
  for (const attempt of attempts) {
    await db()`UPDATE pro_direct_checkout_reconcile SET next_attempt_at = now() + interval '1 day' WHERE checkout_session_id = ${attempt.checkout_session_id}`;
    try {
      const purchase = await syncPurchase(attempt.checkout_session_id);
      if (purchase?.active) await sendRecovery(purchase.email, true);
      const session = await stripe().checkout.sessions.retrieve(attempt.checkout_session_id);
      if (purchase || session.status === "expired") await db()`DELETE FROM pro_direct_checkout_reconcile WHERE checkout_session_id = ${attempt.checkout_session_id}`;
    } catch (error) { failed++; console.error('[pro/lifecycle] reconcile checkout', error); }
  }
  const promos = await db()`SELECT stripe_subscription_id FROM pro_subscriptions WHERE (${subscriptionId}::text IS NULL OR stripe_subscription_id = ${subscriptionId}) AND promo_access_ends_at IS NOT NULL AND status IN ('active','trialing','past_due') ORDER BY stripe_observed_at LIMIT 50`;
  for (const row of promos) { try { await refreshPurchaseSubscription(row.stripe_subscription_id); } catch (error) { failed++; console.error('[pro/lifecycle] reconcile subscription', error); } }
  for (const kind of ["reminder", "ended", "winback"] as LifecycleKind[]) {
    const candidates = await db()`SELECT p.stripe_subscription_id FROM pro_subscriptions p
      WHERE (${subscriptionId}::text IS NULL OR p.stripe_subscription_id = ${subscriptionId}) AND p.promo_access_ends_at IS NOT NULL AND p.checkout_email IS NOT NULL
      AND (( ${kind} = 'reminder' AND p.status = 'active' AND p.promo_access_ends_at > now()
          AND p.promo_access_ends_at <= now() + interval '3 days'
          AND p.promo_access_ends_at - p.promo_redeemed_at > interval '4 days')
        OR (${kind} = 'ended' AND p.status = 'canceled' AND p.ended_at <= now())
        OR (${kind} = 'winback' AND p.status = 'canceled' AND p.ended_at <= now() - interval '7 days'
          AND EXISTS (SELECT 1 FROM pro_lifecycle_delivery d WHERE d.subscription_id = p.stripe_subscription_id AND d.kind = 'ended' AND d.sent_at IS NOT NULL)))
      AND NOT EXISTS (SELECT 1 FROM pro_lifecycle_delivery d WHERE d.subscription_id = p.stripe_subscription_id AND d.kind = ${kind} AND (d.sent_at IS NOT NULL OR d.lease_until > now()))
      AND NOT EXISTS (SELECT 1 FROM pro_subscriptions other WHERE other.stripe_subscription_id <> p.stripe_subscription_id
        AND (other.clerk_user_id = p.clerk_user_id OR lower(other.checkout_email) = lower(p.checkout_email))
        AND other.status IN ('active','trialing','past_due') AND (other.current_period_end IS NULL OR other.current_period_end > now())
        AND (other.promo_access_ends_at IS NULL OR other.promo_access_ends_at > now()))
      AND (${kind} <> 'winback' OR NOT EXISTS (SELECT 1 FROM pro_email_preferences prefs WHERE prefs.email = p.checkout_email AND prefs.marketing_unsubscribed_at IS NOT NULL))
      ORDER BY p.promo_access_ends_at LIMIT 50`;
    for (const candidate of candidates) {
      const id = candidate.stripe_subscription_id;
      const token = randomUUID();
      const claims = await db()`INSERT INTO pro_lifecycle_delivery (subscription_id, kind, lease_until, lease_token)
        VALUES (${id}, ${kind}, now() + interval '10 minutes', ${token})
        ON CONFLICT (subscription_id,kind) DO UPDATE SET lease_until = EXCLUDED.lease_until, lease_token = EXCLUDED.lease_token
          WHERE pro_lifecycle_delivery.sent_at IS NULL AND (pro_lifecycle_delivery.lease_until IS NULL OR pro_lifecycle_delivery.lease_until < now()) RETURNING subscription_id`;
      if (!claims.length) continue;
      try {
        // Recheck immediately before delivery. Another subscription may have replaced it.
        const rows = await db()`SELECT p.checkout_email, p.promo_access_ends_at FROM pro_subscriptions p
          WHERE p.stripe_subscription_id = ${id} AND p.promo_access_ends_at IS NOT NULL
          AND ((${kind} = 'reminder' AND p.status = 'active' AND p.promo_access_ends_at > now()) OR (${kind} <> 'reminder' AND p.status = 'canceled' AND p.ended_at <= now()))
          AND NOT EXISTS (SELECT 1 FROM pro_subscriptions other WHERE other.stripe_subscription_id <> p.stripe_subscription_id
            AND (other.clerk_user_id = p.clerk_user_id OR lower(other.checkout_email) = lower(p.checkout_email))
            AND other.status IN ('active','trialing','past_due') AND (other.current_period_end IS NULL OR other.current_period_end > now())
            AND (other.promo_access_ends_at IS NULL OR other.promo_access_ends_at > now()))`;
        if (!rows.length) continue;
        const row = rows[0];
        const mail = lifecycleEmail(kind, row.promo_access_ends_at);
        let headers: Record<string, string> | undefined;
        if (kind === "winback") {
          const prefs = await db()`INSERT INTO pro_email_preferences (email, unsubscribe_token) VALUES (${row.checkout_email}, ${randomUUID()}) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING unsubscribe_token, marketing_unsubscribed_at`;
          if (prefs[0].marketing_unsubscribed_at) continue;
          const url = `${siteUrl()}/pro/email-preferences?token=${prefs[0].unsubscribe_token}`;
          mail.text += `\n\nStop promotional emails: ${url}`;
          mail.html = mail.html.replace('</body>', `<p style="text-align:center"><a href="${url}">Stop promotional emails</a></p></body>`);
          headers = { "List-Unsubscribe": `<${url}>` };
        }
        await proMailer().sendMail({ from: { name: "Neptune Pro", address: process.env.PRO_ACTIVATION_EMAIL_FROM! }, to: row.checkout_email, ...mail, headers });
        await db()`UPDATE pro_lifecycle_delivery SET sent_at = now(), lease_until = NULL WHERE subscription_id = ${id} AND kind = ${kind} AND lease_token = ${token}`;
        sent++;
      } catch (error) { failed++; console.error('[pro/lifecycle] delivery', kind, error); }
      finally { await db()`UPDATE pro_lifecycle_delivery SET lease_until = NULL WHERE subscription_id = ${id} AND kind = ${kind} AND lease_token = ${token}`; }
    }
  }
  return { sent, failed };
}
