const pool = require("../config/db");
const { effectiveBranch } = require("../lib/context");
const { logAudit } = require("../lib/audit");
const { expiryProblem } = require("../lib/receiving");
const { moveKind, moveRef } = require("../lib/stockMoves");

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
       , on_order AS (
         -- Still to come on open orders, so a suggestion doesn't order it twice.
         SELECT i.product_id, SUM(GREATEST(i.qty_ordered - COALESCE(i.qty_received, 0), 0))::int AS units
         FROM purchase_order_items i JOIN purchase_orders po ON po.id = i.po_id
         WHERE po.status IN ('draft', 'ordered', 'partial') AND ($1::int IS NULL OR po.branch_id = $1)
         GROUP BY i.product_id
       )
       SELECT p.id, p.name, p.unit, p.reorder_level, COALESCE(oo.units, 0)::int AS on_order,
              COALESCE(SUM(b.quantity) FILTER (WHERE b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE), 0)::int AS stock,
              COALESCE(so.units, 0)::numeric AS sold_window
       FROM products p
       LEFT JOIN product_batches b ON b.product_id = p.id AND ($1::int IS NULL OR b.branch_id = $1)
       LEFT JOIN sold so ON so.product_id = p.id
       LEFT JOIN on_order oo ON oo.product_id = p.id
       WHERE p.is_active = true
       GROUP BY p.id, so.units, oo.units`,
      [branchId, String(windowDays)]
    );

    const out = rows
      .map((r) => {
        const rate = Math.round((Number(r.sold_window) / windowDays) * 100) / 100; // units/day
        const daysLeft = rate > 0 ? Math.round((r.stock / rate) * 10) / 10 : null;
        // What will be on the shelf once open orders arrive.
        const coming = r.stock + r.on_order;
        let suggested = Math.max(0, Math.ceil(rate * cover) - coming);
        if (coming <= r.reorder_level) suggested = Math.max(suggested, r.reorder_level * 2 - coming, 1);
        return { id: r.id, name: r.name, unit: r.unit, reorder_level: r.reorder_level, stock: r.stock, on_order: r.on_order,
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
  // An order starts as a draft or as ordered. It used to accept any status, and
  // one created as "received" could be paid without any stock ever arriving.
  if (!["draft", "ordered"].includes(status))
    return res.status(400).json({ message: "A new order is a draft or ordered" });

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

    // Deliveries can come in parts. Each receipt adds to what each line has
    // received so far; the order is "partial" until every line is complete.
    // What the supplier is owed is the cost of what arrived (received_value),
    // not the cost of what was ordered.
    const sup = po.supplier_id ? (await client.query("SELECT name FROM suppliers WHERE id = $1", [po.supplier_id])).rows[0] : null;
    await moveKind(client, { kind: "received", user_id: req.user.id, ref_type: "purchase_order", ref_id: poId,
      ref_no: po.po_number, party: sup?.name || null });
    const items = await client.query("SELECT i.*, p.name AS product_name FROM purchase_order_items i JOIN products p ON p.id = i.product_id WHERE i.po_id = $1 ORDER BY i.id FOR UPDATE OF i", [poId]);
    let received = 0;
    let value = 0;

    for (const it of items.rows) {
      const o = byId.get(it.id) || {};
      const remaining = it.qty_ordered - (it.qty_received || 0);
      const qty = o.qty_received != null && o.qty_received !== "" ? Number(o.qty_received) : remaining;
      if (!qty || qty <= 0) continue;
      if (!Number.isInteger(qty)) throw new Error(`Receive whole units of ${it.product_name}`);
      if (qty > remaining) throw new Error(`Only ${remaining} of ${it.product_name} are still to come on this order`);
      const cost = o.cost_price != null ? Number(o.cost_price) : Number(it.cost_price);
      const sell = o.selling_price != null ? Number(o.selling_price) : Number(it.selling_price);
      const batchNo = o.batch_no ?? it.batch_no;
      const expiry = o.expiry_date ?? it.expiry_date;
      const bad = await expiryProblem(expiry, it.product_name);
      if (bad) throw new Error(bad);

      await client.query(
        `INSERT INTO product_batches
           (product_id, branch_id, supplier_id, batch_no, expiry_date, quantity, cost_price, selling_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [it.product_id, po.branch_id, po.supplier_id, batchNo || null, expiry || null, qty, cost, sell]
      );
      await client.query("UPDATE purchase_order_items SET qty_received = COALESCE(qty_received, 0) + $1 WHERE id = $2", [qty, it.id]);
      received += qty;
      value += qty * cost;
    }

    if (received === 0) throw new Error("Nothing to receive");

    const open = await client.query(
      "SELECT COUNT(*)::int AS n FROM purchase_order_items WHERE po_id = $1 AND COALESCE(qty_received, 0) < qty_ordered", [poId]);
    const status = open.rows[0].n > 0 ? "partial" : "received";
    await client.query(
      "UPDATE purchase_orders SET status = $2, received_at = NOW(), received_value = received_value + $3 WHERE id = $1",
      [poId, status, Math.round(value * 100) / 100]
    );
    await client.query("COMMIT");
    logAudit(req, "po_receive", "purchase_order", poId, { units: received, value: Math.round(value * 100) / 100, status });
    res.json({ id: poId, status, units_received: received });
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
      `SELECT po.id, po.po_number, po.received_value AS total_cost, po.total_cost AS ordered_cost, po.status, po.amount_paid,
              (po.received_value - po.amount_paid)::float AS outstanding,
              po.received_at, s.id AS supplier_id, s.name AS supplier_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.status IN ('partial', 'received') AND (po.received_value - po.amount_paid) > 0.005
         AND ($1::int IS NULL OR po.branch_id = $1)
       ORDER BY po.received_at`,
      [branchId]
    );
    const bySupplier = {};
    rows.forEach((r) => {
      const k = r.supplier_name || "—";
      bySupplier[k] = (bySupplier[k] || 0) + Number(r.outstanding);
    });
    // Net return-to-vendor credit notes against what we owe each supplier.
    const credits = await pool.query(
      `SELECT s.name, COALESCE(SUM(r.total_credit),0)::float AS credit
       FROM stock_returns_vendor r LEFT JOIN suppliers s ON r.supplier_id = s.id
       WHERE ($1::int IS NULL OR r.branch_id = $1)
       GROUP BY s.name`,
      [branchId]
    );
    credits.rows.forEach((c) => {
      const k = c.name || "—";
      if (bySupplier[k] !== undefined) bySupplier[k] = Math.max(0, bySupplier[k] - Number(c.credit));
    });
    const totalCredit = credits.rows.reduce((s, c) => s + Number(c.credit), 0);
    res.json({
      payables: rows,
      total_owed: Math.max(0, rows.reduce((s, r) => s + Number(r.outstanding), 0) - totalCredit),
      rtv_credit: Math.round(totalCredit * 100) / 100,
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
    if (!["partial", "received"].includes(p.status)) throw new Error("Only orders that have arrived can be paid");
    const outstanding = Number(p.received_value) - Number(p.amount_paid);
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
    // A part-delivered order is closed with what arrived (it stays payable for
    // that); one where nothing arrived is cancelled.
    const { rows } = await pool.query(
      `UPDATE purchase_orders SET status = CASE WHEN status = 'partial' THEN 'received' ELSE 'cancelled' END
       WHERE id = $1 AND status NOT IN ('received', 'cancelled') RETURNING id, status`,
      [req.params.id]
    );
    if (!rows.length) return res.status(400).json({ message: "Cannot cancel this order" });
    logAudit(req, "po_cancel", "purchase_order", rows[0].id, null);
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
