# PostHog accuracy audit — November 10, 2026

Scope: CDL Session 1 dashboard 2331771, live production app on both domains,
client event delivery, metric definitions and Stripe subscription revenue sync.
This is an observed functional audit, not a guarantee of complete historical
browser capture. Live audit activity was marked internal and excluded from
visitor/conversion reports. No payment was made or activation email requested.

## Corrections deployed

- Map zoom controls: Leaflet consumes the bubble phase of zoom-button clicks.
  Changed the map listener to capture phase. Verified `map_interacted` reaches
  PostHog after a real live zoom click. Automatic map positioning stays excluded.
- Direct checkout: restored `pro_checkout_page_viewed` before automatic checkout
  submission. Observed one landing event followed by one `checkout_started`
  event after clicking a paid plan. The existing browser checkout attempt led
  to purchase recovery; no new charge was made.
- Paid conversion, Pro purchase funnel and checkout-to-payment conversion now
  require a live payment amount greater than zero. Free promotion redemptions
  remain in discount analytics but no longer inflate paid conversion.
  Verified both native funnels store `amount_cents > 0` and the SQL paid
  conversion uses actual amount with a legacy price fallback.

At the audit snapshot, paid purchase-funnel completions changed from 4 to 2
(2.60% to 1.30% of 154 offer viewers), and checkout-to-payment conversion changed
from 4/11 (36.36%) to 2/11 (18.18%). Overall visitor paid conversion was 2/599
(0.33%). Counts are live and can change after this audit.

## Verified

| Area | Evidence |
| --- | --- |
| Unique visitors and total pageviews | Both production hosts, expected event/math, internal/test exclusion. Raw event totals matched dashboard values at the query snapshot. |
| Session counts and pageviews/session | Nonempty SDK session IDs; reviewed exact SQL. No missing session IDs among queried production client events. |
| Returning visitors, rate and frequency | Counts distinct sessions per visitor; bucket SQL and denominator reviewed. 67 returning visitors at audit snapshot. |
| Time to return and median | First and second captured sessions in experiment period; elapsed seconds for median, Pacific calendar dates for buckets. |
| Engaged returning visitors | Any later session with beach open or trusted-input foreground engagement. Three mutually exclusive buckets sum to total. Live engaged event and deterministic inactivity/background/session tests passed. |
| Map/beach/list segments | Reviewed exclusive map-only, both and beach-only definitions; List remains an overlapping independent row. Real beach and List events delivered. Zoom defect corrected and retested. |
| Locked forecast views/clicks | Real full-row view and locked-day click delivered. Separate interest event retained its forecast-day source. |
| Pro offer / CTR | Real full paid-options view, header interest and paid-plan click delivered; CTR uses unique CTA clickers / unique offer viewers. It is a ratio, not an ordered funnel. |
| Informational pages | Exactly one live test pageview received for each of How Neptune Works, Why It Matters, Meet the Team and Water Quality News after actual menu navigation. |
| Stripe revenue | Six successful Stripe payments total $115, matching reconciled PostHog. Nine paid invoices include three $0 invoices. Gross subscription invoice payments, before fees/refunds. |
| Discount codes | NEPTUNEPROYEAR1 used by three distinct Stripe customers; zero-dollar checkouts included. |
| Sync retry/duplicate protection | Manual reconciliation at 15:04 Pacific: scanned 9, complete true, delivered 0, failed 0, pending 0. Previously delivered records were not re-enqueued. |
| Cross-domain visitor identity | Same PostHog person on both production domains in the live test. |

## Limits and interpretation

1. **Domain switches and sessions.** The live test kept the same visitor identity
   but created a new SDK session when moving between domains within 30 minutes.
   Returning metrics count SDK sessions, not proven separate intentional visits.
   In the current pageview data, one of the 67 returning visitors had a possible
   short cross-domain session split. Zero had *all* returns explained solely by
   these short domain switches. This is a diagnostic based on captured pageview
   timestamps, not proof of a person's intent or exact inactivity duration.
2. **Identity.** Unique browser visitors are not guaranteed unique humans across
   devices, private browsing, cleared storage or blocked capture. Stripe customer
   identity is used for financial customer counts, independently of browser IDs.
3. **Historical coverage.** Map interactions, fully visible locked forecast rows
   and five-second engagement began November 10. Those behaviors cannot be
   reconstructed before tracking existed. Restored checkout landing capture also
   does not recover earlier missing landing events.
4. **Offer definition changed.** Earlier offer-view events used a 50% card rule;
   from November 10 both paid options must be fully visible. Old views remain
   in historical totals. Visibility is geometric viewport visibility, with no
   minimum dwell time or proof of attention.
5. **Retention.** Reviewed recurring daily pageview cohorts with Day 1–29 and a
   combined Day 30–35 bracket. It measures pageview returns, not engagement.
   Future/unelapsed days cannot be interpreted as observed zero retention.
6. **Conversion attribution.** Visitor funnels need a browser/person-linked
   checkout event. Historical invoice backfills without that identity correctly
   count toward revenue but cannot be attributed to a visitor funnel. No real
   new payment was made to test a full charge during this audit; payment/retry
   behavior is covered by the existing reconciliation evidence and mocked
   payment-flow/outbox tests.
7. **Financial scope.** Subscription invoices and their renewals/updates are
   included. Refunds, Stripe fees, payouts and non-invoiced standalone charges
   are outside this gross-revenue report. Founders' live invoice payments are
   included in revenue; behavioral reports exclude configured internal users.

## Regression checks

- `node scripts/test-analytics-tracking.mjs`: trusted activity, background/idle
  exclusion, session deduplication, zoom propagation, programmatic-event
  exclusion, listener cleanup.
- TypeScript and targeted ESLint passed for changed source files.
- Existing Stripe reconciliation tests cover backfills, renewals, duplicate
  webhooks, failed HTTP delivery, retry delays, leases, pagination, discount
  enrichment, capture acknowledgements and cron authorization.

Reference behavior: [PostHog sessions](https://posthog.com/docs/data/sessions),
[JavaScript configuration](https://posthog.com/docs/libraries/js/config),
[retention definitions](https://posthog.com/docs/product-analytics/retention).
