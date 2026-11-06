# California accountless alerts

Implementation branch: `codex/california-one-beach-alerts`. Isolated release branch: `codex/california-alerts-release`.

The California dashboard uses `components/sandbox/SandboxDashboard.tsx`. The release excludes the local sandbox experiments and editorial drafts. Today's forecasts and existing forecast redaction are unchanged.

Accountless subscribers receive a six-digit email code through the existing Gmail alert transport. Challenges expire after ten minutes, allow five guesses, and can be requested once per minute per normalized address. Verification creates a random, hashed, thirty-minute HttpOnly session. All edits derive the email from that session. No Clerk account is required. Codes and email addresses are never included in analytics.

The database function serializes changes by normalized email and replaces the California follow with exactly one station. Existing active Pro follows cannot be edited through accountless management. Pro uses the existing authenticated actions, supports the entire valid roster, and retains existing delivery state. Former Pro members can explicitly switch to one free beach after their paid entitlement ends. Both write paths serialize on the same email lock. Legacy South Bay follows, grants, unsubscribe tokens, and notification history remain intact; overlap with a new California follow is deduplicated at delivery.

For a new database, apply `scripts/california-free-alerts-schema.sql` to the intended database after review. It requires the existing alerts and sandbox delivery schemas. It is additive and idempotent; it does not migrate or delete any subscribers. Apply before releasing code because alert delivery queries depend on the new column. The migration runner requires an explicitly selected DATABASE_URL and NEPTUNE_ALERT_MIGRATION_CONFIRMED=true. It verifies that existing subscriber, beach-follow, legacy-grant, and Pro records are unchanged. Preview deployment is disabled for the isolated release branch.

Local checks:

- `node scripts/test-california-free-alerts.mjs`
- `npm run test:california`
- `npm run test:alerts`
- `node node_modules/typescript/bin/tsc --noEmit`

SQL and mail tests use PGlite and a mocked mail transport, never production data or outgoing email.

Production preparation: the additive migration was applied successfully with all 200 subscribers, 621 beach follows, 598 legacy grants, and 4 Pro records unchanged. Existing Gmail SMTP authentication was verified without sending email. All 64 alert, California, and payment checks pass, as does the beach-request regression test and TypeScript. ESLint has no errors (two existing data warnings).
