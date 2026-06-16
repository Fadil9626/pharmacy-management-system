const pool = require("../config/db");
const { effectiveBranch } = require("../lib/context");
const { logAudit } = require("../lib/audit");

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
// Velocity-based reorder: combine sales rate (units/day over a window) with
// current stock to surface what's running out — including fast movers that are
// still above their reorder level — and a suggested order qty covering the
// supplier lead time + a safety buffer.
exports.reorderSuggestions = async (req, res) => {
  const branchId = branchOf(req);
  const windowDays = Math.min(Math.max(Number(req.query.window) || 30, 7), 180);
  const leadDays = Math.max(Number(req.query.lead) || 7, 0);
  const bufferDays = Math.max(Number(req.query.buffer) || 7, 0);
  const cover = leadDays + bufferDays;
  try {
    const { rows } = await pool.query(
      `WITH sold AS (
         SELECT si.product_id, SUM(si.qty)::numeric AS units
         FROM sale_items si JOIN sales s ON si.sale_id = s.id
         WHERE s.created_at >= NOW() - ($2 || ' days')::interval
           AND ($1::int IS NULL OR s.branch_id = $1)
         GROUP BY si.product_id
       )
       SELECT p.id, p.name, p.unit, p.reorder_level,
              COALESCE(SUM(b.quantity) FILTER (WHERE b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE), 0)::int AS stock,
              COALESCE(so.units, 0)::numeric AS sold_window
       FROM products p
       LEFT JOIN product_batches b ON b.product_id = p.id AND ($1::int IS NULL OR b.branch_id = $1)
       LEFT JOIN sold so ON so.product_id = p.id
       WHERE p.is_active = true
       GROUP BY p.id, so.units`,
      [branchId, String(windowDays)]
    );

    const out = rows
      .map((r) => {
        const rate = Math.round((Number(r.sold_window) / windowDays) * 100) / 100; // units/day
        const daysLeft = rate > 0 ? Math.round((r.stock / rate) * 10) / 10 : null;
        let suggested = Math.max(0, Math.ceil(rate * cover) - r.stock);
        if (r.stock <= r.reorder_level) suggested = Math.max(suggested, r.reorder_level * 2 - r.stock, 1);
        return { id: r.id, name: r.name, unit: r.unit, reorder_level: r.reorder_level, stock: r.stock,
                 sold_window: Number(r.sold_window), daily_rate: rate, days_left: daysLeft, suggested_qty: Math.max(0, suggested) };
      })
      // Needs ordering if below reorder level OR projected to run out within the cover window.
      .filter((r) => r.suggested_qty > 0 && (r.stock <= r.reorder_level || (r.days_left !== null && r.days_left <= cover)))
      .sort((a, b) => (a.days_left ?? 1e9) - (b.days_left ?? 1e9));

    res.json({ window_days: windowDays, lead_days: leadDays, buffer_days: bufferDays, items: out });
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

// ── Accounts payable ───────────────────────────────────────
// Received POs with an outstanding balance, plus per-supplier totals.
exports.listPayables = async (req, res) => {
  const branchId = branchOf(req);
  try {
    const { rows } = await pool.query(
      `SELECT po.id, po.po_number, po.total_cost, po.amount_paid,
              (po.total_cost - po.amount_paid)::float AS outstanding,
              po.received_at, s.id AS supplier_id, s.name AS supplier_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.status = 'received' AND (po.total_cost - po.amount_paid) > 0.005
         AND ($1::int IS NULL OR po.branch_id = $1)
       ORDER BY po.received_at`,
      [branchId]
    );
    const bySupplier = {};
    rows.forEach((r) => {
      const k = r.supplier_name || "—";
      bySupplier[k] = (bySupplier[k] || 0) + Number(r.outstanding);
    });
    res.json({
      payables: rows,
      total_owed: rows.reduce((s, r) => s + Number(r.outstanding), 0),
      by_supplier: Object.entries(bySupplier).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Record a payment against a received PO.
exports.payPO = async (req, res) => {
  const poId = Number(req.params.id);
  const { amount, method = "cash", note } = req.body || {};
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ message: "A positive amount is required" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const po = await client.query("SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE", [poId]);
    if (!po.rows.length) throw new Error("Order not found");
    const p = po.rows[0];
    if (p.status !== "received") throw new Error("Only received orders can be paid");
    const outstanding = Number(p.total_cost) - Number(p.amount_paid);
    if (amt > outstanding + 0.01) throw new Error(`Only ${outstanding.toFixed(2)} is outstanding on this order`);
    await client.query("UPDATE purchase_orders SET amount_paid = amount_paid + $1 WHERE id = $2", [amt, poId]);
    await client.query(
      "INSERT INTO supplier_payments (supplier_id, po_id, amount, method, note, user_id) VALUES ($1,$2,$3,$4,$5,$6)",
      [p.supplier_id, poId, amt, method, note || null, req.user.id]
    );
    await client.query("COMMIT");
    logAudit(req, "supplier_payment", "purchase_order", poId, { amount: amt, method });
    res.json({ success: true, paid: Number(p.amount_paid) + amt, outstanding: outstanding - amt });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
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
    logAudit(req, "po_cancel", "purchase_order", rows[0].id, null);
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
