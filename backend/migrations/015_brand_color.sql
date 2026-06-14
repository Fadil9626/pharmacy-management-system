-- ============================================================
-- Remedy — custom brand colour (when theme = 'custom', the full brand
-- ramp is generated from this single hex colour on the client).
-- ============================================================
ALTER TABLE settings ADD COLUMN IF NOT EXISTS brand_color VARCHAR(9);
