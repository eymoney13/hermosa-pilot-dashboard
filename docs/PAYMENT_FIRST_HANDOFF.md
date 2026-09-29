# Payment-first subscriptions — local implementation, not launched

Branch: `codex/subscription-flow`, rebased onto `origin/main` at `8df39a9`.
Worktree: `/Users/ethanyoung/.codex/worktrees/subscription-flow/hermosa-pilot-dashboard`.
No deployment, merge, real charge, or production database migration has been performed.
A Stripe test purchase succeeded and a real activation email was sent to the approved
recipient, ethan@projectneptune.co. Test-only Stripe/Clerk credentials and the approved
SMTP credential were copied privately into this worktree’s ignored, mode-0600 `.env.local`.

## What is implemented

Public sandbox -> Pro purchase page -> anonymous Stripe Checkout -> paid receipt ->
private emailed Clerk invitation (new account) or sign-in link (existing account),
then verified checkout email -> atomic subscription claim ->
sandbox opens the first beach's unlocked forecast.

`/pro/recover` emails a private activation link only to the checkout email. Signed
webhooks reconcile a paid session against current Stripe subscription state and
attempt the initial activation email. Email failures return 500 for Stripe retry.
Duplicate events preserve ownership; delayed completion cannot resurrect a canceled
subscription. New checkout submissions reuse one database-backed attempt per email.
Former members can rejoin while retaining past subscription rows.

The existing production kill switch is unchanged. New checkout additionally needs
NEPTUNE_PAYMENT_FIRST_ENABLED=true. Test keys need NEPTUNE_TEST_CHECKOUT_ENABLED=true;
this test flag cannot enable charges with live keys. The test page is a POST form;
GETs and Next prefetches do not create Stripe checkout sessions.

The new migration is applied only to PGlite tests and the isolated Neon test branch. It adds receipt/email/
observation columns, permits unclaimed purchases, preserves subscription uniqueness,
and replaces the per-user unique constraint with a partial index allowing one current
subscription per account plus canceled history. Apply before serving this branch.

## Outstanding launch blockers

- Core test purchase → email invitation → user-created password → account claim →
  unlocked forecast is verified. Fresh external checkout navigation, decline, recovery,
  portal, and scheduled cancellation are also verified. Mobile checkout/recovery/sign-in
  layouts were reviewed at 390×844; a complete mobile invitation/password journey remains.
- A verified transactional sender: PRO_ACTIVATION_EMAIL_FROM is the Gmail account
  used with GMAIL_APP_PASSWORD. SMTP delivery and invitation acceptance were confirmed by the user completing account creation.
- Paid-buyer Clerk invitations are implemented and explicitly approved. The new
  signup URL retains the receipt across devices and returns to activation. To
  enforce paid-only signup across Clerk's hosted portal/API, configure Clerk's
  **Invite-only** access mode first in the development instance and test the whole
  flow. Production settings are unchanged; configure production only as part of
  the approved launch. Never enable this mode on the old deployed signup flow.
- Migration rehearsal with synthetic existing active/canceled subscribers preserves
  every original column and passes when applied twice. Production row/schema preflight
  and a backup remain required. Do not run the old application against the changed unique constraint.
- Verify refunds/disputes policy separately: access follows subscription status;
  refunding a payment without canceling its subscription does not revoke access.
- Production Stripe webhook is active at the correct dashboard endpoint with
  checkout.session.completed and customer.subscription.updated/deleted. Live portal
  cancellation is enabled at period end (read-only verification). Signing-secret
  matching and a production delivery smoke test remain for rollout.
- Live billing remains disabled until the user explicitly approves launch.

## Configure an isolated test environment

