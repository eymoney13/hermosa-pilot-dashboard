# Stripe revenue sync

Revenue source: live paid Stripe invoices, paid on/after September 27, 2026
00:00 America/Los_Angeles. Includes initial subscriptions, renewals and paid
subscription updates; zero-dollar invoices record code usage without revenue.
This is gross invoice payments, not payouts, fees, MRR or net-of-refund revenue.
Non-invoiced standalone charges are outside the subscription revenue metric.

`invoice.paid` and Checkout webhooks retrieve the expanded Stripe invoice and
insert it into `stripe_revenue_outbox`, keyed uniquely by invoice ID. Delivery
requires a successful HTTP response and PostHog acknowledgement. Failure leaves
the row pending and returns 503 after checkout fulfillment so Stripe retries.
The five-minute retry delay avoids hammering a failing destination. Expired
worker leases recover after crashes. Event UUIDs are deterministic, and report
queries must also deduplicate on `stripe_invoice_id` to cover ambiguous network
acknowledgements. Existing `payment_succeeded` events remain for checkout funnels;
never sum those together with `stripe_invoice_paid` for revenue.

A protected Vercel cron runs `/api/analytics/stripe-sync` daily at 14:30 UTC,
using the existing CRON_SECRET. It scans paid invoices, inserts missing records,
and retries pending delivery. This also backfills older invoices that were
never captured. Each run scans up to 300 invoices and delivers up to 25 events;
persisted pagination resumes larger accounts across runs. Healthy webhooks
update revenue immediately; the daily reconciliation is a backstop. Manual
runs are available in the Vercel project's Cron Jobs screen. The response/log
reports scanned, complete, delivered, failed, pending and oldestPendingAt;
pending counts or stale oldestPendingAt require investigation.

Tables and pending index are created additively on first use using the app's
existing database connection. No environment secrets need to be exported.
Stripe endpoint must listen for invoice.paid, checkout.session.completed,
checkout.session.async_payment_succeeded and both existing subscription lifecycle
events. Keep the existing signing secret and API version unchanged.

Revenue events contain invoice/customer IDs, original paid timestamp, currency,
amount paid and discount amount/code-used flag. No names, email addresses,
payment card data are sent. Customer-facing discount code strings are sent
in separate `stripe_discount_code_used` events, one per invoice/promotion ID.
The code breakdown counts distinct Stripe customer IDs per code across all
invoices, so renewal applications do not inflate the customer count. Repeated
reconciliation backfills these events without resending revenue. Customers are keyed by Stripe
customer ID; revenue includes all live invoice payments, including founders'
live purchases, and does not filter PostHog's internal/test-person flag.

Run `node scripts/test-stripe-revenue.mjs` and `npm run test:payments` before
releasing. No network, credentials, actual charges or persistent test writes.
