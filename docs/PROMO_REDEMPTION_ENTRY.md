# Promo redemption entry point

Prepared for review on `codex/direct-promo-redemption`; not deployed. No production settings or live Stripe objects changed.

## Experience

Both California/sandbox Pro offer components now have a third CTA, **Have a promo code? Redeem here**, alongside the existing monthly/annual choices. It opens `/pro/redeem`; entering ELNINO opens the existing monthly Stripe Checkout with the validated promotion already applied. Stripe collects the email, with $0 due and no required card. Existing password/email-code onboarding activates the subscription. Existing expiry, notices, and Keep Pro support remain in use.

The offer is one calendar month beginning at Stripe checkout completion, not a separate 30-day grant. The existing activation/account pages show the actual expiry date. No separate account database, entitlement mechanism, or subscription lifecycle is introduced.

## Validation and retries

Server-side validation trims/case-normalizes the entered code, checks the existing promo lifecycle flag, queries active Stripe promotions, and requires a valid 100%-off repeating one-month coupon restricted exclusively to the fixed monthly product. The Stripe API explicitly expands the coupon's `applies_to` field, which is omitted by default. Missing/malformed/unknown, expired, exhausted, partial, annual-product, unrestricted, ambiguous, and customer-specific codes fail closed. Stripe still enforces its own restrictions and limits when Checkout is created/completed.

The redemption route fixes the plan to monthly and never accepts a browser-supplied Price ID. `discounts` pre-applies the resolved Stripe promotion ID; it is not combined with `allow_promotion_codes`. An internal `redeem_promotion_id` session metadata field distinguishes promo-entry attempts from ordinary checkout. Unchanged retries reuse a session; switching code/entry path expires the previous open session and rotates the database/idempotency attempt before creating a replacement. Existing verified-email ownership and repeat-redemption checks remain in effect.

Errors return a generic retry message. Safe diagnostics distinguish configuration, invalid promotion, account eligibility, Stripe provider, known database, and internal failures without serializing error messages/payloads, codes, emails, or tokens. The raw code is submitted in a Server Action form, not placed in a URL. No new database migration or environment variables are needed. Existing fixed Price IDs and `NEPTUNE_PROMO_LIFECYCLE_ENABLED` are required. The flag is passed from the server through both offer components: disabling it hides the third CTA without removing the paid choices. Automatic Vercel deployment is disabled for this branch; any later merge/deployment requires separate authorization.

## Analytics

Existing paid CTA handlers, event/property names, offer-view observer target, checkout-page/start events, distinct ID, payment completion dedupe keys, zero-dollar amounts, and `annual` plan value are preserved. The third button emits the additive `promo_redemption_clicked` event with the existing board/CTA/page/beach context. It does not pretend to be a paid-plan CTA click. The redemption page reuses the existing monthly checkout page/start events. No raw promotion code, email, or new purchase/revenue event is emitted. Webhook/revenue handling is unchanged.

## Verification

- 89 payment-flow checks, including pre-applied promotion, same-session retries, ordinary/promo switching, invalid/expired/exhausted codes, annual rejection, existing lifecycle and Keep Pro behavior.
- Dedicated `npm run test:promo-redemption`: both CTA placements, fixed-monthly server action, generic errors, disabled feature gate, analytics distinct ID preservation.
- Existing onboarding, promo analytics, Stripe revenue/webhook, and Pro account tests.
- TypeScript, lint (zero errors; four existing warnings), production Webpack build.
- Real Stripe test-mode verification through the actual `checkoutPromotion` helper: ELNINO accepted, invalid code rejected, pre-applied Checkout total 0, card collection `if_required`. The unpaid test session was expired; no purchase/subscription/email was created.
- Local component layout inspected in browser; the full running Next/Clerk signup rehearsal below also passed.

Run the real Stripe verifier with a test key and `STRIPE_PRO_MONTHLY_PRICE_ID` set to the fixed test monthly price:

```sh
node scripts/verify-promo-entry.mjs
```

It refuses live keys. The fixed-price verifier was also corrected to explicitly expand coupon product restrictions when checking an existing test ELNINO configuration, preventing unnecessary replacement of an already-correct code.

