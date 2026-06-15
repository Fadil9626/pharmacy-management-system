-- ============================================================
-- Remedy — print hardware settings. receipt_paper = thermal roll width
-- (58 or 80 mm); label_size = dispensing-label dimensions for a label printer.
-- ============================================================
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_paper VARCHAR(4)  NOT NULL DEFAULT '80';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS label_size    VARCHAR(12) NOT NULL DEFAULT '50x30';
