-- ============================================================
-- Remedy — public-health surveillance. Products can carry a surveillance_tag
-- (a syndrome/indicator, e.g. 'malaria', 'diarrhoeal_disease'). Dispensing a
-- tagged product is a proxy case signal; aggregated, this yields DHIS2-style
-- case counts by period + catchment (branch) for Ministry-of-Health reporting.
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS surveillance_tag VARCHAR(40);
CREATE INDEX IF NOT EXISTS idx_products_surveillance ON products (surveillance_tag) WHERE surveillance_tag IS NOT NULL;
