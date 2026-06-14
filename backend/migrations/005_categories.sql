-- ============================================================
-- Remedy — structural drug-class categories (formulary)
-- A strict classification of the formulary. `surveillance_tag` maps a drug
-- class to a national case aggregate (e.g. malaria, AMR) for the future
-- public-health export — set once here, reused everywhere.
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(80) UNIQUE NOT NULL,
  code             VARCHAR(20),
  description      TEXT,
  surveillance_tag VARCHAR(40),     -- NULL = not reportable; else national aggregate key
  sort_order       INTEGER NOT NULL DEFAULT 100,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);

-- Canonical starter formulary (first run). Surveillance tags pre-wired for the MoH export.
INSERT INTO categories (name, code, surveillance_tag, sort_order) VALUES
  ('Antimalarials',     'AMAL', 'malaria',    10),
  ('Antibiotics',       'ABX',  'antibiotic', 20),
  ('Analgesics',        'ANLG', NULL,         30),
  ('Antipyretics',      'APYR', NULL,         40),
  ('Antihypertensives', 'AHTN', NULL,         50),
  ('Antidiabetics',     'ADIA', NULL,         60),
  ('Antiretrovirals',   'ARV',  'hiv',        70),
  ('Anti-Tuberculosis', 'ATB',  'tb',         80),
  ('Respiratory / ARI', 'RESP', 'ari',        90),
  ('Gastrointestinal',  'GIT',  NULL,        100),
  ('Vitamins & Supplements', 'VIT', NULL,    110),
  ('Dermatological',    'DERM', NULL,        120),
  ('Vaccines',          'VACC', NULL,        130),
  ('Other',             'OTH',  NULL,        900)
ON CONFLICT (name) DO NOTHING;

-- Absorb any pre-existing free-text categories that aren't in the canonical set.
INSERT INTO categories (name)
  SELECT DISTINCT category FROM products
  WHERE category IS NOT NULL AND btrim(category) <> ''
ON CONFLICT (name) DO NOTHING;

-- Link products to their category by name (case-insensitive).
UPDATE products p SET category_id = c.id
  FROM categories c
  WHERE p.category_id IS NULL AND lower(btrim(p.category)) = lower(c.name);
