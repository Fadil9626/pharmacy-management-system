-- ============================================================
-- Remedy — held / parked sales. Suspend a cart and resume it later.
-- Stock is NOT touched until the sale is actually completed.
-- ============================================================
CREATE TABLE IF NOT EXISTS parked_sales (
  id            SERIAL PRIMARY KEY,
  branch_id     INTEGER REFERENCES branches(id),
  user_id       INTEGER REFERENCES users(id),
  customer_id   INTEGER REFERENCES customers(id),
  customer_name VARCHAR(160),
  label         VARCHAR(80),
  cart          JSONB NOT NULL,            -- { items, discount, customer }
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_parked_branch ON parked_sales (branch_id, created_at DESC);
