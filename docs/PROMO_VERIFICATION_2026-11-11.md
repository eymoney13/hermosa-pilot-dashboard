# Promo lifecycle verification, November 11, 2026

The migration and real Stripe test-mode billing scenarios passed. Production was not changed. The feature remains off by default.

## Isolation

Created Neon schema-only branch `promo-no-card-verification-2026-11-11` (`br-shy-heart-avxtjyd7`) in the existing project. Its endpoint differs from the production endpoint. Before migration, both `pro_subscriptions` and `alert_subscribers` contained zero rows. No customer data was copied. The branch is configured to expire on November 12, 2026 at approximately 6:08pm Pacific.

Applied the subscriptions/payment-first prerequisites, inserted two synthetic legacy rows, and applied `promo-lifecycle-schema.sql` twice in transactions. Both legacy rows retained every existing field. All lifecycle tables, columns, and indexes were created successfully.

Used only the existing `sk_test_` Stripe key with API version `2026-08-26.dahlia`. The test account had no configured webhook endpoints, so generated events could not reach a production endpoint. No live Stripe requests, production database writes, deployment, account-wide billing settings changes, or external email/PostHog sends were performed.

## Real Stripe results

| Scenario | Result |
| --- | --- |
| No-card signup | Completed actual hosted Checkout in Chrome with a 100% repeating one-month promotion. After applying the code, Stripe removed the card form and displayed $0 due. |
| Reconciliation and activation | Actual application purchase functions scheduled cancellation at the discount end and monthly period end before verified-email account claim. Activation copy used no-card language. |
| Expiry | `sub_1UanWK6zec8cCFXoJYue2UrA` canceled automatically at its deadline. Its only invoice was $0, with no payment intent or paid renewal. The application returned a lapsed state, withheld Pro entitlement, and excluded its follower from actual SQL-based Pro alert sending. |
| Keep Pro setup | Completed actual hosted setup Checkout using Stripe's published 4242 test card. The application's setup handler cleared cancellation, retained the original renewal date, and did not create an immediate charge. Duplicate completion was safe. |
| First Keep Pro renewal | Invoice `in_1Uanbf6zec8cCFXonZZg4ZNA` was paid for **200 cents USD**. PaymentIntent `pi_3UancP6zec8cCFXo0uUphxab` was `succeeded` with `amount_received=200`. Exactly one paid invoice and one payment attempt were observed. |
| Renewal period | The charged invoice line covers December 11, 2026 through January 11, 2027 in Pacific time, beginning exactly at the original free-month deadline. The subscription remained active. Stripe finalized the renewal invoice after its usual simulated one-hour delay. |
| Late card setup | Opened setup before expiry, advanced the clock past expiry, and completed the actual setup afterward. `sub_1Uangc6zec8cCFXothCSsFQJ` remained canceled, with no paid invoice or restored Pro access. |
| Notices | Reminder inside the three-day window, ended notice, and seven-day win-back were captured locally. Repeated lifecycle runs did not duplicate messages. |
| Analytics | Captured the existing `payment_succeeded` event with zero amounts and the original distinct-ID/deduplication contract. Setup did not emit a purchase event. Existing invoice tracking continues to exclude test-mode revenue. No production PostHog events were transmitted. |

## Defects found and corrected

1. **A real $0 subscription Checkout returned `payment_status: "paid"`.** The implementation had only scheduled promos for `no_payment_required`. Reconciliation now also recognizes `amount_total === 0`. A regression fixture now reproduces the real response, while retaining coverage for `no_payment_required`.
2. **Stripe rejects simultaneous `cancel_at` and `cancel_at_period_end` updates.** Keep Pro now clears `cancel_at` without the redundant second parameter. The regression adapter rejects that invalid combination.
3. The activation page now describes a free promo without claiming that payment was received.

## What this run does and does not cover

`scripts/verify-promo-stripe-test.mjs` loads the real application purchase, entitlement, lifecycle, alert, revenue, and webhook functions. Stripe API calls, hosted subscription/setup Checkout, test-clock transitions, PaymentIntent payment, and Neon SQL are real.

To avoid modifying real users or sending messages, Clerk current-user/invitation calls use test adapters; SMTP and PostHog delivery use local capture. Actual Stripe events are retrieved and replayed through the webhook handler using its normal signature verification and a local test signing secret. This validates handler behavior and replay safety; it does **not** validate Stripe CLI/network webhook transport, browser-based Clerk invitation acceptance, external mailbox delivery, or the running Next.js dashboard as a complete browser end-to-end test.

The application's Date and SQL `now()` are aligned with Stripe's simulated time in the harness, while SQL still executes on the real test database. This is necessary because advancing Stripe's clock does not advance the Neon server clock.

## Regression checks

Passed after the fixes:

- 46 payment-flow checks, including migration preservation and repeatability.
- Promo analytics, event/property preservation, setup isolation, notice rendering, cron authorization, and hosting configuration checks.
- Existing Stripe revenue, webhook, engagement/map analytics, and account-page checks.
- Existing alert and California checks.
- ESLint for changed application/test files and `git diff --check`.

Full TypeScript/lint validation still has the pre-existing blockers documented in `PROMO_LIFECYCLE.md`: duplicate type directories, the unrelated missing `sendAlertVerification` export, and existing lint errors in other test scripts.

## Evidence and repeatability

- [Structured results](promo-verification/results-2026-11-11.json)
- [No-card Checkout screenshot](promo-verification/no-card-checkout.png)
- [Isolated Neon branch screenshot](promo-verification/isolated-neon-branch.png)
- [Paid test renewal screenshot](promo-verification/keep-pro-first-renewal-paid.png)
- [Paid invoice in Stripe test mode](https://dashboard.stripe.com/test/invoices/in_1Uanbf6zec8cCFXonZZg4ZNA)

The local harness was stopped after verification. It requires an explicit secrets file containing a test-mode Stripe key and isolated database URL, `PROMO_TEST_DATABASE_HOST`, and `NEPTUNE_TEST_DATABASE_CONFIRMED=true`. It never reads `.env.local` automatically. The database migration helper `scripts/apply-payment-first-test-schema.mjs` now includes the promo lifecycle migration and retains its explicit test-database confirmation gate.

Test clocks and their associated objects were left available for inspection and will expire automatically. No production rollout flag was enabled.

## Follow-up: inline signup

The later [inline signup browser verification](PROMO_ONBOARDING_VERIFICATION_2026-11-11.md) now covers real Clerk password creation, email-code verification, and automatic activation on the running local dashboard. The earlier Clerk-adapter limitation above applies to the initial billing harness run, not that subsequent browser test. External mailbox delivery and Stripe webhook network transport remain unverified.

## Clean PR validation follow-up

This report records the earlier isolated test run. The PR was subsequently rebuilt on current `main`, preserving its anonymous-checkout retry logic, annual promo behavior, and alert provider fixes. The earlier TypeScript and lint blockers are resolved in that clean worktree; see [current validation and rollout gates](PR_VALIDATION.md). The prior real Stripe/Clerk browser runs were not repeated against this final PR commit.
