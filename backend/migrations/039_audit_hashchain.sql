-- ============================================================
-- Remedy — tamper-evident audit log. Each entry stores a SHA-256 hash of its
-- own contents chained to the previous entry's hash. Editing or deleting any
-- row breaks the chain, which the verify endpoint detects. Existing rows are
-- chained on boot (backfillAuditChain).
-- ============================================================
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS hash      TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS prev_hash TEXT;
