# Promo signup analytics

The CDL Promo signup funnel uses three ordered stages, counting unique visitors:

1. `promo_redemption_clicked`: existing third CTA, Have a promo code? Redeem here.
2. `checkout_started` with `checkout_entry=promo_redemption`, or the historical
   `/pro/redeem` pathname. This records submitting Apply promo and continue,
   not merely opening the redemption page or successful code validation.
3. `promo_account_created`: emitted server-side only after verified checkout-email
   ownership and a successful active subscription claim. The Stripe receipt must
   come from explicit promo redemption, and the Clerk account's creation time
   must be at/after the receipt's checkout-session creation time. Existing
   accounts signing in are excluded. Unverified or abandoned signup is excluded.

All stages join the original browser identity carried in signed Stripe session
metadata. The server event uses the existing durable analytics outbox and daily
retry worker, keyed uniquely by event/session. Repeated activation cannot
produce another queued conversion. No raw promo code, email, password or email
verification code is sent. Revenue and existing paid-conversion metrics keep
using their existing event names and definitions.

The report begins November 2, 2026 midnight Pacific, includes both production
hosts, excludes configured internal/test visitors and requires the three steps
in order within 14 days of a qualifying promo click. Account confirmation is live
mode only. All qualifying clicks are considered so a later retry can start a
new conversion window. Historical clicks/checkouts can be counted from existing
events; the verified new-account event starts with this deployment. No attempt
is made to label old dashboard opens as new accounts.

Analytics failure cannot revoke or block already-granted account access. Once
the outbox row is saved, ordinary failed delivery is retried by the shared
worker. An exceptional Stripe/DB failure before enqueue is logged without
customer data and cannot be reconstructed from this event alone.

Checks: TypeScript, targeted ESLint, 89 existing payment-flow checks, promo-entry
checks, and scripts/test-promo-signup-analytics.mjs for eligibility, new/existing
account distinction, identity, live/test flags, deduplication and provider failure.
