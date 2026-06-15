-- ============================================================
-- Remedy — product images. Stored as a resized data URL; served as bytes via
-- GET /api/products/:id/image so the big catalogue/POS feeds only carry a
-- has_image flag (no base64 bloat). No image -> the UI draws an auto placeholder.
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS image TEXT;
