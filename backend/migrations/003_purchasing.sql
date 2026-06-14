-- ============================================================
-- Remedy — purchasing (suppliers, purchase orders, goods received)
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
  id           SERIAL PRIMARY KEY,
  branch_id    INTEGER NOT NULL REFERENCES branches(id),
  supplier_id  INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  po_number    VARCHAR(30),
  status       VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft|ordered|received|cancelled
  notes        TEXT,
  total_cost   NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_po_branch  ON purchase_orders (branch_id, status);
CREATE INDEX IF NOT EXISTS idx_po_created ON purchase_orders (created_at);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id            SERIAL PRIMARY KEY,
  po_id         INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  qty_ordered   INTEGER NOT NULL DEFAULT 0,
  qty_received  INTEGER NOT NULL DEFAULT 0,
  cost_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  batch_no      VARCHAR(60),
  expiry_date   DATE
);
CREATE INDEX IF NOT EXISTS idx_poi_po ON purchase_order_items (po_id);
