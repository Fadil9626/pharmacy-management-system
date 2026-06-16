const pool = require("../config/db");
const { effectiveBranch } = require("../lib/context");
const { logAudit } = require("../lib/audit");

// Batches that can be sent back to a supplier (their stock, still on hand).
exports.returnable = async (req, res) => {
  const branchId = effectiveBranch(req);
  const supplierId = Number(req.query.supplier_id);
  if (!supplierId) return res.status(400).json({ message: "Pick a supplier" });
  try {
    const { rows } = await pool.query(
      `SELECT b.id AS batch_id, b.product_id, p.name, b.batch_no, b.expiry_date,
              b.quantity, b.cost_price,
              (b.expiry_date IS NOT NULL AND b.expiry_date < CURRENT_DATE) AS expired
       FROM product_batches b JOIN products p ON b.product_id = p.id
       WHERE b.supplier_id = $1 AND b.quantity > 0
         AND ($2::int IS NULL OR b.branch_id = $2)
       ORDER BY b.expiry_date NULLS LAST, p.name`,
      [supplierId, branchId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const REASONS = ["expired", "recalled", "damaged", "overstock"];

// Create an RTV: deduct the batches and raise a credit note.
exports.create = async (req, res) => {
  const branchId = effectiveBranch(req);
  const { supplier_id, reason, note, items } = req.body || {};
  if (!supplier_id) return res.status(400).json({ message: "Pick a supplier" });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: "Add at least one batch to return" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const head = await client.query(
      "INSERT INTO stock_returns_vendor (supplier_id, branch_id, user_id, reason, note) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [Number(supplier_id), branchId, req.user.id, REASONS.includes(reason) ? reason : "expired", note || null]
    );
    const rid = head.rows[0].id;
    const reference = `RTV-${String(rid).padStart(5, "0")}`;
    await client.query("UPDATE stock_returns_vendor SET reference = $1 WHERE id = $2", [reference, rid]);

    let totalCredit = 0;
    for (const it of items) {
      const batchId = Number(it.batch_id);
      const qty = Number(it.qty);
      if (!batchId || !qty || qty <= 0) continue;
      const b = (await client.query(
        "SELECT b.*, p.name FROM product_batches b JOIN products p ON b.product_id = p.id WHERE b.id = $1 FOR UPDATE",
        [batchId]
      )).rows[0];
      if (!b) throw new Error("Batch not found");
      if (b.supplier_id !== Number(supplier_id)) throw new Error(`${b.name}: batch isn't from this supplier`);
      if (qty > b.quantity) throw new Error(`${b.name}: only ${b.quantity} on hand`);
      const credit = Math.round(qty * Number(b.cost_price) * 100) / 100;
      totalCredit += credit;
      await client.query("UPDATE product_batches SET quantity = quantity - $1 WHERE id = $2", [qty, batchId]);
      await client.query(
        "INSERT INTO stock_return_vendor_items (return_id, batch_id, product_id, name, qty, unit_cost, line_credit) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [rid, batchId, b.product_id, b.name, qty, b.cost_price, credit]
      );
      await client.query(
        `INSERT INTO stock_adjustments (batch_id, product_id, branch_id, user_id, reason, qty_change, note)
         VALUES ($1,$2,$3,$4,'return_to_vendor',$5,$6)`,
        [batchId, b.product_id, branchId, req.user.id, -qty, reference]
      );
    }
    totalCredit = Math.round(totalCredit * 100) / 100;
    await client.query("UPDATE stock_returns_vendor SET total_credit = $1 WHERE id = $2", [totalCredit, rid]);
    await client.query("COMMIT");
    logAudit(req, "rtv_create", "rtv", rid, { supplier_id, reason, credit: totalCredit });
    res.status(201).json({ id: rid, reference, total_credit: totalCredit });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(400).json({ message: e.message });
  } finally {
    client.release();
  }
};

exports.list = async (req, res) => {
  const branchId = effectiveBranch(req);
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.reference, r.reason, r.total_credit, r.note, r.created_at,
              s.name AS supplier_name, u.full_name AS by_user,
              (SELECT COALESCE(SUM(qty),0) FROM stock_return_vendor_items i WHERE i.return_id = r.id)::int AS units
       FROM stock_returns_vendor r
       LEFT JOIN suppliers s ON r.supplier_id = s.id
       LEFT JOIN users u ON r.user_id = u.id
       WHERE ($1::int IS NULL OR r.branch_id = $1)
       ORDER BY r.created_at DESC LIMIT 100`,
      [branchId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
