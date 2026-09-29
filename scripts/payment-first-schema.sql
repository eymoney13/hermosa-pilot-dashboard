-- Apply to an isolated TEST database first. Never run at application startup.
-- A paid subscription may be unclaimed. Existing subscribers retain their rows.
ALTER TABLE pro_subscriptions ALTER COLUMN clerk_user_id DROP NOT NULL;
ALTER TABLE pro_subscriptions ADD COLUMN IF NOT EXISTS checkout_session_id TEXT UNIQUE;
ALTER TABLE pro_subscriptions ADD COLUMN IF NOT EXISTS checkout_email TEXT;
ALTER TABLE pro_subscriptions ADD COLUMN IF NOT EXISTS recovery_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS pro_subscription_checkout_email_idx ON pro_subscriptions (checkout_email);
ALTER TABLE pro_subscriptions ADD COLUMN IF NOT EXISTS stripe_observed_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01';
CREATE TABLE IF NOT EXISTS pro_checkout_attempts (
  email TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  checkout_session_id TEXT,
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'yearly')),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Preserve past subscriptions for invoices while allowing a former member to rejoin.
ALTER TABLE pro_subscriptions DROP CONSTRAINT IF EXISTS pro_subscriptions_clerk_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS pro_one_current_subscription_per_user
  ON pro_subscriptions (clerk_user_id) WHERE status IN ('active', 'trialing', 'past_due');
