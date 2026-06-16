-- ============================================================
-- Remedy — return to vendor (RTV). Send expired/recalled/damaged stock back to a
-- supplier; deducts the batches and raises a credit note that nets against what
-- you owe that supplier.
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_returns_vendor (
  id           SERIAL PRIMARY KEY,
  reference    VARCHAR(20),
  supplier_id  INTEGER REFERENCES suppliers(id),
  branch_id    INTEGER REFERENCES branches(id),
  user_id      INTEGER REFERENCES users(id),
  reason       VARCHAR(20) NOT NULL DEFAULT 'expired', -- expired | recalled | damaged | overstock
  total_credit NUMERIC(14,2) NOT NULL DEFAULT 0,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_return_vendor_items (
  id          SERIAL PRIMARY KEY,
  return_id   INTEGER NOT NULL REFERENCES stock_returns_vendor(id) ON DELETE CASCADE,
  batch_id    INTEGER,
  product_id  INTEGER,
  name        VARCHAR(200),
  qty         INTEGER NOT NULL,
  unit_cost   NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_credit NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rtv_supplier ON stock_returns_vendor (supplier_id);
