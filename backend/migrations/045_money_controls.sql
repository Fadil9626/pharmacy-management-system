-- ─────────────────────────────────────────────────────────────────────────────
-- Money controls found missing in the October 2026 audit.
--
-- • sales.points_earned — the loyalty points a sale actually earned, so a
--   refund takes back exactly those (in proportion), not "the refund amount",
--   which was wrong whenever the earn rate was not 1.
-- • purchase_orders.received_value — the cost of what has actually arrived.
--   Payables were worked out from what was ORDERED, so a short delivery left
--   the supplier shown as owed for goods that never came. Orders received
--   before this keep their ordered total as the received value (that is what
--   they were paid against).
-- • settings.require_expiry_on_receive — receiving without an expiry date is
--   refused unless the pharmacy turns this off (Settings → Inventory).
-- • One open till per person, enforced by the database: two quick clicks on
--   "Open till" could open two.
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE sales ADD COLUMN IF NOT EXISTS points_earned INTEGER;

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_value NUMERIC(12,2) NOT NULL DEFAULT 0;
UPDATE purchase_orders SET received_value = total_cost
 WHERE status = 'received' AND received_value = 0 AND total_cost > 0;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS require_expiry_on_receive BOOLEAN NOT NULL DEFAULT TRUE;

-- Close any duplicate open tills first (keep each person's newest), so the index can exist.
UPDATE shifts s SET status = 'closed', closed_at = COALESCE(closed_at, NOW()),
       note = COALESCE(note || ' · ', '') || 'closed automatically: a second till was open'
 WHERE s.status = 'open'
   AND EXISTS (SELECT 1 FROM shifts n WHERE n.user_id = s.user_id AND n.status = 'open' AND n.opened_at > s.opened_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shifts_one_open ON shifts (user_id) WHERE status = 'open';
