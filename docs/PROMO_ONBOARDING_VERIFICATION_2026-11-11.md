# Inline account setup verification, November 11, 2026

The new workflow passed a real browser test on the running local Next.js application:

1. Opened monthly checkout from the application, using its existing checkout action.
2. Applied the supported one-month promotion and completed real Stripe test Checkout without a card.
3. The success return went through `/pro/activate` directly to the account-setup form. There was no request-activation-email page.
4. Created a real Clerk development account with a reserved `+clerk_test@example.com` address and a password.
5. Clerk displayed the email verification-code form. Used Clerk's documented test code `424242`; it did not send a real email.
6. Verification automatically returned through the activation action to `/california?pro=activated` without another activation click.
7. The signed-in user menu and unlocked three-day forecasts appeared. Backend checks confirmed the Clerk email was verified, the password was enabled, and the same Clerk user owned the active promo subscription in the isolated Neon branch.

The test used subscription `sub_1UaoBY6zec8cCFXorQHgT4hI` and user `user_3LzMpoLCkcFI7LBW7pODprDLoyZ`. No password or private keys are included in the evidence.

## Development configuration

The browser test initially found Clerk development was in Restricted / Invite-only mode. The user explicitly approved enabling public signup **in development only**. Changed development instance `ins_3Jo3WkFWM7mEqP6XtbndPq057i8` to Open / public. Passwords and email-code verification remain required. Production configuration was not changed.

A future production rollout of this inline flow will require a separate production signup-mode decision; leaving Clerk production invite-only will block direct signup. Accounts alone still do not grant Pro, and activation still requires the verified checkout email.

## Implementation

- Signed-out active checkout returns redirect to receipt-bound signup.
- Signup prefills the checkout email and retains the receipt when switching to signin.
- A signed-in return automatically submits a server action that rechecks the subscription, authentication, and verified email before claiming it.
- Failed ownership checks stop automatic retries and keep the receipt for recovery. Recovery email remains available separately.
- Already-provisioned promo reads avoid the mutation lease. This resolves a contention error observed when signup and activation render concurrently.
- Existing checkout and activation PostHog event/property names remain unchanged. The successful return still uses `pro=activated`, preserving `pro_activation_dashboard_opened`.

## Validation

Passed:

- `node scripts/test-pro-onboarding.mjs`: receipt-bound redirects, signup prefill, automatic claim, failed ownership recovery, authentication recheck, inactive receipts, and signin/signup switching.
- `npm run test:payments`: all 46 checks, including wrong/unverified email rejection and concurrent provisioning behavior.
- Existing account-page, promo analytics, Stripe revenue/webhook, and engagement/map analytics tests.
- ESLint on changed files and `git diff --check`.

TypeScript still reports the pre-existing unrelated missing `sendAlertVerification` export in `app/actions/californiaAlerts.ts`; no new type errors were reported by the explicit-types check.

This test covers the actual local app, hosted Stripe Checkout, real Clerk password/code signup, and application activation. External mailbox delivery remains untested because Clerk suppresses delivery to its reserved test addresses. Stripe webhook network transport is unchanged and remains separately unverified, as documented in the earlier billing report. Local analytics uses a non-production key.

## Evidence

- [Backend verification results](promo-onboarding-verification/results-2026-11-11.json)
- [Development-only public signup](promo-onboarding-verification/clerk-development-open.png)
- [Email verification step](promo-onboarding-verification/email-verification.png)
- [Verified Pro dashboard](promo-onboarding-verification/verified-pro-dashboard.png)

## Paid subscriptions

The same flow was subsequently verified in the real local browser for full-price monthly and yearly purchases without promotion codes. See [paid onboarding verification](PAID_ONBOARDING_VERIFICATION_2026-11-11.md) for payment, Clerk account, and database evidence.

## Clean PR validation follow-up

This report records the earlier isolated test run. The PR was subsequently rebuilt on current `main`, preserving its anonymous-checkout retry logic, annual promo behavior, and alert provider fixes. The earlier TypeScript and lint blockers are resolved in that clean worktree; see [current validation and rollout gates](PR_VALIDATION.md). The prior real Stripe/Clerk browser runs were not repeated against this final PR commit.
