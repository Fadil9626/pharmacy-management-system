-- ============================================================
-- Remedy — finance: till shifts, cash movements, expenses
-- ============================================================
CREATE TABLE IF NOT EXISTS shifts (
  id              SERIAL PRIMARY KEY,
  branch_id       INTEGER REFERENCES branches(id),
  user_id         INTEGER REFERENCES users(id),
  opening_float   NUMERIC(14,2) NOT NULL DEFAULT 0,
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_cash   NUMERIC(14,2),
  closing_counted NUMERIC(14,2),
  variance        NUMERIC(14,2),
  status          VARCHAR(10) NOT NULL DEFAULT 'open',  -- open | closed
  note            TEXT,
  closed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_shifts_user_status ON shifts (user_id, status);

-- Cash entering/leaving the drawer mid-shift (drops to safe, pay-outs, top-ups).
CREATE TABLE IF NOT EXISTS cash_movements (
  id         SERIAL PRIMARY KEY,
  shift_id   INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  type       VARCHAR(20) NOT NULL,   -- drop | payout | in
  amount     NUMERIC(14,2) NOT NULL,
  note       TEXT,
  user_id    INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id         SERIAL PRIMARY KEY,
  branch_id  INTEGER REFERENCES branches(id),
  shift_id   INTEGER REFERENCES shifts(id),
  category   VARCHAR(60),
  amount     NUMERIC(14,2) NOT NULL,
  note       TEXT,
  paid_from_till BOOLEAN NOT NULL DEFAULT true,
  user_id    INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses (created_at DESC);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES shifts(id);
