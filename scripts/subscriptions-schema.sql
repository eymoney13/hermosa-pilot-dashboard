-- Neptune Pro subscriptions (see lib/subscription.ts). Apply with:
--   node scripts/apply-subscriptions-schema.mjs
-- Safe to re-run.
--
-- Keyed by CLERK USER ID, not by email. An address changes and can be shared;
-- the account is the thing that actually holds the subscription, and it is what
-- isEntitled() has in hand when it asks.
--
-- NO CARD DETAILS HERE, and none ever. The card lives at Stripe; what is kept
-- is the customer id that points at it.

CREATE TABLE IF NOT EXISTS pro_subscriptions (
  id                     BIGSERIAL PRIMARY KEY,
  -- One subscription per account. A second checkout by the same person updates
  -- this row rather than granting them two.
  clerk_user_id          TEXT        NOT NULL UNIQUE,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT UNIQUE,
  -- Stripe's own vocabulary, stored verbatim rather than flattened to a
  -- boolean: "past_due" is not "canceled", and a board that treats them the
  -- same either cuts someone off over a failed retry or keeps serving someone
  -- who left. entitlementFrom() is the single place that decides.
  status                 TEXT        NOT NULL,
  -- When the paid-for period runs out. Entitlement outlives a cancellation
  -- until this passes: someone who cancels on day 2 paid for the month.
  current_period_end     TIMESTAMPTZ,
  price_cents            INTEGER     NOT NULL DEFAULT 500,
  -- monthly | yearly. Recorded because $5/month and $40/year are the same
  -- subscriber to Stripe but not to anyone reading these rows later.
  plan                   TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The read on every page load of a paywalled board, so it is worth an index
-- even though the unique constraint above already provides one.
CREATE INDEX IF NOT EXISTS pro_subscriptions_status_idx
  ON pro_subscriptions (clerk_user_id, status);

-- Both are for tables created before the two plans existed. CREATE TABLE IF NOT
-- EXISTS is a no-op on an existing table, so the column and the corrected
-- default have to be added on their own. Idempotent, like everything above.
ALTER TABLE pro_subscriptions ADD COLUMN IF NOT EXISTS plan TEXT;
ALTER TABLE pro_subscriptions ALTER COLUMN price_cents SET DEFAULT 500;
