-- Apply to an isolated branch database first. Never run at application startup.
ALTER TABLE pro_subscriptions ADD COLUMN IF NOT EXISTS promo_access_ends_at TIMESTAMPTZ;
ALTER TABLE pro_subscriptions ADD COLUMN IF NOT EXISTS promo_redeemed_at TIMESTAMPTZ;
ALTER TABLE pro_subscriptions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS pro_lifecycle_delivery (
  subscription_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('reminder', 'ended', 'winback')),
  sent_at TIMESTAMPTZ,
  lease_until TIMESTAMPTZ,
  lease_token TEXT,
  PRIMARY KEY (subscription_id, kind)
);
CREATE INDEX IF NOT EXISTS pro_promo_expiry_idx ON pro_subscriptions (promo_access_ends_at)
  WHERE promo_access_ends_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS pro_email_preferences (
  email TEXT PRIMARY KEY,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  marketing_unsubscribed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pro_direct_checkout_reconcile (
  checkout_session_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE pro_direct_checkout_reconcile ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS pro_promo_operation (
  subscription_id TEXT PRIMARY KEY,
  lease_until TIMESTAMPTZ NOT NULL,
  lease_token TEXT NOT NULL
);
-- Serialize first redemption by checkout email, including signed-out checkouts.
CREATE TABLE IF NOT EXISTS pro_promo_redemptions (
  email TEXT PRIMARY KEY,
  stripe_subscription_id TEXT NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO pro_promo_redemptions (email, stripe_subscription_id, redeemed_at)
  SELECT DISTINCT ON (lower(checkout_email)) lower(checkout_email), stripe_subscription_id, promo_redeemed_at
  FROM pro_subscriptions WHERE checkout_email IS NOT NULL AND stripe_subscription_id IS NOT NULL AND promo_redeemed_at IS NOT NULL
  ORDER BY lower(checkout_email), promo_redeemed_at
  ON CONFLICT (email) DO NOTHING;
