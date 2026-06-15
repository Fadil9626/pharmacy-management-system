-- ============================================================
-- Remedy — supplier accounts payable. A received purchase order becomes a
-- bill; payments are tracked against it.
-- ============================================================
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS supplier_payments (
  id          SERIAL PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(id),
  po_id       INTEGER REFERENCES purchase_orders(id),
  amount      NUMERIC(14,2) NOT NULL,
  method      VARCHAR(30) NOT NULL DEFAULT 'cash',
  note        TEXT,
  user_id     INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_suppay_supplier ON supplier_payments (supplier_id, created_at DESC);
