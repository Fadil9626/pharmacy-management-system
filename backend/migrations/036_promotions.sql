-- ============================================================
-- Remedy — promotions / discounts engine. Rules are evaluated server-side at the
-- till and auto-applied. Types: percent (% off), amount (fixed off over a
-- threshold), bxgy (buy X get Y free). Scope: all | category | products.
-- ============================================================
CREATE TABLE IF NOT EXISTS promotions (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(120) NOT NULL,
  type         VARCHAR(12)  NOT NULL,                 -- percent | amount | bxgy
  scope        VARCHAR(12)  NOT NULL DEFAULT 'all',   -- all | category | products
  category_id  INTEGER REFERENCES categories(id),
  product_ids  JSONB        NOT NULL DEFAULT '[]'::jsonb,
  value        NUMERIC(12,2) NOT NULL DEFAULT 0,      -- percent or fixed amount
  min_subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,      -- threshold for 'amount'
  buy_qty      INTEGER NOT NULL DEFAULT 0,            -- bxgy
  get_qty      INTEGER NOT NULL DEFAULT 0,            -- bxgy
  starts_at    DATE,
  ends_at      DATE,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_promotions (
  id           SERIAL PRIMARY KEY,
  sale_id      INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  promotion_id INTEGER,
  name         VARCHAR(120),
  amount       NUMERIC(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sale_promotions_sale ON sale_promotions (sale_id);
