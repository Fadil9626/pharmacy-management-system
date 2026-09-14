-- ─────────────────────────────────────────────────────────────────────────────
-- Expired stock, written off as one documented event.
--
-- The stock movement itself already had a home: stock_adjustments, reason
-- 'expired'. What was missing is the thing a regulator asks for — a single
-- dated record saying what was destroyed, how much of it, what it was worth,
-- who did it and who witnessed it. Twelve separate batch adjustments made over
-- an afternoon are the same stock movement and not the same document.
--
-- So a disposal is a header plus its lines, and each line still writes its own
-- stock_adjustments row. The ledger of stock movements stays complete and
-- unchanged for anything already reading it; this sits alongside it.
--
-- Deliberately not limited to expiry. The reason column carries the same
-- vocabulary as stock_adjustments, because damaged and recalled stock are
-- destroyed and documented the same way — and a recall is the case where being
-- able to produce the record quickly matters most.
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS disposals (
  id            SERIAL PRIMARY KEY,
  ref           VARCHAR(20),                        -- human handle, e.g. DSP-00007
  branch_id     INTEGER REFERENCES branches(id),
  user_id       INTEGER REFERENCES users(id),       -- who carried it out
  reason        VARCHAR(30) NOT NULL DEFAULT 'expired',
  method        VARCHAR(60),                        -- incineration, returned to supplier, ...
  witness_name  VARCHAR(160),                       -- controlled drugs usually require one
  note          TEXT,
  -- Value at cost, summed from the lines at the moment of disposal. Stored
  -- rather than recomputed: batch cost can be edited afterwards, and a
  -- disposal record that quietly changes value is not a record.
  total_cost    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_units   INTEGER       NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS disposal_items (
  id           SERIAL PRIMARY KEY,
  disposal_id  INTEGER NOT NULL REFERENCES disposals(id) ON DELETE CASCADE,
  batch_id     INTEGER REFERENCES product_batches(id) ON DELETE SET NULL,
  product_id   INTEGER REFERENCES products(id),
  -- Denormalised on purpose. A disposal record has to stay readable years after
  -- the product is renamed or deleted; an inspector is holding the paper, not
  -- the database.
  product_name VARCHAR(200),
  batch_no     VARCHAR(80),
  expiry_date  DATE,
  qty          INTEGER NOT NULL,
  unit_cost    NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_cost    NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_controlled BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_disposals_created ON disposals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disposal_items_disposal ON disposal_items (disposal_id);
