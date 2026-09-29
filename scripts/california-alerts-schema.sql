-- Run once before the California release. Additive; no subscriber or token moves.
-- The marker prevents later reruns from granting free alerts to new follows.
BEGIN;
CREATE TABLE IF NOT EXISTS neptune_rollouts (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS legacy_alert_grants (
  subscriber_id BIGINT NOT NULL REFERENCES alert_subscribers(id) ON DELETE CASCADE,
  station_code TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subscriber_id, station_code)
);
WITH first_run AS (
  INSERT INTO neptune_rollouts(name) VALUES ('california-legacy-alerts-v1')
  ON CONFLICT DO NOTHING RETURNING name
)
INSERT INTO legacy_alert_grants(subscriber_id, station_code)
SELECT x.subscriber_id, x.station_code FROM alert_subscriptions x
JOIN alert_subscribers s ON s.id = x.subscriber_id
WHERE s.location = 'southbay' AND EXISTS (SELECT 1 FROM first_run)
ON CONFLICT DO NOTHING;
COMMIT;
