-- ─────────────────────────────────────────────────────────────────────────────
-- Stock history: one row for every change to a batch's quantity.
--
-- Until now stock was only a number per batch — what is on the shelf now — and
-- every report of what happened was rebuilt from other tables. The controlled
-- drug register did that, and got it wrong: it counted each batch's CURRENT
-- quantity as "received" and then also subtracted every sale, so receiving 100
-- and selling 30 showed a balance of 40 against 70 on the shelf. Transfers,
-- returns to stock, disposals and returns to supplier were missing altogether.
--
-- The rows are written by a trigger on product_batches, so no way of changing
-- stock — today's or one added later — can skip the history. The code says
-- what kind of change it is making (sale, receipt, transfer…) through a
-- transaction-local setting, `remedy.move`, a JSON object; a change made
-- without one is still recorded, as "unlabelled", so it shows up rather than
-- disappearing. Each row carries the transaction id, so the code can add the
-- reference (a receipt number) once it knows it.
--
-- History starts now. Each batch with stock gets one "opening" row for what it
-- holds at this moment — honestly labelled, rather than a past reconstructed
-- from tables that did not record it.
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_moves (
  id            BIGSERIAL PRIMARY KEY,
  batch_id      INTEGER REFERENCES product_batches(id) ON DELETE SET NULL,
  product_id    INTEGER NOT NULL,
  branch_id     INTEGER NOT NULL,
  delta         INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,          -- the batch's quantity after this change
  kind          VARCHAR(30) NOT NULL,      -- opening|received|sale|return|transfer_out|transfer_in|adjustment|count|disposal|return_to_supplier|unlabelled
  ref_type      VARCHAR(30),
  ref_id        INTEGER,
  ref_no        VARCHAR(40),
  party         VARCHAR(200),              -- supplier, customer or branch
  detail        JSONB,                     -- e.g. prescriber, adjustment reason
  user_id       INTEGER,
  txid          BIGINT NOT NULL DEFAULT txid_current(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_moves_product ON stock_moves (product_id, branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_moves_tx ON stock_moves (txid) WHERE ref_id IS NULL;

CREATE OR REPLACE FUNCTION record_stock_move() RETURNS trigger AS $$
DECLARE
  ctx   JSONB;
  raw   TEXT := current_setting('remedy.move', true);
  delta INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := NEW.quantity;
  ELSE
    delta := NEW.quantity - OLD.quantity;
  END IF;
  IF delta = 0 THEN
    RETURN NEW;
  END IF;
  ctx := CASE WHEN raw IS NULL OR raw = '' THEN '{}'::jsonb ELSE raw::jsonb END;
  INSERT INTO stock_moves (batch_id, product_id, branch_id, delta, balance_after, kind,
                           ref_type, ref_id, ref_no, party, detail, user_id)
  VALUES (NEW.id, NEW.product_id, NEW.branch_id, delta, NEW.quantity,
          COALESCE(ctx->>'kind', CASE WHEN TG_OP = 'INSERT' THEN 'received' ELSE 'unlabelled' END),
          ctx->>'ref_type', NULLIF(ctx->>'ref_id', '')::int, ctx->>'ref_no', ctx->>'party',
          ctx->'detail', NULLIF(ctx->>'user_id', '')::int);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_moves ON product_batches;
CREATE TRIGGER trg_stock_moves
  AFTER INSERT OR UPDATE OF quantity ON product_batches
  FOR EACH ROW EXECUTE FUNCTION record_stock_move();

-- Where the history starts: what each batch holds now.
INSERT INTO stock_moves (batch_id, product_id, branch_id, delta, balance_after, kind, detail, created_at)
SELECT b.id, b.product_id, b.branch_id, b.quantity, b.quantity, 'opening',
       '{"note": "Stock on hand when the stock history began"}'::jsonb, NOW()
  FROM product_batches b
 WHERE b.quantity <> 0
   AND NOT EXISTS (SELECT 1 FROM stock_moves m WHERE m.batch_id = b.id);
