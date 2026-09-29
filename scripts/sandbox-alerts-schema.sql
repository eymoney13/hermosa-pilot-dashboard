-- Additive, sandbox-only delivery state. Existing South Bay tables/rows are unchanged.
CREATE TABLE IF NOT EXISTS sandbox_alert_delivery (
 subscriber_id BIGINT PRIMARY KEY REFERENCES alert_subscribers(id) ON DELETE CASCADE,
 clerk_user_id TEXT NOT NULL,
 states JSONB NOT NULL DEFAULT '{}',
 lease_until TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
