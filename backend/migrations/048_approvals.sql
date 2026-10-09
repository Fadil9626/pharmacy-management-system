-- ─────────────────────────────────────────────────────────────────────────────
-- Approval by a second person (lib/approval.js), above amounts the pharmacy
-- sets in Settings → Approvals. 0 = no approval needed; that is the starting
-- point, so nothing changes until the owner sets a limit.
--
--   approve_refund_over        a refund of at least this amount
--   approve_payout_over        cash paid out of the till of at least this amount
--   approve_adjust_units_over  a stock adjustment of at least this many units
--   approve_count_value_over   a stock count whose differences are worth at least this (at cost)
--
-- Who approved is kept on the record.
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE settings ADD COLUMN IF NOT EXISTS approve_refund_over       NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS approve_payout_over       NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS approve_adjust_units_over INTEGER       NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS approve_count_value_over  NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE sale_returns      ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id);
ALTER TABLE cash_movements    ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id);
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id);
ALTER TABLE stock_counts      ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id);
