CREATE TABLE IF NOT EXISTS beach_requests (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL CHECK (length(email) <= 254),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 2 AND 2000),
  source TEXT NOT NULL CHECK (source IN ('california', 'sandbox')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email, message, source)
);
CREATE INDEX IF NOT EXISTS beach_requests_email_created_idx ON beach_requests (email, created_at);
