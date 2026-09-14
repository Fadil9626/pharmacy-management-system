-- ─────────────────────────────────────────────────────────────────────────────
-- A key/value store for machine-written settings.
--
-- `settings` already exists and is the right shape for what it holds: one row,
-- one column per pharmacy preference, typed and defaulted. That shape is wrong
-- for anything the software writes about itself — the update client needs to
-- remember which commit it last told somebody about, and a column per fact
-- would mean a migration every time the system learns to remember one more
-- thing.
--
-- So the two live side by side: `settings` for what the pharmacist configures,
-- `system_settings` for what the system records. Same name and shape as the
-- table ELIMS and HMS use, so the update client ports across unchanged.
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
