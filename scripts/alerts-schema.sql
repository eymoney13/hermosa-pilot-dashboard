-- Email alert subscriptions (see lib/alerts.ts). Apply with:
--   node scripts/apply-alerts-schema.mjs
-- Safe to re-run.
--
-- Two tables rather than one flat row per (email, station): the unsubscribe
-- token belongs to the person, not to each beach they picked, and the alert job
-- will need to reach a subscriber by that token alone. Splitting it now means
-- the job lands without a migration.

CREATE TABLE IF NOT EXISTS alert_subscribers (
  id                 BIGSERIAL PRIMARY KEY,
  -- Stored lower-cased and trimmed (see normalizeEmail) so "A@b.com" and
  -- "a@b.com " are one subscriber, not two.
  email              TEXT        NOT NULL,
  -- The dashboard they signed up from, e.g. 'southbay'. Part of the identity:
  -- the same address can follow beaches on more than one board without the
  -- two signups overwriting each other.
  location           TEXT        NOT NULL,
  -- Opaque, unguessable id for one-click unsubscribe links in the emails.
  unsubscribe_token  UUID        NOT NULL DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email, location)
);

CREATE TABLE IF NOT EXISTS alert_subscriptions (
  subscriber_id BIGINT      NOT NULL REFERENCES alert_subscribers(id) ON DELETE CASCADE,
  -- Station code (DHS114, SMB-2-11, ...), not the display name — names get
  -- reworded, codes are what the daily data is keyed by.
  station_code  TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subscriber_id, station_code)
);

-- The alert job's read: given a station that came back elevated today, who
-- asked to hear about it.
CREATE INDEX IF NOT EXISTS alert_subscriptions_station_idx
  ON alert_subscriptions (station_code);

-- What we have already told each subscriber about, so a beach that stays
-- elevated for a week is one email rather than seven.
--
-- Keyed per (subscriber, station) rather than per send: we only ever need the
-- most recent notification for a beach, and keeping one row per pair means the
-- table stays the size of the subscriber list instead of growing without bound.
CREATE TABLE IF NOT EXISTS alert_notifications (
  subscriber_id      BIGINT      NOT NULL REFERENCES alert_subscribers(id) ON DELETE CASCADE,
  station_code       TEXT        NOT NULL,
  -- The prediction date of the run we last emailed about — NOT the wall clock
  -- time we sent it. Comparing prediction dates is what makes a re-run of the
  -- job on the same day a no-op instead of a second copy.
  last_notified_date DATE        NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subscriber_id, station_code)
);
