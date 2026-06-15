-- ============================================================
-- Remedy — auto-assign a barcode to every new product (using the configured
-- barcode_prefix scheme) so staff never have to generate one by hand.
-- ============================================================
ALTER TABLE settings ADD COLUMN IF NOT EXISTS barcode_auto BOOLEAN NOT NULL DEFAULT true;
