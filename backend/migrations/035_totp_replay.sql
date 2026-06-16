-- ============================================================
-- Remedy — TOTP replay protection. Record the last time-step a code was accepted
-- for; a code from that step or earlier is rejected (can't be reused in its 30s
-- window).
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step BIGINT NOT NULL DEFAULT 0;
