-- ============================================================
-- Remedy — pack vs dispensing units. Products are bought in packs (a box of N
-- units) but stocked/sold in single base units. pack_size = base units per pack;
-- all batch quantities and prices stay in base units. pack_label is display only.
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_size INTEGER NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_label VARCHAR(40);
UPDATE products SET pack_size = 1 WHERE pack_size IS NULL OR pack_size < 1;
