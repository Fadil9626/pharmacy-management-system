-- ============================================================
-- Remedy — notifications. An outbox/log of every message Remedy emits (low-stock
-- alerts, expiry warnings, refill reminders, customer statements). Delivery is
-- provider-agnostic: rows are always recorded; when an email/SMS HTTP API is
-- configured in settings.notify_config they are also sent. status: logged (no
-- provider) | sent | failed.
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  channel    VARCHAR(10) NOT NULL,            -- email | sms
  recipient  VARCHAR(200),
  type       VARCHAR(40) NOT NULL,            -- low_stock | near_expiry | refill_due | statement | test
  subject    VARCHAR(200),
  body       TEXT,
  status     VARCHAR(12) NOT NULL DEFAULT 'logged',
  error      TEXT,
  ref_type   VARCHAR(30),                     -- product | batch | prescription | customer
  ref_id     INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications (type, ref_id, created_at DESC);

-- Channel + event configuration (provider URLs/keys, recipients, toggles).
ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_config JSONB NOT NULL DEFAULT '{}'::jsonb;
