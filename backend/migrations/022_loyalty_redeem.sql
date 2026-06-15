-- ============================================================
-- Remedy — loyalty redemption. The ledger value of one point when redeemed
-- at the till (0 disables redemption).
-- ============================================================
ALTER TABLE settings ADD COLUMN IF NOT EXISTS loyalty_redeem_value NUMERIC(10,4) NOT NULL DEFAULT 0;
