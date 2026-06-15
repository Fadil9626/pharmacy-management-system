-- ============================================================
-- Remedy — inter-branch stock transfers. Deducts FEFO from the source branch
-- and recreates the batches (same expiry/cost) at the destination.
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_transfers (
  id             SERIAL PRIMARY KEY,
  from_branch_id INTEGER REFERENCES branches(id),
  to_branch_id   INTEGER REFERENCES branches(id),
  user_id        INTEGER REFERENCES users(id),
  reference      VARCHAR(30),
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transfers_created ON stock_transfers (created_at DESC);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id          SERIAL PRIMARY KEY,
  transfer_id INTEGER NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(id),
  name        VARCHAR(200),
  qty         INTEGER NOT NULL
);
