# No-card monthly Pro promotions

PR prepared on `codex/promo-onboarding-pr` from current `main`; original `feature/promocodenocreditcard` working tree retained separately.

## Deployment requirements

The implementation is off by default. Do not enable `NEPTUNE_PROMO_LIFECYCLE_ENABLED=true` until the migration and Stripe test-mode checks below pass. Existing billing kill switches still apply.

Apply `scripts/promo-lifecycle-schema.sql` to an isolated database after the existing subscriptions and payment-first schemas. It is rerunnable. The new columns are required by subscription queries even with promo entry disabled, so apply the migration before deploying this code. Do not use the production `.env.local` database for rehearsals. No production migration, live Stripe changes, deployment, or real email delivery was performed. Subsequent real Stripe test-mode and isolated Neon verification is recorded in `PROMO_VERIFICATION_2026-11-11.md`.

Configure `PRO_ACTIVATION_EMAIL_FROM`, `GMAIL_APP_PASSWORD`, the existing Stripe/Clerk settings, and `CRON_SECRET`. Append-only hosting change: `/api/pro/lifecycle` at 16:00 UTC daily, which is 8am Pacific in standard time and 9am during daylight time. Existing crons and deployment exclusions remain unchanged.

In Stripe test mode, create a 100% repeating one-month coupon and a promotion code. No-card promo entry is available only on monthly checkout with the lifecycle flag enabled. Existing annual promo entry and required renewal-card collection remain unchanged. With the lifecycle flag off, existing monthly checkout also retains its required-card behavior. Keep active checkout codes restricted to the supported coupon shape. Unsupported zero-dollar no-card monthly discounts are canceled without a final invoice or proration before fulfillment, rather than allowed to renew accidentally. A returning customer's saved card does not remove the requirement to explicitly choose Keep Pro.

Use Stripe's first-transaction promotion restrictions where appropriate. Signed-in users with recorded promo redemption cannot enter another code. Redemption history survives conversion and expiry. A durable, unique normalized-email redemption ledger also rejects a repeat free redemption made while signed out, canceling that new subscription without a paid invoice. It does not identify one person across unrelated accounts or emails. The current Checkout switch disables all code entry for a known prior redeemer, including other discount codes; supporting separate paid-discount eligibility would require a dedicated code-validation flow.

Do not disable Stripe failed-payment emails account-wide. Paid subscribers retain their existing payment recovery behavior.

## Stripe test-mode release checks

Use test keys, a branch database, test Clerk accounts, and a controlled email recipient. Keep live billing disabled during the rehearsal.

1. Complete monthly Checkout with the supported code. Confirm no card is requested, the invoice is $0, the subscription is active, and `cancel_at` equals both the discount end and the monthly period end. Inspect pending invoice items for unintended prorations.
2. Exercise activation before webhook delivery. Confirm scheduling precedes account claim and the activation email includes the deadline without claiming payment.
3. With a Stripe test clock, advance through expiry without adding a card. Confirm cancellation, no paid renewal/payment attempt, ended notice, free-plan access, a visible account control, and no Pro alerts.
4. On another promo, finish Keep Pro before expiry. Confirm the subscription default payment method is set, scheduled cancellation clears, and no charge occurs immediately. Advance through the original deadline and inspect the actual first $2 invoice, payment, and next monthly renewal date. This real Stripe billing-boundary check is mandatory before enabling the rollout flag; mocked tests do not prove Stripe invoice timing.
5. Open setup before expiry and finish after it. Confirm no canceled subscription is resumed, no purchase event is sent for setup, and the account page offers a new paid subscription.
6. Replay checkout, setup, and subscription-deleted events. Reconcile after a failed scheduling request. Confirm no additional subscription, cancellation reversal, or duplicate recorded revenue.
7. Exercise lifecycle reminders, seven-day winback, short-promo exclusion, email failure/retry, abandoned leases, unsubscribe, and suppression after resubscription. SMTP may deliver duplicates following an ambiguous acceptance or a process failure after sending; delivery is recoverable, not exactly once.
8. Check PostHog: existing completion and funnel names/properties remain intact; free completion has zero amounts; setup creates no purchase/revenue event; invoice revenue remains invoice-driven. Dashboards counting `payment_succeeded` now include free fulfillments and should filter positive amounts when reporting paying customers.

## Automated validation

- `npm run test:payments`: PostgreSQL-backed fulfillment, migration, ownership, expiry, setup replay/race, redemption history, lifecycle windows, suppression, and retry checks.
- `node scripts/test-pro-account.mjs`: account states, billing disclosure and server-action authorization.
- `node scripts/test-promo-analytics.mjs`: free completion property contract, stable dedupe key, setup isolation, lapse notice rendering/click tracking, cron auth and hosting preservation.
- `node scripts/test-stripe-revenue.mjs`: invoice filtering, delivery/replay dedupe, retries and webhook behavior.
- `node scripts/test-analytics-tracking.mjs`: existing engagement and map tracking.
- `npm run test:alerts` and `npm run test:california`: existing alert and California behavior, including expiry eligibility.
- `npx tsc --noEmit` and `npm run lint`.

The clean PR worktree uses `npm ci`; normal TypeScript discovery passes without overrides. The older checkout’s duplicate empty type folders are not included in the PR. Current main already supplies `sendAlertVerification`; it is preserved. Script module-variable lint errors are fixed. See `PR_VALIDATION.md` for current results and remaining rollout gates.

Before deploying, configure the production Clerk instance for public signup with password and email-code verification. Only the development instance was changed during testing. Keep this PR in draft until production migration, Clerk settings, and rollout timing are approved. This PR branch has automatic Vercel deployment disabled.
