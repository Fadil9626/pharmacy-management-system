-- ============================================================
-- Remedy — prescriptions (clinical dispensing record)
-- ============================================================
CREATE TABLE IF NOT EXISTS prescriptions (
  id                  SERIAL PRIMARY KEY,
  rx_number           VARCHAR(30),
  patient_name        VARCHAR(160) NOT NULL,
  customer_id         INTEGER REFERENCES customers(id),
  prescriber_name     VARCHAR(160),
  prescriber_facility VARCHAR(160),
  prescribed_date     DATE,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|dispensed|cancelled
  refills_allowed     INTEGER NOT NULL DEFAULT 0,
  refills_used        INTEGER NOT NULL DEFAULT 0,
  notes               TEXT,
  created_by          INTEGER REFERENCES users(id),
  dispensed_by        INTEGER REFERENCES users(id),
  dispensed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rx_status ON prescriptions (status, created_at DESC);

CREATE TABLE IF NOT EXISTS prescription_items (
  id              SERIAL PRIMARY KEY,
  prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  product_id      INTEGER REFERENCES products(id),
  drug_name       VARCHAR(200) NOT NULL,
  dosage          VARCHAR(200),               -- sig / instructions
  quantity        INTEGER NOT NULL DEFAULT 0,
  dispensed_qty   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rxitems_rx ON prescription_items (prescription_id);
