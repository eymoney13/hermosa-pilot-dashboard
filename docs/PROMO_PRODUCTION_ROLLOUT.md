# Production rollout and rollback

Prepared for PR #137. This is a proposed procedure, not authorization to execute it. Production has not been changed. The application code tested in the final isolated rehearsal is commit `2ae5bd6166d0383850650c888a741473253665ec`.

## Before the launch window

Record the currently deployed Vercel deployment ID/commit and current production Clerk signup settings. Confirm which production Neon branch/endpoint and database the deployment uses without copying credentials into logs or PR comments. Confirm a recoverable Neon restore point or backup and its retention window before changing the database. Export the affected subscription schema and row counts/status counts to protected local storage as a comparison baseline; do not commit customer records.

The database migration must precede this code deployment even when `NEPTUNE_PROMO_LIFECYCLE_ENABLED` is absent or false. Existing subscription and alert queries select the new columns unconditionally. Do not run the test migration helper against production. The reviewed production migration is only `scripts/promo-lifecycle-schema.sql`.

The production change requires separate approval for (1) the additive database migration, (2) production Clerk signup configuration, and (3) merge/deployment and eventual promo activation. No test secret, test database URL, development Clerk key, or local webhook secret belongs in production.

## Migration

Use the production SQL editor with the correct branch visibly selected, or a protected direct database connection. Within a short transaction, apply the exact reviewed SQL from `scripts/promo-lifecycle-schema.sql`; set a bounded lock timeout so a busy table causes a retry during the launch window rather than a prolonged lock wait. If the transaction fails, roll it back and stop deployment.

Verify the following before deploying:

- `pro_subscriptions` has nullable `promo_access_ends_at`, `promo_redeemed_at`, and `ended_at` timestamps.
- `pro_lifecycle_delivery`, `pro_email_preferences`, `pro_direct_checkout_reconcile`, `pro_promo_operation`, and `pro_promo_redemptions` exist, including their keys/constraints.
- The promo-expiry partial index and reconciliation retry timestamp column exist.
- Existing subscription counts/status counts and existing non-promo fields match the baseline, allowing for legitimate concurrent Stripe updates. No existing paid subscription should gain a promo expiry merely from the migration.
- The current deployed app, ordinary paid access, and alert cron remain healthy.

The migration is additive and rerunnable. A restore of the entire production database is not the normal rollback: it could erase legitimate payments or user changes made since the backup.

## Clerk production settings

Select the production instance, independently of the development instance used in rehearsal. Configure public/Open signup, email address required, password required, and email verification by one email code. Preserve existing sign-in options, session protections, CAPTCHA/bot protection, and other security controls. Keep Clerk Test mode disabled in production.

Confirm production keys/domains and the existing sign-in/sign-up destinations resolve to the live app. The new app signup route validates an active receipt before showing the signup widget; public Clerk account creation by itself does not grant Pro. Entitlement still requires the server-side verified checkout-email match and a current subscription. The expanded ability to create accounts is a deliberate access change requiring approval.

Apply these settings immediately before the reviewed deployment, not days in advance. Existing buyers must remain able to sign in and recover paid purchases. If any required production setting is uncertain, stop before deployment rather than guessing.

## Deploy with new no-card entry disabled

Deploy the reviewed PR after migration and Clerk readiness. Keep `NEPTUNE_PROMO_LIFECYCLE_ENABLED` absent/false for this first deployment. Preserve the existing live-billing/payment-first switches and Stripe keys; do not toggle live billing merely to deploy this feature.

Confirm `NEXT_PUBLIC_SITE_URL` is the existing HTTPS production origin, live Clerk keys and existing Stripe webhook signing secret are correct, and `PRO_ACTIVATION_EMAIL_FROM`, `GMAIL_APP_PASSWORD`, and `CRON_SECRET` are configured through the hosting secret store. Existing PostHog project credentials, event/property names, and reverse-proxy configuration stay unchanged.

Review Stripe's existing webhook endpoint event subscriptions for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`, and the existing invoice revenue events. Preserve any other existing event subscriptions. The added lifecycle cron is `/api/pro/lifecycle` at 16:00 UTC; every existing cron schedule and deployment exclusion stays intact.

Run a controlled smoke check using an approved internal customer and an explicitly approved real spending limit before making any live purchase. Verify monthly/yearly signup return, actual email delivery, paid access, account/billing links, and webhook responses. Check dashboard behavior for anonymous readers and existing subscribers. Confirm ordinary paid subscriptions have no promo deadline, and verify existing PostHog completion properties without mistaking test/internal users for customers.

## Enable the no-card promotion

Create/review the intended live monthly promotion: 100% off, repeating for exactly one month, with appropriate redemption limits and expiration. No-card provisioning deliberately rejects unsupported free monthly discount shapes. Existing annual promotion/card behavior is preserved; review active monthly codes before enabling the flag, because fully discounted marked monthly checkouts enter this lifecycle.

After rollout approval, enable `NEPTUNE_PROMO_LIFECYCLE_ENABLED=true` and validate one controlled promo. Confirm `cancel_at` equals the discount end and monthly period end, the local promo deadline matches, no card is required for the free checkout, and no unintended proration exists. Verify Keep Pro setup does not immediately charge or alter another subscription's payment method.

Monitor checkout/activation errors, Stripe webhook failures/retries, actual cancellation schedules, cron results, mail delivery, and analytics monetary amounts. `payment_succeeded` includes zero-dollar completions; paying-customer reports must filter positive amounts. Keep Pro setup must not appear as a new purchase or revenue event. Expand distribution only after these checks pass.

## Rollback

If only new promo acquisition is problematic, deactivate the specific live promotion code first while retaining the application, lifecycle processing, and Keep Pro support for existing promos. Do not cancel existing paid subscribers or disable Stripe failed-payment recovery globally.

For a critical provisioning issue, disable the lifecycle flag as containment. This also pauses cron notices and Keep Pro setup, so it is not a transparent rollback for existing promo users. Existing scheduled Stripe cancellations remain in effect. The new code safely cancels an unprovisioned marked no-card checkout completed while provisioning is disabled. Reconcile affected in-flight checkouts and communicate through the support process before reopening entry.

Do not immediately restore the old application while no-card checkouts remain open or unprovisioned: the old application does not schedule their no-card expiry. Drain/reconcile or explicitly expire those test-reviewed sessions first, verify every active promo has its Stripe cancellation schedule, and preserve webhook handling needed by existing Keep Pro sessions. Then restore the recorded prior Vercel deployment if necessary.

Leave the additive schema in place during application rollback. Do not DROP lifecycle tables or redemption history. Stripe is still the authority for payments/subscriptions; inspect the current state before any manual correction and do not create replacement charges to resolve an activation problem.

Revert production Clerk signup mode only if required by the specific incident, after considering paid buyers who have not yet finished signup. Preserve password/email verification and existing-user sign-in throughout recovery. Production changes and any live purchases require explicit approval at execution time.
