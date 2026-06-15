-- ============================================================
-- Remedy — sales returns / refunds
-- A return reverses some or all lines of a sale: refunds the customer,
-- optionally restocks the items, and nets out of revenue/cash.
-- ============================================================
CREATE TABLE IF NOT EXISTS sale_returns (
  id            SERIAL PRIMARY KEY,
  sale_id       INTEGER REFERENCES sales(id),
  branch_id     INTEGER REFERENCES branches(id),
  user_id       INTEGER REFERENCES users(id),
  customer_id   INTEGER REFERENCES customers(id),
  shift_id      INTEGER REFERENCES shifts(id),
  receipt_no    VARCHAR(30),
  reason        VARCHAR(80),
  refund_method VARCHAR(30) NOT NULL DEFAULT 'cash',  -- cash|card|mobile|account
  subtotal      NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax           NUMERIC(12,2) NOT NULL DEFAULT 0,
  total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  restocked     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_returns_sale ON sale_returns (sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_created ON sale_returns (created_at);

CREATE TABLE IF NOT EXISTS sale_return_items (
  id           SERIAL PRIMARY KEY,
  return_id    INTEGER NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  sale_item_id INTEGER REFERENCES sale_items(id),
  product_id   INTEGER REFERENCES products(id),
  batch_id     INTEGER REFERENCES product_batches(id),
  name         VARCHAR(200),
  qty          INTEGER NOT NULL,
  unit_price   NUMERIC(12,2) NOT NULL,
  line_total   NUMERIC(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_returnitems_saleitem ON sale_return_items (sale_item_id);
