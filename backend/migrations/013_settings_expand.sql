-- ============================================================
-- Remedy — expand settings into a full configuration hub.
-- ============================================================
ALTER TABLE settings ADD COLUMN IF NOT EXISTS email                  VARCHAR(160);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS website                VARCHAR(160);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_header         TEXT;
-- Inventory behaviour
ALTER TABLE settings ADD COLUMN IF NOT EXISTS near_expiry_months     INTEGER NOT NULL DEFAULT 3;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS low_stock_default      INTEGER NOT NULL DEFAULT 10;
-- Loyalty: points earned per 1 unit of sale total (0 disables)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS loyalty_points_per_unit NUMERIC(8,4) NOT NULL DEFAULT 1;
