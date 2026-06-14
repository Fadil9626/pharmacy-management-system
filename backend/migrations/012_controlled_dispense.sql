-- ============================================================
-- Remedy — capture the prescriber on sales (controlled-drug compliance).
-- A controlled item may not be dispensed without a customer and the
-- prescribing doctor's license number; both are recorded on the sale.
-- ============================================================
ALTER TABLE sales ADD COLUMN IF NOT EXISTS prescriber_name    VARCHAR(160);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS prescriber_license VARCHAR(80);
