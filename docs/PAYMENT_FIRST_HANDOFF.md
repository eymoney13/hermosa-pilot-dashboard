# Neptune Pro — live release handoff

Updated September 28, 2026 (Pacific). This replaces the prelaunch handoff.

## Live state

- PR86 merged to main (e775e640158134caaafd80274a4ff622cf5fdb4e).
- Live billing and payment-first checkout are enabled in Vercel Production.
- Clerk production is Invite-only. Today’s dashboard remains public.
- One real $5 monthly purchase completed: email invitation, password creation,
  account claim, and unlocked forecasts/history/insights verified.
- The owner’s test purchase is scheduled to cancel October 28, 2026. Paid access
  continues until then. No refund was issued. Do not charge, cancel, or refund again.
- Live payment and cancellation webhook requests returned HTTP 204.
- Production domain: https://dashboard.projectneptune.co/sandbox.
- /southbay remains free and retains its existing UI, data, and alert behavior.

## Current follow-up

Branch codex/pro-launch-followup contains sandbox-only elevated/clear-up alert
handling, a verified-account ownership link, and a membership check at delivery.
High forecasts send once per prediction date; moderate does not count as cleared;
a later low forecast sends one clear-up after an elevated notification. The email
explicitly distinguishes a model forecast from lab results or lifted advisories.

A 10-minute per-subscriber lease prevents overlapping runs. State is updated after
SMTP acceptance. SMTP acceptance followed by a database failure can still cause a
repeat on retry; SMTP does not provide transactional exactly-once delivery.
No alert can prove that a recipient read it or that it avoided spam.

Production initially had zero sandbox alert subscribers and 198 South Bay alert
subscribers. Added only sandbox_alert_delivery after backing up current alert and
subscription rows; verified all existing rows identical afterward. No backfill was
needed. Existing manual Neon snapshot: main at 2026-09-29 02:49:08 UTC (manual),
non-expiring per console; restore not rehearsed. Latest private logical backup:
/tmp/neptune-before-sandbox-alerts-20260929.json, mode 0600 (contains personal data;
never commit or paste). Additional alert migration is additive and safe for old code.

14 isolated PostgreSQL tests cover alert transitions, retries, dedupe, leases,
expired/canceled membership, and HTML escaping. 23 payment regression tests pass.
TypeScript/build pass; lint has only the two pre-existing lib/data.ts warnings.
Two explicitly labeled synthetic alert demonstrations were sent to the owner.
Natural high-to-low production forecast transition has not yet occurred/been verified.

## Support and policy

Owner approved full refund within 7 days of first purchase. Checkout displays that
promise with ethan@projectneptune.co support. Broader policy draft is in
NEPTUNE_POLICY_REVIEW.md and must not be published without owner review.
A refund request is handled manually in Stripe after confirming the purchase and
eligibility; refunding alone does not cancel renewal. Confirm the buyer’s desired
cancellation and handle both deliberately. Never promise a refund-processing time
that the payment provider has not confirmed.

## Monitoring

scripts/check-pro-production.mjs performs GET-only public page checks and read-only
aggregate subscription checks. Supply the production DATABASE_URL privately.
Codex heartbeat neptune-pro-production-checks runs hourly: script plus Vercel
production error logs. Notifications only for actionable changes or recovery.
Requires this computer/Codex and CLI authentication; not a hosted uptime service.
Check webhook/SMTP failures promptly. Stripe retries failed webhook delivery;
/pro/recover is the buyer’s recovery path. Monitoring never emails customers or
changes production itself. On access failure report unavailable, not healthy.

Initial check: public pages 200, no past_due/unpaid/unclaimed-over-30m/no-email/
expired-active LIVE rows, no matching production error logs in preceding hour.
A database status check cannot detect a failed-payment event whose webhook never
arrived; inspect Stripe payment failures and webhook delivery status during incidents.

## Email limitations

Uses Google Workspace/Gmail via Nodemailer. Live branded activation email delivered
to ethan@projectneptune.co within one second. Same-sender/same-recipient original
message has no SPF/DKIM/DMARC verdict; external inbox verification remains needed.
DNS SPF is explicitly deferred by owner because DNS admin access is unavailable.
Google DKIM record and DMARC p=none were observed; do not claim header PASS from DNS.

## Remaining human checks

- Approve/edit broader subscription/privacy draft before publishing those pages.
- Provide an external inbox owned by Ethan for one authorized deliverability test.
- Real phone: signed-out free dashboard, existing paid-account sign-in, forecast,
  alert follow/unfollow, billing portal. No second purchase required. A full fresh
  mobile purchase/password journey has not been verified on physical hardware.
- Add SPF later after confirming all sending providers; do not replace other TXT.

## Local testing and safety

Primary checkout .env.local and .env.development.local DATABASE_URL are PRODUCTION.
Never seed them. Subscription worktree ignored .env.local has TEST Stripe/Clerk and
isolated Neon branch br-rough-violet-av2lso2g, endpoint ep-blue-fire-av60zzr9.
It expires September 29, 2026 at 11:26:52 a.m. Pacific. Recreate/extend before testing
after expiry. New sandbox schema applied to isolated test DB as well as production.

npm run test:payments
npm run test:alerts
npx tsc --noEmit
npm run lint
npm run build -- --webpack

Preview on localhost:3106. Earlier server/listener on 3105 may still run.
Rehearsal email script requires NEPTUNE_OWNER_EMAIL_REHEARSAL=true and sends exactly
two synthetic demonstrations to ethan@projectneptune.co; never run routinely.
Branch deployment is disabled for subscription-flow and pro-launch-followup only.

## Rollback warning

Payment-first migration replaced the old per-user subscription unique constraint.
Do not revert to pre-PR86 app code without compatible schema planning. Disable
checkout using NEPTUNE_LIVE_BILLING_ENABLED=false and redeploy; prefer a forward fix.
Whole database restore also rewinds free alert subscriptions and newer purchases.
No credentials belong in this file, logs, PR text, or chat.
