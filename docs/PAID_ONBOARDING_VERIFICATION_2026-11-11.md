# Paid monthly and yearly account setup verification

Verified November 11, 2026 on branch `feature/promocodenocreditcard`. Both ordinary paid purchase paths use the same inline account setup as free promos:

**Checkout → set password → verify one email code → automatic Pro dashboard access.**

The shared activation handler already applied to every completed payment-first Checkout. Added explicit paid-plan regression coverage, documented that shared contract, and updated signup copy to acknowledge paid purchases without calling them free promos. No new signup/activation event names were introduced.

## Real browser results

Used the running Next.js application on localhost, actual Stripe test Checkout with the published 4242 test card, new reserved Clerk development email addresses, Clerk's test verification code, and the isolated Neon test branch `br-shy-heart-avxtjyd7`.

| Plan | Paid with no code | Password and verification | Result |
| --- | --- | --- | --- |
| Monthly | $2.00 USD, no discount | Real Clerk password setup, one email-code verification | Automatically reached `/california?pro=activated`; three-day forecasts unlocked |
| Yearly | $20.00 USD, no discount | Real Clerk password setup, one email-code verification | Automatically reached `/california?pro=activated`; three-day forecasts unlocked |

Backend checks confirmed both invoices were paid, Stripe subscriptions used their expected monthly/yearly billing intervals, both Clerk users had verified email addresses and passwords, and each database row belonged to the correct user with the correct plan and price. Neither paid row has a promo deadline or promo-redemption timestamp, and neither subscription has scheduled cancellation.

Monthly invoice: `in_1UaoQg6zec8cCFXoDvrI3TMS`.
Yearly invoice: `in_1UaoTD6zec8cCFXocMmubeL1`.

The browser tests used reserved Clerk test emails, so no verification messages were sent to real inboxes. No live charges, production database writes, production auth changes, or deployment occurred. Clerk development public signup remains enabled under the user's prior approval. Production is still unchanged; its invite-only mode must be addressed separately before deploying direct signup.

## Regression coverage

- `npm run test:payments`: 48 checks, including verified ownership and paid access without promo expiry for both plans.
- `node scripts/test-pro-onboarding.mjs`: paid monthly/yearly routing, password/setup copy, receipt-preserving signin/signup, verification return and automatic activation.
- `node scripts/test-promo-analytics.mjs`: preserves `payment_succeeded`, distinct ID, deduplication key, amounts, zero discount fields, and the existing `annual` plan property for yearly purchases.
- Existing Stripe revenue/webhook and account-page tests passed.
- ESLint on changed files and `git diff --check` passed.

Full-repository TypeScript/lint blockers documented in the earlier verification report remain unrelated to this change.

## Evidence

- [Backend verification](paid-onboarding-verification/results-2026-11-11.json)
- [Monthly password setup](paid-onboarding-verification/monthly-password.png)
- [Monthly verification](paid-onboarding-verification/monthly-verification.png)
- [Monthly Pro dashboard](paid-onboarding-verification/monthly-dashboard.png)
- [Yearly password setup](paid-onboarding-verification/yearly-password.png)
- [Yearly verification](paid-onboarding-verification/yearly-verification.png)
- [Yearly Pro dashboard](paid-onboarding-verification/yearly-dashboard.png)

## Clean PR validation follow-up

This report records the earlier isolated test run. The PR was subsequently rebuilt on current `main`, preserving its anonymous-checkout retry logic, annual promo behavior, and alert provider fixes. The earlier TypeScript and lint blockers are resolved in that clean worktree; see [current validation and rollout gates](PR_VALIDATION.md). The prior real Stripe/Clerk browser runs were not repeated against this final PR commit.
