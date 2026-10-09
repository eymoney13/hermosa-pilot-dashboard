-- Additive migration. Apply only after review; never rewrites existing follows or grants.
BEGIN;
ALTER TABLE sandbox_alert_delivery ALTER COLUMN clerk_user_id DROP NOT NULL;
ALTER TABLE sandbox_alert_delivery ADD COLUMN IF NOT EXISTS free_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS california_alert_verifications (
 id text PRIMARY KEY, email text NOT NULL, code_hash text NOT NULL,
 expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0,
 sent_at timestamptz NOT NULL DEFAULT now(), session_hash text,
 session_expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS california_alert_verifications_email ON california_alert_verifications(email, sent_at);
CREATE OR REPLACE FUNCTION request_california_alert_code(address text, challenge text, digest text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(address, 1));
 IF EXISTS (SELECT 1 FROM california_alert_verifications WHERE email=address AND sent_at>now()-interval '1 minute') THEN RETURN false; END IF;
 INSERT INTO california_alert_verifications(id,email,code_hash,expires_at)
 VALUES(challenge,address,digest,now()+interval '10 minutes');
 DELETE FROM california_alert_verifications WHERE expires_at<now()-interval '1 day' AND (session_expires_at IS NULL OR session_expires_at<now());
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION set_california_free_alert(address text, station text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE sid bigint; previous text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(address, 0));
 SELECT id INTO sid FROM alert_subscribers WHERE email=address AND location='sandbox' FOR UPDATE;
 -- Accountless management cannot alter any existing Pro follows or settings.
 IF EXISTS (SELECT 1 FROM sandbox_alert_delivery d JOIN pro_subscriptions p ON p.clerk_user_id=d.clerk_user_id
  WHERE d.subscriber_id=sid AND p.status IN ('active','trialing','past_due')
  AND (p.current_period_end IS NULL OR p.current_period_end>now())) THEN
  RETURN 'pro';
 END IF;
 SELECT station_code INTO previous FROM alert_subscriptions WHERE subscriber_id=sid ORDER BY station_code LIMIT 1;
 INSERT INTO alert_subscribers(email,location) VALUES(address,'sandbox')
 ON CONFLICT(email,location) DO UPDATE SET updated_at=now() RETURNING id INTO sid;
 DELETE FROM alert_subscriptions WHERE subscriber_id=sid;
 INSERT INTO alert_subscriptions(subscriber_id,station_code) VALUES(sid,station);
 INSERT INTO sandbox_alert_delivery(subscriber_id,free_enabled) VALUES(sid,true)
 ON CONFLICT(subscriber_id) DO UPDATE SET free_enabled=true, clerk_user_id=NULL;
 RETURN CASE WHEN previous IS NULL THEN 'created' WHEN previous=station THEN 'unchanged' ELSE 'changed' END;
END $$;
-- Pro writes take the same lock, so an upgrade and a free edit cannot overwrite one another.
CREATE OR REPLACE FUNCTION set_california_pro_alerts(address text, stations text[], account_id text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE sid bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(address, 0));
 IF cardinality(stations)=0 THEN
  DELETE FROM alert_subscribers WHERE email=address AND location='sandbox';
  RETURN;
 END IF;
 INSERT INTO alert_subscribers(email,location) VALUES(address,'sandbox')
 ON CONFLICT(email,location) DO UPDATE SET updated_at=now() RETURNING id INTO sid;
 INSERT INTO sandbox_alert_delivery(subscriber_id,clerk_user_id,free_enabled) VALUES(sid,account_id,false)
 ON CONFLICT(subscriber_id) DO UPDATE SET clerk_user_id=EXCLUDED.clerk_user_id,free_enabled=false;
 DELETE FROM alert_subscriptions WHERE subscriber_id=sid;
 INSERT INTO alert_subscriptions(subscriber_id,station_code)
 SELECT sid,unnest(stations) ON CONFLICT DO NOTHING;
END $$;
COMMIT;
