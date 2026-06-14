-- ============================================================
-- Remedy — full theme studio config (primary/secondary + sidebar/topbar
-- chrome colours). Stored as one JSON blob; legacy theme/brand_color stay
-- for back-compat.
-- ============================================================
ALTER TABLE settings ADD COLUMN IF NOT EXISTS theme_config JSONB;
