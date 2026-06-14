const pool = require("../config/db");
const { pricingContext, effectivePrice } = require("../lib/pricing");
const { effectiveBranch } = require("../lib/context");

const branchOf = effectiveBranch;

// Products with aggregated stock for a branch.
exports.listProducts = async (req, res) => {
  const branchId = branchOf(req);
  try {
    const ctx = await pricingContext();
    const { rows } = await pool.query(
      `SELECT p.*,
              COALESCE(s.qty, 0)::int          AS stock,
              s.nearest_expiry,
              COALESCE(s.price, 0)::float      AS price
       FROM products p
       LEFT JOIN LATERAL (
         SELECT SUM(quantity) AS qty,
                MIN(expiry_date) FILTER (WHERE quantity > 0) AS nearest_expiry,
                MAX(selling_price) FILTER (WHERE quantity > 0) AS price
         FROM product_batches b
         WHERE b.product_id = p.id AND ($1::int IS NULL OR b.branch_id = $1)
       ) s ON true
       WHERE p.is_active = true
       ORDER BY p.name`,
      [branchId]
    );
    res.json(rows.map((p) => ({
      ...p,
      effective_price: effectivePrice(ctx, p.base_price, p.price),
    })));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Lightweight catalogue lookup shared by any module (no module gate).
exports.listLite = async (req, res) => {
  const branchId = branchOf(req);
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.unit, p.reorder_level,
              COALESCE(s.qty, 0)::int   AS stock,
              COALESCE(s.cost, 0)::float  AS last_cost,
              COALESCE(s.price, 0)::float AS last_price
       FROM products p
       LEFT JOIN LATERAL (
         SELECT SUM(quantity) AS qty,
                (ARRAY_AGG(cost_price ORDER BY received_at DESC))[1] AS cost,
                (ARRAY_AGG(selling_price ORDER BY received_at DESC))[1] AS price
         FROM product_batches b
         WHERE b.product_id = p.id AND ($1::int IS NULL OR b.branch_id = $1)
       ) s ON true
       WHERE p.is_active = true
       ORDER BY p.name`,
      [branchId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Resolve a category_id to its name, or fall back to free text (legacy).
async function resolveCategory(category_id, categoryText) {
  if (category_id) {
    const { rows } = await pool.query("SELECT name FROM categories WHERE id = $1", [category_id]);
    if (rows.length) return { id: category_id, name: rows[0].name };
  }
  return { id: null, name: categoryText || null };
}

exports.createProduct = async (req, res) => {
  const { name, generic_name, category, category_id, dosage_form, strength, unit, barcode, is_controlled, reorder_level, base_price } = req.body || {};
  if (!name) return res.status(400).json({ message: "Product name is required" });
  try {
    const cat = await resolveCategory(category_id, category);
    const def = await pool.query("SELECT low_stock_default FROM settings WHERE id = 1");
    const reorder = reorder_level != null && reorder_level !== ""
      ? Number(reorder_level)
      : Number(def.rows[0]?.low_stock_default || 10);
    const { rows } = await pool.query(
      `INSERT INTO products (name, generic_name, category, category_id, dosage_form, strength, unit, barcode, is_controlled, reorder_level, base_price)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'unit'),$8,COALESCE($9,false),$10,$11) RETURNING *`,
      [name, generic_name || null, cat.name, cat.id, dosage_form || null, strength || null,
       unit || null, barcode || null, is_controlled || false, reorder,
       base_price !== "" && base_price != null ? Number(base_price) : null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.updateProduct = async (req, res) => {
  const id = Number(req.params.id);
  const { name, generic_name, category, category_id, dosage_form, strength, unit, barcode, is_controlled, reorder_level, base_price } = req.body || {};
  if (!name) return res.status(400).json({ message: "Product name is required" });
  try {
    const cat = await resolveCategory(category_id, category);
    const { rows } = await pool.query(
      `UPDATE products SET
         name=$1, generic_name=$2, category=$3, category_id=$4, dosage_form=$5, strength=$6,
         unit=COALESCE($7,'unit'), barcode=$8, is_controlled=COALESCE($9,false),
         reorder_level=COALESCE($10,10), base_price=COALESCE($12, base_price)
       WHERE id=$11 RETURNING *`,
      [name, generic_name || null, cat.name, cat.id, dosage_form || null, strength || null,
       unit || null, barcode || null, is_controlled || false, reorder_level || 10, id,
       base_price !== "" && base_price != null ? Number(base_price) : null]
    );
    if (!rows.length) return res.status(404).json({ message: "Product not found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.deactivateProduct = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE products SET is_active = false WHERE id = $1 RETURNING id",
      [Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ message: "Product not found" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Adjust a batch's stock (write-off expired/damaged, or correct a count).
exports.adjustStock = async (req, res) => {
  const { batch_id, qty_change, reason, note } = req.body || {};
  const change = Number(qty_change);
  const REASONS = ["expired", "damaged", "lost", "recall", "correction"];
  if (!batch_id || !change || Number.isNaN(change))
    return res.status(400).json({ message: "Batch and a non-zero quantity change are required" });
  if (!REASONS.includes(reason)) return res.status(400).json({ message: "Invalid reason" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const b = await client.query("SELECT * FROM product_batches WHERE id = $1 FOR UPDATE", [batch_id]);
    if (!b.rows.length) throw new Error("Batch not found");
    const batch = b.rows[0];
    const newQty = batch.quantity + change;
    if (newQty < 0) throw new Error(`Only ${batch.quantity} in this batch — can't remove ${Math.abs(change)}`);

    await client.query("UPDATE product_batches SET quantity = $1 WHERE id = $2", [newQty, batch_id]);
    await client.query(
      `INSERT INTO stock_adjustments (batch_id, product_id, branch_id, user_id, reason, qty_change, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [batch_id, batch.product_id, batch.branch_id, req.user.id, reason, change, note || null]
    );
    await client.query("COMMIT");
    res.json({ success: true, batch_id, new_quantity: newQty });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(400).json({ message: e.message });
  } finally {
    client.release();
  }
};

// Stock batches (FEFO order) for a branch / product, flagged for expiry.
exports.listBatches = async (req, res) => {
  const branchId = branchOf(req);
  const productId = Number(req.query.product_id) || null;
  try {
    const cfg = await pool.query("SELECT near_expiry_months FROM settings WHERE id = 1");
    const nearMonths = Number(cfg.rows[0]?.near_expiry_months || 3);
    const { rows } = await pool.query(
      `SELECT b.*, p.name AS product_name, p.unit, s.name AS supplier_name,
              (b.expiry_date IS NOT NULL AND b.expiry_date < CURRENT_DATE) AS expired,
              (b.expiry_date IS NOT NULL AND b.expiry_date >= CURRENT_DATE
                 AND b.expiry_date <= CURRENT_DATE + make_interval(months => $3)) AS expiring
       FROM product_batches b
       JOIN products p ON b.product_id = p.id
       LEFT JOIN suppliers s ON b.supplier_id = s.id
       WHERE ($1::int IS NULL OR b.branch_id = $1)
         AND ($2::int IS NULL OR b.product_id = $2)
       ORDER BY b.expiry_date NULLS LAST, b.id`,
      [branchId, productId, nearMonths]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Receive stock (opening stock / purchasing-lite).
exports.receiveStock = async (req, res) => {
  const { product_id, batch_no, expiry_date, quantity, cost_price, selling_price, supplier_id } = req.body || {};
  const branchId = effectiveBranch(req); // honor the active branch lens, not just the user's home branch
  if (!product_id || !quantity || quantity <= 0) {
    return res.status(400).json({ message: "Product and a positive quantity are required" });
  }
  if (!branchId) return res.status(400).json({ message: "No branch on this account" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO product_batches (product_id, branch_id, supplier_id, batch_no, expiry_date, quantity, cost_price, selling_price)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,0),COALESCE($8,0)) RETURNING *`,
      [product_id, branchId, supplier_id || null, batch_no || null, expiry_date || null,
       quantity, cost_price, selling_price]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.listSuppliers = async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, name FROM suppliers WHERE is_active = true ORDER BY name");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
