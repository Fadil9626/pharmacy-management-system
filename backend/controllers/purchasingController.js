const pool = require("../config/db");
const { effectiveBranch } = require("../lib/context");

const branchOf = effectiveBranch;

// ── Suppliers ───────────────────────────────────────────────
exports.createSupplier = async (req, res) => {
  const { name, phone, email, address } = req.body || {};
  if (!name) return res.status(400).json({ message: "Supplier name is required" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO suppliers (name, phone, email, address)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, phone || null, email || null, address || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ── Reorder suggestions — products at/below reorder level ────
exports.reorderSuggestions = async (req, res) => {
  const branchId = branchOf(req);
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.unit, p.reorder_level,
              COALESCE(SUM(b.quantity), 0)::int AS stock,
              GREATEST(p.reorder_level * 2 - COALESCE(SUM(b.quantity), 0), p.reorder_level)::int AS suggested_qty
       FROM products p
       LEFT JOIN product_batches b
         ON b.product_id = p.id AND ($1::int IS NULL OR b.branch_id = $1)
       WHERE p.is_active = true
       GROUP BY p.id
       HAVING COALESCE(SUM(b.quantity), 0) <= p.reorder_level
       ORDER BY (COALESCE(SUM(b.quantity), 0) - p.reorder_level), p.name`,
      [branchId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ── Purchase orders ─────────────────────────────────────────
exports.createPO = async (req, res) => {
  const branchId = branchOf(req);
  const { supplier_id, notes, status = "ordered", items } = req.body || {};
  if (!branchId) return res.status(400).json({ message: "No branch on this account" });
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ message: "Add at least one product line" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let total = 0;
    for (const it of items) total += (Number(it.qty_ordered) || 0) * (Number(it.cost_price) || 0);

    const po = await client.query(
      `INSERT INTO purchase_orders (branch_id, supplier_id, status, notes, total_cost, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
      [branchId, supplier_id || null, status, notes || null, total, req.user.id]
    );
    const poId = po.rows[0].id;
    await client.query("UPDATE purchase_orders SET po_number = $1 WHERE id = $2", [
      `PO-${String(poId).padStart(5, "0")}`,
      poId,
    ]);

    for (const it of items) {
      if (!it.product_id || !it.qty_ordered) continue;
      await client.query(
        `INSERT INTO purchase_order_items
           (po_id, product_id, qty_ordered, cost_price, selling_price, batch_no, expiry_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [poId, it.product_id, it.qty_ordered, it.cost_price || 0, it.selling_price || 0,
         it.batch_no || null, it.expiry_date || null]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ id: poId, po_number: `PO-${String(poId).padStart(5, "0")}`, total_cost: total });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ message: e.message });
  } finally {
    client.release();
  }
};

exports.listPOs = async (req, res) => {
  const branchId = branchOf(req);
  try {
    const { rows } = await pool.query(
      `SELECT po.id, po.po_number, po.status, po.total_cost, po.created_at, po.received_at,
              s.name AS supplier_name, u.full_name AS created_by_name,
              (SELECT COUNT(*) FROM purchase_order_items i WHERE i.po_id = po.id)::int AS line_count
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       LEFT JOIN users u ON po.created_by = u.id
       WHERE ($1::int IS NULL OR po.branch_id = $1)
       ORDER BY po.created_at DESC
       LIMIT 100`,
      [branchId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getPO = async (req, res) => {
  try {
    const po = await pool.query(
      `SELECT po.*, s.name AS supplier_name, u.full_name AS created_by_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       LEFT JOIN users u ON po.created_by = u.id
       WHERE po.id = $1`,
      [req.params.id]
    );
    if (!po.rows.length) return res.status(404).json({ message: "Order not found" });
    const items = await pool.query(
      `SELECT i.*, p.name AS product_name, p.unit
       FROM purchase_order_items i JOIN products p ON i.product_id = p.id
       WHERE i.po_id = $1 ORDER BY i.id`,
      [req.params.id]
    );
    res.json({ ...po.rows[0], items: items.rows });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ── Goods received — turn an order into FEFO stock ──────────
exports.receivePO = async (req, res) => {
  const poId = Number(req.params.id);
  const overrides = Array.isArray(req.body?.lines) ? req.body.lines : [];
  const byId = new Map(overrides.map((l) => [Number(l.id), l]));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const poRes = await client.query(
      "SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE",
      [poId]
    );
    if (!poRes.rows.length) throw new Error("Order not found");
    const po = poRes.rows[0];
    if (po.status === "received") throw new Error("This order is already received");
    if (po.status === "cancelled") throw new Error("This order was cancelled");

    const items = await client.query("SELECT * FROM purchase_order_items WHERE po_id = $1", [poId]);
    let received = 0;

    for (const it of items.rows) {
      const o = byId.get(it.id) || {};
      const qty = o.qty_received != null ? Number(o.qty_received) : it.qty_ordered;
      if (!qty || qty <= 0) continue;
      const cost = o.cost_price != null ? Number(o.cost_price) : Number(it.cost_price);
      const sell = o.selling_price != null ? Number(o.selling_price) : Number(it.selling_price);
      const batchNo = o.batch_no ?? it.batch_no;
      const expiry = o.expiry_date ?? it.expiry_date;

      await client.query(
        `INSERT INTO product_batches
           (product_id, branch_id, supplier_id, batch_no, expiry_date, quantity, cost_price, selling_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [it.product_id, po.branch_id, po.supplier_id, batchNo || null, expiry || null, qty, cost, sell]
      );
      await client.query("UPDATE purchase_order_items SET qty_received = $1 WHERE id = $2", [qty, it.id]);
      received += qty;
    }

    if (received === 0) throw new Error("Nothing to receive");

    await client.query(
      "UPDATE purchase_orders SET status = 'received', received_at = NOW() WHERE id = $1",
      [poId]
    );
    await client.query("COMMIT");
    res.json({ id: poId, status: "received", units_received: received });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ message: e.message });
  } finally {
    client.release();
  }
};

exports.cancelPO = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE purchase_orders SET status = 'cancelled'
       WHERE id = $1 AND status <> 'received' RETURNING id, status`,
      [req.params.id]
    );
    if (!rows.length) return res.status(400).json({ message: "Cannot cancel this order" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
