-- ============================================================
-- Remedy — self-service password reset via email. A one-time token (stored
-- hashed) is emailed as a link; it expires after an hour.
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires_at TIMESTAMPTZ;
