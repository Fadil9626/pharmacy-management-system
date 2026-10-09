-- ─────────────────────────────────────────────────────────────────────────────
-- Transfers travel. A transfer used to take stock out of one branch and put it
-- on the other branch's shelf in the same instant, so stock that fell off the
-- van, or never left, was already "received". Now it leaves the sending branch
-- and is IN TRANSIT until someone at the receiving branch confirms it arrived;
-- the sender can cancel it before then, which puts it back.
--
-- stock_transfer_batches keeps the batches that left (batch number, expiry,
-- cost, price), so the receiving branch gets exactly those.
--
-- A pharmacy that prefers the old instant transfer turns
-- settings.transfers_need_receiving off (Settings → Inventory).
-- Transfers made before this were instant, so they are 'received'.
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'received'; -- in_transit|received|cancelled
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS received_by INTEGER REFERENCES users(id);
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS closed_note TEXT;
CREATE INDEX IF NOT EXISTS idx_transfers_transit ON stock_transfers (to_branch_id) WHERE status = 'in_transit';

CREATE TABLE IF NOT EXISTS stock_transfer_batches (
  id              SERIAL PRIMARY KEY,
  transfer_id     INTEGER NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  source_batch_id INTEGER REFERENCES product_batches(id) ON DELETE SET NULL,
  product_id      INTEGER NOT NULL REFERENCES products(id),
  supplier_id     INTEGER,
  batch_no        VARCHAR(60),
  expiry_date     DATE,
  qty             INTEGER NOT NULL,
  cost_price      NUMERIC(12,4) NOT NULL DEFAULT 0,
  selling_price   NUMERIC(12,2) NOT NULL DEFAULT 0
);

ALTER TABLE settings ADD COLUMN IF NOT EXISTS transfers_need_receiving BOOLEAN NOT NULL DEFAULT TRUE;
