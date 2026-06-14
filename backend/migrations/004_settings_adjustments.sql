-- ============================================================
-- Remedy — settings, stock adjustments (write-offs), sales tax
-- ============================================================

-- Single-row pharmacy settings (branding, currency, tax, receipt).
CREATE TABLE IF NOT EXISTS settings (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  pharmacy_name   VARCHAR(160) NOT NULL DEFAULT 'Remedy Pharmacy',
  currency_code   VARCHAR(10)  NOT NULL DEFAULT 'USD',
  currency_symbol VARCHAR(8)   NOT NULL DEFAULT '$',
  tax_percent     NUMERIC(5,2) NOT NULL DEFAULT 0,
  receipt_footer  TEXT         DEFAULT 'Thank you — get well soon.',
  address         TEXT,
  phone           VARCHAR(40),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT settings_singleton CHECK (id = 1)
);
INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Stock adjustments — every non-sale change to stock (write-offs, corrections).
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id          SERIAL PRIMARY KEY,
  batch_id    INTEGER REFERENCES product_batches(id) ON DELETE SET NULL,
  product_id  INTEGER REFERENCES products(id),
  branch_id   INTEGER REFERENCES branches(id),
  user_id     INTEGER REFERENCES users(id),
  reason      VARCHAR(30) NOT NULL,          -- expired|damaged|lost|recall|correction
  qty_change  INTEGER NOT NULL,              -- negative = removed from stock
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adjustments_batch ON stock_adjustments (batch_id);

-- Tax captured per sale (0 unless a tax rate is configured in settings).
ALTER TABLE sales ADD COLUMN IF NOT EXISTS tax NUMERIC(12,2) NOT NULL DEFAULT 0;
