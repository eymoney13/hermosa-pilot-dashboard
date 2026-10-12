-- Durable per-send state for the daily bacteria alert run.
--
-- ADDITIVE ONLY. alert_notifications is deliberately left exactly as it is:
-- its PRIMARY KEY (subscriber_id, station_code) holds the LAST date a person
-- was told about a beach, and the whole eligibility query in lib/alertSend.ts
-- is built on that shape. Changing it would change who gets mail. This table
-- sits alongside it and answers a different question -- "what happened to the
-- one email we owed this person for this prediction date" -- which the old
-- table cannot answer, because it keeps no per-date history, no delivery
-- state, no provider id and no attempt count.
--
-- Grain is (subscriber_id, prediction_date), not (subscriber, station),
-- because the run sends ONE email per person covering all of their elevated
-- beaches. That is the unit that can be accepted or rejected, so it is the
-- unit that gets a row.
--
-- Existing rows and subscribers are untouched: on the first run after this
-- migration every subscriber simply has no delivery row yet, which reads as
-- "never attempted" and is exactly right.

CREATE TABLE IF NOT EXISTS alert_deliveries (
  subscriber_id       BIGINT      NOT NULL REFERENCES alert_subscribers(id) ON DELETE CASCADE,
  prediction_date     DATE        NOT NULL,

  -- pending  : row reserved, nothing attempted yet
  -- sending  : claimed by a run, lease_until says until when
  -- sent     : the provider ACCEPTED the request (see note below)
  -- failed   : last attempt was rejected; eligible to be retried
  status              TEXT        NOT NULL DEFAULT 'pending',

  -- Which beaches this email covered, for audit. Not used for eligibility.
  stations            TEXT[]      NOT NULL DEFAULT '{}',

  provider            TEXT,
  -- 'sent' means ACCEPTED FOR DELIVERY, not delivered. This is the provider's
  -- id for the accepted request; final delivery is only knowable from the
  -- provider's own dashboard or a webhook, neither of which this table sees.
  provider_message_id TEXT,

  -- Stable across retries on purpose, so a retry of an ambiguous attempt is
  -- deduplicated by the provider rather than sending a second email.
  idempotency_key     TEXT,

  attempts            INT         NOT NULL DEFAULT 0,
  -- Provider error code / short reason. Never an email address, never a key.
  last_error          TEXT,

  -- Claim lease. A crashed run leaves 'sending' behind; once the lease expires
  -- the row can be claimed again, so a crash costs one retry, not the alert.
  lease_until         TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The idempotency guarantee. One row per subscriber per prediction date
  -- means the database itself refuses a second concurrent claim, rather than
  -- relying on application code to remember.
  PRIMARY KEY (subscriber_id, prediction_date)
);

-- Finding work to retry, and the operational "what failed today" query.
CREATE INDEX IF NOT EXISTS alert_deliveries_status_date_idx
  ON alert_deliveries (prediction_date, status);
