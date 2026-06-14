-- ============================================================
-- Remedy — customers (profiles, on-account credit, loyalty)
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(160) NOT NULL,
  phone          VARCHAR(40),
  email          VARCHAR(160),
  address        TEXT,
  credit_limit   NUMERIC(14,2) NOT NULL DEFAULT 0,   -- max outstanding balance (0 = no account credit)
  balance        NUMERIC(14,2) NOT NULL DEFAULT 0,   -- current amount owed on account
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  total_spent    NUMERIC(14,2) NOT NULL DEFAULT 0,
  visit_count    INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (lower(name));
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);

-- Payments a customer makes against their account balance.
CREATE TABLE IF NOT EXISTS customer_payments (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount      NUMERIC(14,2) NOT NULL,
  method      VARCHAR(30) NOT NULL DEFAULT 'cash',
  note        TEXT,
  user_id     INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custpay_customer ON customer_payments (customer_id, created_at DESC);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales (customer_id);