Create ignored `.env.local` in THIS worktree (never paste secrets into chat):

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...  # from the test listener
DATABASE_URL=...               # an isolated test database, never production
NEXT_PUBLIC_SITE_URL=http://localhost:3105
NEPTUNE_PAYMENT_FIRST_ENABLED=true
NEPTUNE_TEST_CHECKOUT_ENABLED=true
NEPTUNE_LIVE_BILLING_ENABLED=false
NEPTUNE_TEST_DATABASE_CONFIRMED=true
PRO_ACTIVATION_EMAIL_FROM=...   # your authenticated Gmail sender
GMAIL_APP_PASSWORD=...
```

Apply schema ONLY after verifying the database is disposable/test:

```
node --env-file=.env.local scripts/apply-payment-first-test-schema.mjs
npm run build -- --webpack
npm run start -- --port 3105
stripe listen --forward-to localhost:3105/api/pro/webhook
```

Use the listener signing secret above and restart Next after configuring it.
Set Clerk development access mode to Invite-only. Follow the invitation delivered
to the checkout mailbox (or the sign-in link if the account exists). Keep production
Clerk keys out of this environment. The dashboard origin must be the app URL, not
`projectneptune.co`'s marketing homepage.

Test `/sandbox`, `/pro/start?from=/sandbox&plan=monthly`, `/pro/recover`, and
`/pro/manage?from=/sandbox` (authenticated, test checkout enabled). Portal access is
available through that direct route in test mode; the existing account-menu portal
link still follows the unchanged live switch.

## Required end-to-end checks before launch

1. Anonymous today/map access with no Clerk account. `/southbay` never requires auth.
2. Successful test card -> paid receipt -> verified account -> unlocked forecast.
3. Close tab after payment, use recovery email, activate without a second charge.
4. Wrong/unverified email, forged session, and another user's receipt never grant Pro.
5. Repeat submit/webhook/activation; multiple tabs create one checkout for the email.
6. Abandon checkout, decline card, webhook retry, SMTP failure; no false Pro access.
7. Cancel at period end; retain access until expiry, then revoke. Rejoin canceled account.
8. Billing portal, mobile signup, existing-account sign-in, and browser refresh.
9. Verify Stripe live mode cannot be enabled with NEPTUNE_TEST_CHECKOUT_ENABLED alone.

## Automated verification

`npm run test:payments` runs the real SQL/migrations in ephemeral PGlite PostgreSQL,
with Stripe/Clerk/SMTP replaced by in-memory fakes. No external systems are touched.
It covers 23 migration, policy, identity, idempotency, lifecycle, recovery, rejoin, and invitation
checks, including reuse, expiration, existing users, and SMTP retry.
`npx tsc --noEmit`, `npm run lint`, `npm run build -- --webpack` pass. Lint has two
pre-existing lib/data.ts unused-variable warnings. The non-sandbox render branch,
feature flags, proxy, root layout, and redaction are unchanged from main. Local
production-build smoke checks: /southbay 200, /sandbox 200, /pro/recover 200;
checkout stays 404 with no configured environment, including from=/southbay.

## Scope and review

Shared subscription/auth helpers changed intentionally with user authorization.
The sandbox-only branch of app/[location]/page.tsx imports the new gate and consumes
`pro=activated`; its non-sandbox render is byte-for-byte unchanged. No /southbay
component, flags, data, or rendering was changed. Clerk DEVELOPMENT access mode was changed to Invite-only for the authorized test.
Production Clerk settings and Stripe dashboard settings were not changed. No forecast/scientific model changes.

See lib/purchase.ts, lib/purchasePolicy.ts, app/pro/{start,activate,recover,manage,welcome},
app/api/pro/webhook/route.ts, auth pages, lib/{subscription,entitlement}.ts,
scripts/payment-first-schema.sql, and scripts/test-payment-first.mjs.

## Invitation implementation notes

- Stripe session payment and current subscription state are fetched again before
  any invitation is created. Canceled/unpaid purchases cannot trigger invitations.
- Clerk invitation `notify` is false. The application sends the private URL only
  to the paid checkout email via the configured SMTP account; it never returns an
  invitation token in a Server Action response, browser redirect, or UI.
- Invitations expire in seven days. Resends reuse a valid pending invitation;
  expired invitations are replaced. SMTP failure resets the DB throttle for retry.
- Existing Clerk users receive `/sign-in?purchase=...`, preserving their receipt.
- Hash routing keeps invitation/receipt query parameters during Clerk's form steps.
- Clerk auto-verifies invitation recipients; ownership is still checked against
  the checkout email when claiming Pro. A receipt URL alone never grants access.
- SMTP delivery, Clerk invitation acceptance, and final account claim were verified
  in the isolated test environment on September 28, 2026.

## Activation email

The activation message now uses a Neptune Pro branded HTML template with an inline
primary button, a short payment-confirmed explanation, and a plain-text fallback.
The private Clerk invitation URL is behind the button rather than exposed as a long
raw URL. The production sender should be a verified Neptune domain/address before
launch; the test sender remains the approved Gmail account.

## Real vendor test progress — September 28, 2026

- Neon schema-only branch `neptune-pro-checkout-test` (`br-rough-violet-av2lso2g`)
  in project `weathered-hall-93532324`. No production data copied.
- Branch expires September 29, 2026 at 11:26:52 a.m. Pacific. Recreate or extend
  the isolated test environment before further testing if it has expired.
- Development Clerk instance `ins_3Jo3WkFWM7mEqP6XtbndPq057i8` is Invite-only.
  Production instance remains unchanged.
- Local app runs on `http://localhost:3105` using a production build with TEST keys.
  `next dev` hit the existing shared PostHog configuration requirement; shared
  telemetry was not changed to work around it.
- Stripe test session `cs_test_a1Kwj4F3bxdUIXTbjiQut20JyK3P4Mc8ONt6dVzEZdvhCIoDc2GeiV2X5U`
  completed with `livemode=false`, `payment_status=paid`, using Stripe’s 4242 test card.
- Real `checkout.session.completed` event returned HTTP 204 from the local webhook.
  Isolated DB: status active, account unclaimed, recovery email timestamp present.
- Browser automatically returned from Stripe to the local activation page, displaying
  “Your payment is confirmed.” SMTP accepted the activation email for the approved recipient.
- Repeating the checkout form for the same paid email redirects to recovery instead
  of creating another purchase. Server Action navigation works on this path.
- Fresh anonymous submission with a reserved example.com test address automatically
  navigated to Stripe Checkout. The earlier external-redirect uncertainty is resolved.
  Stripe's declined test card displayed a decline, left the session open/unpaid with
  no subscription, and created zero subscription rows in the isolated database.
