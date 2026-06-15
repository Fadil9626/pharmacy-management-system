const pool = require("../config/db");
const { pricingContext, effectivePrice } = require("../lib/pricing");
const { effectiveBranch } = require("../lib/context");
const { logAudit } = require("../lib/audit");

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
      `SELECT p.id, p.name, p.generic_name, p.category, p.category_id, p.dosage_form,
              p.strength, p.unit, p.barcode, p.is_controlled, p.reorder_level, p.base_price,
              p.pack_size, p.pack_label,
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

// Find a category by name, creating it if needed (used by CSV import).
async function resolveCategoryByName(name) {
  if (!name || !name.trim()) return null;
  const n = name.trim();
  const f = await pool.query("SELECT id FROM categories WHERE lower(name) = lower($1) LIMIT 1", [n]);
  if (f.rows.length) return f.rows[0].id;
  const ins = await pool.query("INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id", [n]);
  if (ins.rows.length) return ins.rows[0].id;
  const f2 = await pool.query("SELECT id FROM categories WHERE lower(name) = lower($1) LIMIT 1", [n]);
  return f2.rows[0]?.id || null;
}

// Bulk import products from parsed CSV rows.
exports.importProducts = async (req, res) => {
  const rows = Array.isArray(req.body.products) ? req.body.products : null;
  if (!rows || !rows.length) return res.status(400).json({ message: "No rows to import" });
  if (rows.length > 5000) return res.status(400).json({ message: "Too many rows (max 5000 per import)" });
  try {
    const def = await pool.query("SELECT low_stock_default FROM settings WHERE id = 1");
    const reorderDefault = Number(def.rows[0]?.low_stock_default || 10);
    let created = 0, skipped = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      try {
        const name = String(r.name || "").trim();
        if (!name) { errors.push({ row: i + 1, error: "Missing name" }); continue; }
        const dup = await pool.query("SELECT 1 FROM products WHERE lower(name) = lower($1) AND is_active = true LIMIT 1", [name]);
        if (dup.rows.length) { skipped++; continue; }
        const catId = await resolveCategoryByName(r.category);
        const reorder = r.reorder_level != null && r.reorder_level !== "" ? Number(r.reorder_level) || reorderDefault : reorderDefault;
        const controlled = /^(1|true|yes|y)$/i.test(String(r.is_controlled || ""));
        const packSize = Math.max(1, Number(r.pack_size) || 1);
        await pool.query(
          `INSERT INTO products (name, generic_name, category, category_id, dosage_form, strength, unit, barcode, is_controlled, reorder_level, base_price, pack_size, pack_label)
           VALUES ($1,$2,$3,$4,$5,$6,COALESCE(NULLIF($7,''),'unit'),$8,$9,$10,$11,$12,$13)`,
          [name, r.generic_name || null, r.category || null, catId, r.dosage_form || null, r.strength || null,
           r.unit || null, r.barcode || null, controlled, reorder,
           r.base_price != null && r.base_price !== "" ? Number(r.base_price) : null,
           packSize, r.pack_label || null]
        );
        created++;
      } catch (e) {
        errors.push({ row: i + 1, error: e.message });
      }
    }
    res.json({ created, skipped, errors });
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
  const { name, generic_name, category, category_id, dosage_form, strength, unit, barcode, is_controlled, reorder_level, base_price, pack_size, pack_label } = req.body || {};
  if (!name) return res.status(400).json({ message: "Product name is required" });
  try {
    const cat = await resolveCategory(category_id, category);
    const def = await pool.query("SELECT low_stock_default FROM settings WHERE id = 1");
    const reorder = reorder_level != null && reorder_level !== ""
      ? Number(reorder_level)
      : Number(def.rows[0]?.low_stock_default || 10);
    const pack = Math.max(1, Number(pack_size) || 1);
    const { rows } = await pool.query(
      `INSERT INTO products (name, generic_name, category, category_id, dosage_form, strength, unit, barcode, is_controlled, reorder_level, base_price, pack_size, pack_label)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'unit'),$8,COALESCE($9,false),$10,$11,$12,$13) RETURNING *`,
      [name, generic_name || null, cat.name, cat.id, dosage_form || null, strength || null,
       unit || null, barcode || null, is_controlled || false, reorder,
       base_price !== "" && base_price != null ? Number(base_price) : null,
       pack, pack_label || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.updateProduct = async (req, res) => {
  const id = Number(req.params.id);
  const { name, generic_name, category, category_id, dosage_form, strength, unit, barcode, is_controlled, reorder_level, base_price, pack_size, pack_label } = req.body || {};
  if (!name) return res.status(400).json({ message: "Product name is required" });
  try {
    const cat = await resolveCategory(category_id, category);
    const pack = Math.max(1, Number(pack_size) || 1);
    const { rows } = await pool.query(
      `UPDATE products SET
         name=$1, generic_name=$2, category=$3, category_id=$4, dosage_form=$5, strength=$6,
         unit=COALESCE($7,'unit'), barcode=$8, is_controlled=COALESCE($9,false),
         reorder_level=COALESCE($10,10), base_price=COALESCE($12, base_price),
         pack_size=$13, pack_label=$14
       WHERE id=$11 RETURNING *`,
      [name, generic_name || null, cat.name, cat.id, dosage_form || null, strength || null,
       unit || null, barcode || null, is_controlled || false, reorder_level || 10, id,
       base_price !== "" && base_price != null ? Number(base_price) : null,
       pack, pack_label || null]
    );
    if (!rows.length) return res.status(404).json({ message: "Product not found" });
    logAudit(req, "product_update", "product", id, { name: rows[0].name, base_price: rows[0].base_price, reorder_level: rows[0].reorder_level });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.deactivateProduct = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE products SET is_active = false WHERE id = $1 RETURNING id, name",
      [Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ message: "Product not found" });
    logAudit(req, "product_deactivate", "product", rows[0].id, { name: rows[0].name });
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
    logAudit(req, "stock_adjust", "batch", batch_id, { product_id: batch.product_id, reason, qty_change: change, new_quantity: newQty, note: note || null });
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
  const { product_id, batch_no, expiry_date, quantity, cost_price, selling_price, supplier_id, receive_by } = req.body || {};
  const branchId = effectiveBranch(req); // honor the active branch lens, not just the user's home branch
  if (!product_id || !quantity || quantity <= 0) {
    return res.status(400).json({ message: "Product and a positive quantity are required" });
  }
  if (!branchId) return res.status(400).json({ message: "No branch on this account" });
  try {
    // Receiving by pack: the figures are per pack, so convert to base units —
    // quantity × pack_size, and the per-pack cost spread across its units.
    let qtyUnits = Number(quantity);
    let unitCost = cost_price != null && cost_price !== "" ? Number(cost_price) : 0;
    if (receive_by === "pack") {
      const p = await pool.query("SELECT pack_size FROM products WHERE id = $1", [product_id]);
      const packSize = Math.max(1, Number(p.rows[0]?.pack_size) || 1);
      qtyUnits = Number(quantity) * packSize;
      unitCost = Math.round((unitCost / packSize) * 10000) / 10000;
    }
    const { rows } = await pool.query(
      `INSERT INTO product_batches (product_id, branch_id, supplier_id, batch_no, expiry_date, quantity, cost_price, selling_price)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::numeric,0),COALESCE($8::numeric,0)) RETURNING *`,
      [product_id, branchId, supplier_id || null, batch_no || null, expiry_date || null,
       qtyUnits, unitCost, selling_price]
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
