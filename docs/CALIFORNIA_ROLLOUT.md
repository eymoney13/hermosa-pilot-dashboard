# California rollout

`/california` is the canonical freemium dashboard. It initially covers the existing eight South Bay beaches; this release does not claim statewide data coverage or add model stations. Today is public; forecasts, history, insights, and new alert follows require existing server-side Pro entitlement. Prices remain $5/month and $40/year.

## Storage and compatibility

- Forecast files, workflows and station codes remain keyed by `southbay`. `LOCATIONS.california.dataSlug` points to that dataset. New regions need validated data ingestion and region configuration, not renamed station IDs.
- Clerk users, Stripe customers/subscriptions, webhook endpoint, and Neon subscription records do not move.
- Pro alert records retain the historical `sandbox` database location and `sandbox_alert_delivery` table. This storage name is not a test environment. Both route aliases resolve to the same follows; the cron schedules the dataset once.
- The additive `scripts/california-alerts-schema.sql` freezes existing South Bay subscriber/station pairs in `legacy_alert_grants`. A rollout marker makes reruns safe and prevents granting later additions. Existing unsubscribe tokens and station choices remain intact; unsubscribing cascades the grants away.
- New anonymous free alert writes are rejected, including direct calls to the old server action. Existing free alerts need no account or payment.
- Active Pro follows suppress overlapping legacy high alerts. Delivery dates are consulted across both lists to avoid same-day duplicates on upgrade/cancellation. A canceled member's original legacy choices continue. Existing non-overlapping free follows remain in effect.
- Delivery remains at-least-once: SMTP acceptance followed by a database outage can result in a retry. No exactly-once delivery promise is made.
- Old `/pro/start?from=/sandbox` links work. Invitation/receipt and unsubscribe URLs retain their routes. Sign-in, activation, sign-out, billing return, and new email links lead to California.

## Release sequence

1. Private consistent production backup, verify restore in PGlite. Never commit backup/customer data.
2. Run tests and rehearse migration on isolated Neon test database; apply additive migration to production before new code.
3. Merge first release adding California while South Bay remains available. Verify deployed free dashboard, editorial/support pages and both plan choices.
4. Only after that verification, merge traffic-switch release: permanent South Bay and sandbox redirects, root destination, canonical sitemap/robots. Query strings are preserved; South Bay links retain `region=southbay` context. At launch all displayed stations are in that region.
5. Verify redirects, production health and monitoring.

## Analytics

Global PostHog and Vercel Analytics remain in place. California emits `water_quality_dashboard_viewed`, `dashboard_view_selected`, `beach_viewed`, `pro_offer_viewed`, `pro_cta_clicked`, `pro_checkout_page_viewed` (landed on /pro/start), `checkout_started` (submitted a checkout email), `pro_activation_dashboard_opened`, and `alert_preferences_updated`. Beach events carry `beach_id`, `beach_name`, `region`, `risk_level` (low/moderate/high) and `neptune_index` (0-100), plus `entry_point` for how the beach was opened. Pro events carry `cta_location`, the moment that brought the reader to the Pro card (`california_bottom` when they scrolled there alone, `header_get_pro`, `list_banner`, `beach_forecast_lock`), and `page_context` (beach_page/list/map/news), and the beach properties when the card sits under a beach; plan events carry `plan` (monthly/annual) and `price` (5/40). `locked_feature_clicked` (diagnostic, not a funnel step) fires when a free reader taps a locked paid feature, with `feature` (`three_day_forecast` today; `water_quality_history` and `email_alerts` reserved), the beach properties, and `days_ahead` for forecast cells. Every browser event also carries `source`, the first-touch utm_source or referring domain (else `direct`), plus `medium` and `campaign` from `utm_medium`/`utm_campaign` when the landing link had them. Tag shared links like `?utm_source=qr&utm_medium=beach_sign&utm_campaign=hermosa_26th`; the bare-domain redirect to /california keeps the query string. No email is added. Client events measure interaction, not authoritative revenue. Stripe remains authoritative for payments; the webhook sends a server-side `payment_succeeded` keyed to the browser's PostHog id (passed through Checkout metadata). Existing reports filtered to `/southbay` must include `/california` for cross-launch comparisons.

## Test isolation and operations

Local ignored `.env.local` in this worktree uses the separate `neptune-pro-checkout-test` Neon branch and test Clerk/Stripe, with live billing disabled. The primary Desktop project's environment files point to production; never migrate/seed them for tests. The isolated test branch expiration was removed during rollout; Neon now shows Never. It remains separate from production.

Auto preview deployment is disabled for the rollout branch because inherited Vercel preview database isolation has not been verified. Future previews require an explicitly separate database, test Clerk/Stripe, live billing off, and owner-only email testing. Never use the public route `/sandbox` as an isolation boundary.

Validation: `npm run test:payments`, `npm run test:alerts`, `npm run test:california`, `npx tsc --noEmit`, `npm run lint`, `npm run build -- --webpack`. Existing lint warnings in lib/data.ts predate this release.

Run `scripts/check-pro-production.mjs` with production DATABASE_URL loaded privately for read-only health checks. Inspect Vercel error logs without printing raw personal data. Monitoring runs locally and requires the computer and Codex to be available. SPF remains deferred by owner request.

Rollback: stop a broken rollout before switching traffic; turn payments off if checkout fails. Prefer a forward fix. Do not restore a whole database over new purchases or roll back before the payment-first schema compatibility changes.

## Verified release record

Release one: PR91, merge 56fa919, production deployment dpl_6VqkCt7JaXsWTbKyXs7gxBhaUW7w. California free dashboard, policy pages, monthly/annual checkout entry, old sandbox checkout entry and recovery returned 200 after deployment Ready. No subscription health anomalies. Private backup `/tmp/neptune-before-california-1790658287513.json` restored in PGlite; production migration preserved 198 subscribers / 598 grandfathered pairs and 2 subscription records.

Release two changes root to California, returns permanent 308 from `/southbay` to `/california?region=southbay` and from `/sandbox/:path*` to `/california/:path*`. The existing `#sandbox-pro` anchor remains intentionally for saved links. Old invitation and unsubscribe endpoint paths stay unchanged. Monitoring now expects these redirects and checks California, both plans, policies and sitemap/robots.

PostHog web analytics confirmed California traffic and saved the preset **Neptune California + legacy dashboards** including /california, /southbay and /sandbox. Production release two (PR92) verified redirects and healthy pages; an explicit bare /sandbox redirect normalizes Vercel’s empty-wildcard trailing slash.
