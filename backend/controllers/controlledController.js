const pool = require("../config/db");

const { effectiveBranch } = require("../lib/context");
const branchOf = effectiveBranch;

// Controlled (scheduled) products with current stock.
exports.products = async (req, res) => {
  const branchId = branchOf(req);
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.strength, p.unit, p.category,
              COALESCE(SUM(b.quantity), 0)::int AS stock
       FROM products p
       LEFT JOIN product_batches b ON b.product_id = p.id AND ($1::int IS NULL OR b.branch_id = $1)
       WHERE p.is_active = true AND p.is_controlled = true
       GROUP BY p.id
       ORDER BY p.name`,
      [branchId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Immutable register for one controlled drug — every receipt, dispense and
// adjustment, time-ordered, with a running balance. Derived from source records
// (product_batches, sale_items, stock_adjustments) so it can't drift or be edited.
exports.register = async (req, res) => {
  const productId = Number(req.params.id);
  const branchId = branchOf(req);
  try {
    const guard = await pool.query("SELECT name, is_controlled FROM products WHERE id = $1", [productId]);
    if (!guard.rows.length) return res.status(404).json({ message: "Product not found" });

    const [receipts, dispenses, adjustments] = await Promise.all([
      pool.query(
        `SELECT b.received_at AS at, b.quantity::int AS delta, 'received' AS type,
                b.batch_no AS ref, s.name AS party, NULL::text AS actor
         FROM product_batches b LEFT JOIN suppliers s ON b.supplier_id = s.id
         WHERE b.product_id = $1 AND ($2::int IS NULL OR b.branch_id = $2)`,
        [productId, branchId]
      ),
      pool.query(
        `SELECT sa.created_at AS at, (-si.qty)::int AS delta, 'dispensed' AS type,
                sa.receipt_no AS ref, sa.customer_name AS party, u.full_name AS actor,
                sa.prescriber_license AS license, sa.prescriber_name AS prescriber
         FROM sale_items si JOIN sales sa ON si.sale_id = sa.id
         LEFT JOIN users u ON sa.user_id = u.id
         WHERE si.product_id = $1 AND ($2::int IS NULL OR sa.branch_id = $2)`,
        [productId, branchId]
      ),
      pool.query(
        `SELECT adj.created_at AS at, adj.qty_change::int AS delta, adj.reason AS type,
                adj.note AS ref, NULL::text AS party, u.full_name AS actor
         FROM stock_adjustments adj LEFT JOIN users u ON adj.user_id = u.id
         WHERE adj.product_id = $1 AND ($2::int IS NULL OR adj.branch_id = $2)`,
        [productId, branchId]
      ),
    ]);

    const moves = [...receipts.rows, ...dispenses.rows, ...adjustments.rows]
      .sort((a, b) => new Date(a.at) - new Date(b.at));

    let balance = 0;
    const ledger = moves.map((m) => {
      balance += m.delta;
      return { ...m, balance };
    });

    res.json({
      product: guard.rows[0].name,
      balance,
      total_in: ledger.filter((m) => m.delta > 0).reduce((s, m) => s + m.delta, 0),
      total_out: ledger.filter((m) => m.delta < 0).reduce((s, m) => s - m.delta, 0),
      // newest first for display
      ledger: ledger.reverse(),
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
