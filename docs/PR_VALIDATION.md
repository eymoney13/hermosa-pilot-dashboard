# Promo and purchase onboarding PR validation

Prepared November 11, 2026 from `origin/main` at `b147e11` in a separate worktree on `codex/promo-onboarding-pr`. The original feature branch and unrelated working files were retained. No production database, live Stripe, production Clerk settings, or deployed environment was changed.

## Final branch checks

- Fresh locked dependency installation: `npm ci --no-audit --no-fund`.
- `npx tsc --noEmit`: passed without type-discovery overrides.
- `npm run lint`: passed, zero errors. Four existing unused-variable warnings remain in the two data modules.
- `npm run build -- --webpack`: passed, including TypeScript and all 33 static pages. Network access was required for the existing Google Fonts fetch.
- `npm run test:payments`: 60 checks passed. Includes repeatable migration and existing-row preservation in isolated PostgreSQL, verified email ownership, anonymous retry/plan switching, existing annual free purchase behavior, no-card expiry, Keep Pro setup and replay, late setup, failed scheduling, repeat-redemption prevention, lifecycle retries and opt-out, flag-off safety, and ordinary paid monthly/yearly activation.
- `npm run test:onboarding`: passed for promo and paid monthly/yearly receipt-bound signup, prefilled checkout email, authentication recheck, failed claims, and automatic activation after Clerk returns.
- `npm run test:pro-account`: passed for free, lapsed, active, payment issue, and promo presentation; billing actions reauthorize.
- `npm run test:promo-analytics`: passed for the existing `payment_succeeded` event and property contract, annual plan value, browser distinct ID, zero-dollar completion, stable dedupe key, setup isolation, lapse CTA context, cron authorization, and existing hosting settings.
- `npm run test:stripe-revenue`: passed for signed webhook handling, invoice-based revenue, retries, historical reconciliation, leases, and deduplication.
- `node scripts/test-analytics-tracking.mjs`: existing engagement and map checks passed.
- `npm run test:alerts`: 15 checks passed, including expiry with stale active status.
- `npm run test:california`: 13 checks passed, including expired promo releasing overlapping grandfathered alerts.
- `npm run test:alerts-resend`: 55 checks passed for provider settings, rate limiting, retries, and durable delivery.
- `npm run test:alert-email`: 18 checks passed, including byte-identical grandfathered email content.
- `node scripts/test-california-free-alerts.mjs`: 13 checks passed, preserving accountless free alerts and Pro follow settings.
- `node scripts/test-beach-requests.mjs`: passed.
- `node --check scripts/verify-promo-stripe-test.mjs`: passed. The real Stripe harness was adapted to the retained anonymous `startPurchase` API; it was not rerun for this PR.
- `git diff --check`: passed.

Expected failure-path logs in payment/revenue tests are deliberate fixtures; the scripts exit successfully.

## Analytics compatibility

No existing PostHog event or property names are renamed or removed. Checkout keeps the existing browser-attempt idempotency behavior and `posthog_distinct_id` metadata. Paid monthly/yearly amounts and the `annual` analytics plan value remain unchanged. Free fulfillment uses the existing completion event with zero monetary amounts; setup does not emit purchase or revenue events. The lapse CTA adds only a `lapsed_notice` value to the existing `cta_location` property. Invoice revenue remains driven by the existing invoice synchronizer.

No live PostHog delivery was used for these regression tests. Existing dashboards that count completion events as paying customers must filter positive amounts.

## Compatibility fixes during PR preparation

The implementation was applied to current main without rolling back its anonymous checkout recovery, annual card/promo behavior, account payment-issue handling, accountless California alerts, or Resend delivery fixes. A Stripe session metadata marker identifies newly created no-card checkouts, so enabling the flag does not retroactively put existing required-card free purchases into the new lifecycle. In-flight marked no-card purchases are safely canceled if provisioning is disabled before completion.

The old dependency tree's duplicate empty type directories are avoided with a fresh install. Current main's `sendAlertVerification` export is retained. Test module variable names and stale alert fixture adapters were corrected without weakening assertions or type checking.

## Before production rollout

Keep this PR in draft until a controlled preview rehearsal on the final reviewed commit is complete. Earlier real Stripe test-clock expiry/first-renewal and Clerk password/email-code browser evidence is linked from `PROMO_LIFECYCLE.md`; those runs predate this final integration. They do not prove external email delivery or webhook network transport on the final deployment.

1. Rehearse the final commit against an isolated database, Stripe test mode, and Clerk development instance, including external test mailbox delivery and Stripe webhook transport. Recheck promo expiry and the first Keep Pro renewal after the compatibility changes.
2. Coordinate and approve the additive production migration **before** deployment: the new subscription columns are required even with promo entry disabled.
3. Configure production Clerk public signup with password and email-code verification before enabling the new signup route. Only development signup was broadened previously; production remains unchanged.
4. Review the supported repeating one-month 100% coupon, feature flag, mail credentials, webhook events, and cron secret. Keep the new flag off until rollout approval.
5. Enable a controlled rollout, inspect checkout/activation/webhook errors and actual analytics amounts, then broaden access after smoke checks.

The PR branch has automatic Vercel deployment disabled. Existing deployment exclusions and all existing cron schedules are retained; the lifecycle cron is added at 16:00 UTC. This PR does not authorize merging, migrating production, changing production configuration, or enabling live billing.
