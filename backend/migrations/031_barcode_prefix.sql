-- ============================================================
-- Remedy — barcode scheme. Blank = numeric in-store EAN-13. A prefix (letters/
-- digits) switches generation to alphanumeric CODE128 SKUs, e.g. "RMD00482".
-- The token {name} derives the prefix from the product name (first 3 letters),
-- e.g. Paracetamol -> "PAR00482".
-- ============================================================
ALTER TABLE settings ADD COLUMN IF NOT EXISTS barcode_prefix VARCHAR(12) NOT NULL DEFAULT '';
