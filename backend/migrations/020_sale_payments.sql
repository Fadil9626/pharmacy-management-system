-- ============================================================
-- Remedy — split payments. Each sale records one or more tender lines;
-- payment-mix reporting reads from here (sales.payment_method becomes
-- 'split' when more than one method is used).
-- ============================================================
CREATE TABLE IF NOT EXISTS sale_payments (
  id      SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method  VARCHAR(30) NOT NULL,
  amount  NUMERIC(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_salepay_sale ON sale_payments (sale_id);

-- Backfill: every existing sale becomes a single tender line (run once).
INSERT INTO sale_payments (sale_id, method, amount)
  SELECT s.id, s.payment_method, s.total
  FROM sales s
  WHERE NOT EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id);
