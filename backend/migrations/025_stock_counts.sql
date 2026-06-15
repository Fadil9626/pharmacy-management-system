-- ============================================================
-- Remedy — physical stock counts. Posting a count reconciles system stock to
-- the counted figure, writing a correction adjustment per variance.
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_counts (
  id             SERIAL PRIMARY KEY,
  branch_id      INTEGER REFERENCES branches(id),
  user_id        INTEGER REFERENCES users(id),
  note           TEXT,
  items_counted  INTEGER NOT NULL DEFAULT 0,
  variance_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_counts_created ON stock_counts (created_at DESC);

CREATE TABLE IF NOT EXISTS stock_count_items (
  id          SERIAL PRIMARY KEY,
  count_id    INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(id),
  name        VARCHAR(200),
  system_qty  INTEGER,
  counted_qty INTEGER,
  variance    INTEGER
);
