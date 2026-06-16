-- ============================================================
-- Remedy — dosing aid + extended clinical flags.
-- Products carry optional weight-based dosing (for the calculator) and risk
-- flags; customers carry conditions (pregnant, breastfeeding, asthma, renal…)
-- which are matched against product contraindications + pregnancy/lactation risk.
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS strength_mg      NUMERIC(12,3);   -- mg per dispensing unit (for dose→units)
ALTER TABLE products ADD COLUMN IF NOT EXISTS dose_mg_per_kg   NUMERIC(10,3);   -- typical mg/kg per dose
ALTER TABLE products ADD COLUMN IF NOT EXISTS dose_max_mg      NUMERIC(12,3);   -- cap on a single dose
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_frequency VARCHAR(20);    -- e.g. "TID", "BD", "OD"
ALTER TABLE products ADD COLUMN IF NOT EXISTS pregnancy_risk   VARCHAR(10) NOT NULL DEFAULT 'none'; -- none | caution | avoid
ALTER TABLE products ADD COLUMN IF NOT EXISTS lactation_risk   VARCHAR(10) NOT NULL DEFAULT 'none'; -- none | caution | avoid
ALTER TABLE products ADD COLUMN IF NOT EXISTS contraindications JSONB NOT NULL DEFAULT '[]'::jsonb;  -- ["asthma","renal",...]

ALTER TABLE customers ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '[]'::jsonb;        -- ["pregnant","asthma",...]