- User must complete password/account creation themselves; do not create a password,
  manually grant entitlement, or mark their email verified to shortcut the test.
- After activation, verify `/sandbox?pro=activated` opens an unlocked forecast, then
  run recovery/portal/cancellation and mobile checks before approving launch.

### Activation confirmed

The user received the invitation, created their own password, and returned to
`http://localhost:3105/sandbox?pro=activated`. Read-only DB verification showed
`status=active`, `claimed=true`, and `within_paid_period=true`. Chrome showed the
PRO badge, Manhattan Beach - 28th st selected, historical days, three future days,
and deeper water-quality insights without a paywall. Manhattan is the first beach
in the current list; automatic selection after activation is intentional.
No production settings, production data, or live billing changed.

### Branded email, recovery, and cancellation verified

On September 28 the rebuilt local app sent the branded recovery message to
ethan@projectneptune.co through `/pro/recover`. Gmail displayed the Neptune Pro
sender name, teal button, and formatted HTML without exposing the long URL.
The button preserved the receipt, repeat activation succeeded, and the browser
returned to `/sandbox?pro=activated` with Pro forecasts and history unlocked.

The authenticated test billing portal opened successfully. Its cancellation mode
is at period end. The test subscription was scheduled to cancel October 28, 2026;
the real subscription update webhook returned 204, and Pro access remained active.
The test subscription remains scheduled to cancel; no production subscription changed.
Actual expiry/revocation remains covered by automated tests, not a month-long vendor test.

Public DNS review found Clerk CNAMEs, Google DKIM, and DMARC (`p=none`) already
present. No SPF TXT record was returned at the root domain. Confirm all legitimate
outbound mail providers before adding SPF. Do not replace other TXT records.
Production Clerk invitation mode, migration, sender environment configuration,
and billing launch have not been changed or approved by this verification step.

## Release preparation

`vercel.json` disables automatic deployment for `codex/subscription-flow` only so
the branch can be pushed for review without starting a Vercel preview. Other branches
retain their existing deployment behavior. Do not merge until the coordinated rollout
is approved. See Vercel's `git.deploymentEnabled` documentation.

Production configuration still to verify/set during the approved rollout:

- `NEXT_PUBLIC_SITE_URL=https://dashboard.projectneptune.co`
- `PRO_ACTIVATION_EMAIL_FROM=ethan@projectneptune.co` with the matching Gmail app password.
- `NEPTUNE_PAYMENT_FIRST_ENABLED=true`, `NEPTUNE_LIVE_BILLING_ENABLED=false` initially;
  no test-checkout bypass in production.
- Clerk production Invite-only and a customer-facing Neptune application name. Both
  development sign-in and the production portal currently display `clerk-emerald-elephant`.
  Production accounts.projectneptune.co/sign-in renders successfully in a browser;
  the earlier server-fetch 403 is not evidence of a broken customer portal.
- Stripe production webhook to `/api/pro/webhook`: checkout.session.completed,
  customer.subscription.updated, customer.subscription.deleted are already configured.
  The handler also supports checkout.session.async_payment_succeeded; add this if
  delayed payment methods are enabled later (current checkout is card-only).
  Confirm the signing secret belongs to this endpoint.
- Live customer portal cancellation at period end is already configured; confirm
  its generated-session return URL during the live smoke test.
- Mail authentication: confirm all senders before adding SPF. Vercel also has a Resend
  integration, so do not assume Google Workspace is the only sender.

Rollout sequence: database backup/preflight → coordinated schema and application
release with live billing off → production free-access/auth/recovery smoke checks →
explicit approval to enable live billing → controlled live purchase and activation.
Existing pre-migration code is not a safe rollback after the unique-constraint change;
disable new checkout and roll forward, or use a separately reviewed schema rollback.

Draft review: https://github.com/eymoney13/hermosa-pilot-dashboard/pull/86.
Post-rebase verification passed: 23 tests, TypeScript, lint (two existing warnings),
and production build. The PR is mergeable. No GitHub deployment was created for
the pushed review commit when checked. Local preview remains on port 3105.

## Production preparation update — September 28, 2026

The user explicitly deferred SPF because they do not currently have DNS access.
SPF is a follow-up, not a blocker to continued preparation. Existing Google DKIM
and DMARC records were observed; delivered-message authentication and inbox checks
remain part of the pre-payment launch checks. No DNS changes were made.

Saved in Vercel for Production only (pending the next deployment):
- `NEXT_PUBLIC_SITE_URL=https://dashboard.projectneptune.co`
- `PRO_ACTIVATION_EMAIL_FROM=ethan@projectneptune.co`

Changed Clerk's application display name from `clerk-emerald-elephant` to
`Neptune Pro`. This application-level branding applies across its instances.
No credentials or authentication policies were changed. Production Invite-only
must still be coordinated with the new application release.

No merge, deployment, production database migration, or live-billing enablement
was performed. Earlier statements that all production settings are unchanged
describe the earlier test phase; the two environment settings and display-name
change above are the subsequent authorized preparation changes.