## Full local signup rehearsal — November 12, 2026

Used only development Clerk, Stripe test mode, and existing schema-only Neon branch `br-shy-heart-avxtjyd7`. Production untouched. The local environment uses an explicit Gmail sender; the previously missing sender configuration was corrected and SMTP verified. No credential is committed.

- Running dashboard: flag off hid the promo CTA while monthly/yearly remained available; restored flag on and followed the actual third button.
- Entered ELNINO, completed $0/no-card test Checkout `cs_test_a0kmzZbfiVWaAqG05vyfVxk6xeUCu533Eqx3fL5yoYHPS2Q173dsEvE36I`, created a fresh owned development account password, received and entered a real email code, and automatically reached `/california?pro=activated`.
- Verified password enabled, checkout email verified, receipt linked to that account, and no other active subscriptions on it.
- Before Keep Pro: no payment method; Stripe cancellation, monthly period end, and database promo deadline all matched `2026-12-12T21:52:18Z` (December 12 at 1:52 p.m. Pacific).
- Completed Keep Pro with Stripe's fake 4242 card only. Cancellation removed, subscription payment method set, original renewal anchor unchanged. Next invoice preview is 200 cents; only issued invoice is $0. No real card or real charge.
- Real test webhook deliveries returned 204. A local-only analytics sink captured existing `payment_succeeded` with monthly plan, amount 0, subtotal 200, discount 200, `livemode=false`, distinct ID, and dedupe UUID. Keep Pro added no purchase/revenue event. Browser PostHog production delivery remains disabled locally; automated browser event contract tests passed.
- Attempting to activate the earlier receipt with this different account was rejected; its own Pro entitlement remained active.
- Browser preview at `127.0.0.1` was abandoned because that origin is not configured for the Clerk/Next development setup. The successful full rehearsal used the supported `localhost:3002` origin; no security controls were disabled.

Sanitized backend evidence and screenshots are in `/tmp/neptune-promo-redemption-rehearsal/`. This rehearsal verifies the scheduled deadline; it does not advance time to December or re-exercise the first renewal. Existing automated expiry/renewal coverage remains required.

## Production rollout (not executed; separate approval required)

1. Review the PR and approve merge/deployment explicitly. This PR branch has automatic Vercel deployments disabled. Merging `main` normally triggers production deployment.
2. Confirm existing production fixed Price IDs, Stripe live key/webhook secret, Clerk password/email-code settings, site URL, Gmail activation sender/password, and database configuration are present and correct. No new environment variables or schema migration are required; do not copy the local test environment file into production.
3. Verify the active live ELNINO promotion is valid, 100% off repeating for one month, and restricted exclusively to the fixed monthly product. Preserve its remaining redemption limit and existing redemptions; this feature does not require replacing a correctly configured code.
4. Record the current production deployment/commit for rollback. Preserve existing PostHog credentials, reverse-proxy configuration, webhook subscriptions, and cron schedules.
5. Merge and verify the resulting production deployment is Ready on the intended domains. With the existing lifecycle flag true, the new CTA appears; if the flag is false, the CTA is hidden and paid options remain available. Turning that flag off also pauses existing promo lifecycle/Keep Pro processing, so it is not merely a cosmetic button switch.
6. Run a controlled live smoke: third button, invalid-code feedback, ELNINO pre-applied $0/no-card Checkout, verified-email activation, matching expiry/cancellation schedule, and ordinary monthly/yearly checkout. Complete a live purchase or card setup only with explicit approval for any real payment or future renewal commitment.
7. Check existing PostHog event/property names, distinct ID, zero-dollar discount amounts and dedupe behavior; confirm the additive promo CTA event and that Keep Pro is not counted as a purchase. Inspect webhook/lifecycle/mail failures and sanitized promo-entry diagnostics.
8. If the new entry point fails, restore the recorded fixed-price deployment from before this feature. Existing Stripe subscriptions, activation, expiry, and Keep Pro use the same flow and remain supported. Do not cancel subscriptions, drop tables, restore an unrestricted ELNINO coupon, or disable lifecycle processing as a routine UI rollback.
