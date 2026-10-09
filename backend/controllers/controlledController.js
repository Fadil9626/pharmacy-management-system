const pool = require("../config/db");
const { stockCard } = require("../lib/stockCard");

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
// The register for one controlled product: every receipt, dispensing (with the
// prescriber), return, transfer, adjustment and destruction, with the running
// balance — read from the stock history, which the database writes for every
// change. It used to be rebuilt from batches and sales, counting each batch's
// CURRENT quantity as "received" and then subtracting the sales a second time.
exports.register = async (req, res) => {
  const productId = Number(req.params.id);
  const branchId = branchOf(req);
  try {
    const guard = await pool.query("SELECT name, is_controlled FROM products WHERE id = $1", [productId]);
    if (!guard.rows.length) return res.status(404).json({ message: "Product not found" });
    const card = await stockCard(productId, branchId);
    res.json({ product: guard.rows[0].name, ...card });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
