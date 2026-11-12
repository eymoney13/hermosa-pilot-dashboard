# Final PR rehearsal, November 11, 2026

The application code at `2ae5bd6166d0383850650c888a741473253665ec` in PR #137 was rehearsed against isolated services. No application changes were needed during this run. Subsequent PR changes add documentation/evidence only.

## Isolation and migration

Used the existing schema-only Neon test branch `br-shy-heart-avxtjyd7` (separate endpoint from production), real Stripe test keys and published test card 4242, and the Clerk development instance. The branch expires November 12 at approximately 6:08pm Pacific. Applied the exact PR promo migration twice and compared existing subscription fields before/after; they were preserved. No customer data was copied from production.

The real Next.js application ran from the clean PR worktree on `localhost:3001`, separate from the original working tree. The Stripe CLI connected in test mode and forwarded billing events to that app with real webhook signature verification. No live Stripe request, production Clerk setting, production database migration, merge, or deployment was performed.

## Results

| Check | Observed result |
| --- | --- |
| Hosted no-card checkout | Applying the supported monthly 100% one-month code removed the card form and completed at $0. |
| Scheduling | Stripe cancellation and the stored promo deadline matched the discount end/monthly renewal boundary before account activation. |
| Actual signup | The running app redirected directly to password creation with the checkout email prefilled, then one email-code verification and automatic `/california?pro=activated` return. The activated account showed its free-access deadline and Keep Pro offer. |
| External email | The application's no-card recovery email arrived in the owned test mailbox. Clerk's real development verification email also arrived and its delivered code completed signup in the matching browser. |
| Ordinary monthly purchase | Real hosted sandbox checkout without a code paid 200 cents; password, one test email code, automatic activation, and the $2/month account state passed. No promo deadline or scheduled cancellation was added. |
| Ordinary yearly purchase | Real hosted sandbox checkout without a code paid 2000 cents; password, one test email code, automatic activation, and the $20/year account state passed. No promo deadline or scheduled cancellation was added. |
| Ownership | While signed in as the yearly buyer, trying to activate the promo buyer's receipt produced the identity-recovery message and did not change its owner. |
| Network webhooks | Real Stripe CLI delivery to the running Next.js handler returned 204 for checkout completion, invoice payment, and the promo subscription update. Signed replays of all three browser purchases also returned 204. |
| Analytics | Local server capture retained `payment_succeeded`, browser distinct ID, stable UUID on replay, all existing monetary/discount properties, and `annual` for the yearly plan. Observed amounts were 0, 200, and 2000 cents respectively. |
| Expiry at real Stripe boundary | A separate test-clock promo canceled automatically. Its only invoice was $0 with no payment attempt. Application entitlement and Pro alert eligibility were removed; the ended notice was captured locally. |
| Keep Pro | Real hosted setup Checkout saved only the published test card. The committed handler cleared scheduled cancellation without changing the original billing boundary or making an immediate charge. Duplicate completion remained safe and did not emit a setup purchase event. |
| First Keep Pro renewal | Invoice `in_1Uap7x6zec8cCFXojmjAeXEY` paid exactly 200 cents USD, with one payment attempt. PaymentIntent `pi_3Uap7z6zec8cCFXo0bWNh6hZ` succeeded with 200 cents received. The renewal line began at the original free-month deadline. |
| Setup after expiry | Setup opened before expiry was completed after automatic cancellation. The subscription stayed canceled and had no paid invoice or restored entitlement. |

## Browser observations and limits

Clerk displayed a prolonged loading state during the first real-mailbox signup. Refresh preserved the receipt and resumed the verification step. Two browser clients were used to investigate; their email codes were scoped separately, and a code from the other client was correctly rejected. The matching code completed signup. This was not reproduced as a permanent application failure, and no security checks were disabled to complete testing.

The annual test displayed Clerk/Cloudflare's human-verification challenge. Approval was requested under the browser policy; by the next inspection the challenge had cleared and the normal email-code screen was available. Monthly/yearly accounts used Clerk's documented `+clerk_test` address pattern and test code; the promo account separately proved actual mailbox delivery. Clerk CAPTCHA and verification remain enabled.

The test-clock harness uses synthetic current-user adapters and aligns application/SQL time with Stripe's test clock; Stripe Checkout, setup, invoice/payment processing, and Neon SQL are real. The separate running-app browser tests above use real Clerk development accounts, real application routes, and actual webhook network delivery.

Server PostHog events were captured locally; client instrumentation used a deliberately invalid test key, so it did not record in the production project. The existing client reverse-proxy still contacts PostHog and returned expected invalid-key errors. Client event-name preservation is covered by the existing regression tests; this run does not assert successful delivery to the production analytics project.

Local and development testing does not prove production-domain, production-email, or deployed webhook configuration. The final deployment still needs controlled smoke checks after its separately approved configuration/migration changes. Observe Clerk challenge/loading behavior during that smoke check before broad promotion distribution.

## Evidence and next step

- [Sanitized structured results](final-rehearsal/results.json)
- [Card-free hosted Checkout](final-rehearsal/no-card-checkout.png)
- [Activated promo account](final-rehearsal/activated-promo-account.png)
- [Activated paid monthly account](final-rehearsal/activated-monthly-account.png)
- [Activated paid yearly account](final-rehearsal/activated-yearly-account.png)
- [Production rollout and rollback proposal](PROMO_PRODUCTION_ROLLOUT.md)

The implementation is ready for rollout review. Production migration, production Clerk public signup/password/email-code settings, merge/deployment, and live promotion activation remain unperformed and require explicit approval. The PR remains a draft.
