# Fixed Stripe checkout prices

Prepared on `codex/stripe-fixed-prices`. This branch has not been deployed. Production settings and the live ELNINO promotion have not been changed by this work.

Checkout now uses stable, server-configured Stripe prices rather than creating an inline product/price on every attempt. Both prices are validated before checkout: active USD recurring licensed prices, exactly $2/month and $20/year, interval count 1, correct live/test mode, active products, and different monthly/annual products. Missing or invalid configuration fails closed; there is no inline-price fallback. These variables must remain server-only.

| Environment | Variable | Value |
| --- | --- | --- |
| Production (not applied) | `STRIPE_PRO_MONTHLY_PRICE_ID` | `price_1Ub2AI6zec8cCFXoRc7R3laD` |
| Production (not applied) | `STRIPE_PRO_YEARLY_PRICE_ID` | `price_1Ub2Bl6zec8cCFXoqnpMUjjn` |
| Local/test | `STRIPE_PRO_MONTHLY_PRICE_ID` | `price_1Ub2DL6zec8cCFXoHO0Ndc59` |
| Local/test | `STRIPE_PRO_YEARLY_PRICE_ID` | `price_1Ub2EE6zec8cCFXoRoE6tVor` |

The existing Stripe API key must match the price environment. Do not expose secret keys or copy production credentials into local test configuration.

## Monthly-only ELNINO

Fixed prices alone do not restrict an unrestricted coupon. Stripe must use a 100%-off repeating one-month coupon whose `applies_to.products` contains **only the fixed monthly product**. Separate prices on one product would not suffice. Other intentional annual promotions remain supported.

Verified against the supplied real test prices on November 12, 2026:

- Monthly product: `prod_VcGkIuf2cbMeWV`; annual product: `prod_VcGlKVNDwCYFC6`.
- Replaced the old test-only three-month ELNINO promotion with one month restricted to the monthly product. Existing test redemptions remain unchanged.
- New test coupon `BHsOsfM0`, promotion `promo_1Ub2hp6zec8cCFXoacCVe1xp`, code `ELNINO`.
- Real Stripe Checkout: monthly ELNINO total $0, card collection `if_required`; annual ELNINO rejected/not discounted; ordinary monthly $2 and annual $20 unchanged.
- Verification created only unpaid test sessions and expired them afterward. No purchases, subscriptions, emails, production reads, or production writes were made by that verifier.

Reproduce with a test key and the two test Price IDs in the environment:

```sh
node scripts/verify-fixed-stripe-prices.mjs
```

The verifier refuses live keys. `--prepare-elnino` explicitly permits replacing the test-mode ELNINO coupon/promotion if the configuration does not match. It does not modify live mode.

## Production rollout prerequisites (not executed)

1. Review/merge this branch separately; do not deploy merely because test mode passed.
2. Archive the unrestricted live ELNINO promotion to prevent new annual redemptions. This does not remove existing discounts. Reconcile completed purchases before touching open checkout sessions; do not cancel legitimate subscriptions.
3. Inventory and expire still-open legacy checkout sessions using inline products, including externally saved links. The new code retires legacy sessions when an attempt is retried, but cannot invalidate an already-open Stripe URL until it is explicitly expired or reaches its own expiry.
4. Configure the two live Price IDs above on the production deployment. Verify their amounts, intervals, mode, and distinct product IDs. No database migration is required.
5. Deploy reviewed code. Replace ELNINO with a 100%-off repeating one-month coupon restricted to the actual monthly product, retaining the intended redemption limits. Restore the same public code only after archiving the unrestricted one. Do not point it at the test product.
6. Smoke-test monthly ELNINO ($0/no card), annual ELNINO rejection, ordinary paid checkout on both plans, activation, expiry scheduling, and Keep Pro. Monitor Stripe webhook delivery, lifecycle errors, and email delivery.

Current paid subscribers and previously redeemed coupons are unchanged. Fulfillment and webhook code still recognize existing subscription/session metadata and do not require historical price IDs to match the new catalog.

## Analytics impact and validation

No PostHog event/property names, distinct IDs, checkout metadata, dedupe keys, plan values, revenue handling, webhook routing, production hosting settings, or cron schedules changed. The only hosting-file change disables automatic preview deployment for `codex/stripe-fixed-prices`, as requested. The yearly application plan still reports the existing `annual` analytics value. Monthly no-card completions retain zero amounts; Keep Pro setup emits no purchase/revenue event.

Automated payment checks cover fixed-price selection, price validation failures, reuse/idempotency, retiring an open legacy session, paid monthly/yearly fulfillment, promo expiry, Keep Pro, renewal, and webhook replay. Existing onboarding, promo analytics, account, and Stripe revenue tests remain required. The real test-mode verifier checks Stripe's product-level coupon enforcement rather than inferring eligibility from mock behavior.

Validation completed for this branch:

- `npm run test:payments`: 71 checks passed (including the existing expiry/Keep Pro checks).
- `npm run test:promo-analytics`, `npm run test:onboarding`, `npm run test:pro-account`, `npm run test:stripe-revenue`: passed.
- `node scripts/test-analytics-tracking.mjs`: passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: zero errors, four existing unused-variable warnings.
- `npm run build -- --webpack`: passed, including all 33 static pages. The first sandboxed attempt could not reach Google Fonts; the network-enabled retry passed.
- `git diff --check`: passed.
- Confirmed no changes to existing PostHog instrumentation/properties, webhook code, production hosting settings, or cron schedules; added only the branch-specific automatic-deployment exclusion.
