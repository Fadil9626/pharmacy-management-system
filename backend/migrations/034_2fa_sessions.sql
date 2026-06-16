-- ============================================================
-- Remedy — two-factor auth (TOTP) + session revocation.
-- token_version is embedded in every JWT; bumping it ("log out everywhere")
-- instantly invalidates all outstanding tokens for that user.
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS backup_codes  JSONB   NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
