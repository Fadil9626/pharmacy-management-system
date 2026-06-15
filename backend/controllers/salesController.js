const pool = require("../config/db");
const { pricingContext, effectivePrice } = require("../lib/pricing");
const { effectiveBranch, moduleOn } = require("../lib/context");
const { userCan } = require("../lib/permissions");
const { openShiftId } = require("./financeController");

const branchOf = effectiveBranch;

// Sellable catalogue for the till — independent of the inventory module so POS
// can run on its own. Returns current stock + the effective (live) price per
// product: market-derived in market mode, FEFO selling price otherwise.
exports.sellableProducts = async (req, res) => {
  const branchId = branchOf(req);
  try {
    const ctx = await pricingContext();
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.generic_name, p.category, p.strength,
              p.dosage_form, p.unit, p.barcode, p.is_controlled, p.base_price,
              COALESCE(s.qty, 0)::int   AS stock,
              COALESCE(s.price, 0)::float AS price,
              s.nearest_expiry
       FROM products p
       LEFT JOIN LATERAL (
         SELECT SUM(quantity) AS qty,
                MIN(expiry_date) FILTER (WHERE quantity > 0) AS nearest_expiry,
                (ARRAY_AGG(selling_price ORDER BY expiry_date NULLS LAST, id)
                   FILTER (WHERE quantity > 0))[1] AS price
         FROM product_batches b
         WHERE b.product_id = p.id AND ($1::int IS NULL OR b.branch_id = $1)
           -- expired stock is never sellable
           AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE)
       ) s ON true
       WHERE p.is_active = true
       ORDER BY p.name`,
      [branchId]
    );
    res.json(rows.map((p) => ({
      ...p,
      price: effectivePrice(ctx, p.base_price, p.price),
    })));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Ring up a sale: deduct stock FEFO across batches inside one locked transaction.
exports.createSale = async (req, res) => {
  const branchId = effectiveBranch(req);
  const { items, discount = 0, payment_method = "cash", customer_name, customer_id,
          amount_paid, prescriber_name, prescriber_license } = req.body || {};
  if (!branchId) return res.status(400).json({ message: "No branch on this account" });
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ message: "Cart is empty" });

  // Open-till discipline: when Finance is licensed, a cashier must open their
  // till (with a cash float) before any sale can be rung up.
  if (await moduleOn("finance")) {
    const sid = await openShiftId(req.user.id);
    if (!sid) return res.status(400).json({ message: "Open your till before selling.", code: "NO_SHIFT" });
  }
  const controlledGate = await moduleOn("controlled_drugs");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const cfg = await client.query("SELECT tax_percent, loyalty_points_per_unit FROM settings WHERE id = 1");
    const taxPct = Number(cfg.rows[0]?.tax_percent || 0);
    const loyaltyRate = Number(cfg.rows[0]?.loyalty_points_per_unit ?? 1);

    // Live pricing context (mode + current market rate) read inside the txn.
    const ctx = await pricingContext(client);

    let subtotal = 0;
    let hasControlled = false;
    const lines = [];

    for (const it of items) {
      const productId = Number(it.product_id);
      let need = Number(it.qty);
      if (!productId || !need || need <= 0) throw new Error("Invalid cart line");

      const pinfo = await client.query("SELECT name, base_price, is_controlled FROM products WHERE id = $1", [productId]);
      if (!pinfo.rows.length) throw new Error("Product not found");
      const pname = pinfo.rows[0].name;
      if (pinfo.rows[0].is_controlled) hasControlled = true;

      // In market mode the unit price is derived from the base-currency anchor ×
      // the live rate (uniform for the product); otherwise we charge each batch's
      // own recorded selling price. Price is always computed server-side.
      const marketUnit = ctx.marketActive && Number(pinfo.rows[0].base_price) > 0
        ? effectivePrice(ctx, pinfo.rows[0].base_price, 0)
        : null;

      // Lock this product's batches in FEFO order so concurrent tills can't oversell.
      // Expired batches are excluded — they can never be dispensed.
      const batches = await client.query(
        `SELECT id, quantity, selling_price
         FROM product_batches
         WHERE product_id = $1 AND branch_id = $2 AND quantity > 0
           AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
         ORDER BY expiry_date NULLS LAST, id
         FOR UPDATE`,
        [productId, branchId]
      );
      const available = batches.rows.reduce((s, b) => s + b.quantity, 0);
      if (available < need)
        throw new Error(`Insufficient stock for ${pname} (have ${available}, need ${need})`);

      for (const b of batches.rows) {
        if (need <= 0) break;
        const take = Math.min(need, b.quantity);
        const unitPrice = marketUnit != null ? marketUnit : Number(b.selling_price);
        const lineTotal = Math.round(take * unitPrice * 100) / 100;
        subtotal += lineTotal;
        await client.query("UPDATE product_batches SET quantity = quantity - $1 WHERE id = $2", [take, b.id]);
        lines.push({ product_id: productId, batch_id: b.id, name: pname, qty: take, unit_price: unitPrice, line_total: lineTotal });
        need -= take;
      }
    }

    const disc = Math.max(0, Number(discount) || 0);
    if (disc > 0 && !(await userCan(req.user.role, "pos.discount")))
      throw new Error("You don't have permission to apply discounts");
    if (payment_method === "account" && !(await userCan(req.user.role, "pos.account")))
      throw new Error("You don't have permission to sell on account");
    const taxable = Math.max(0, subtotal - disc);
    const tax = Math.round(taxable * (taxPct / 100) * 100) / 100;
    const total = taxable + tax;

    // Cash sales must be tendered in full when an amount is entered.
    const paidIn = amount_paid != null && amount_paid !== "" ? Number(amount_paid) : null;
    if (payment_method === "cash" && paidIn != null && paidIn < total - 1e-9) {
      throw new Error(`Amount tendered (${paidIn}) is less than the total (${total.toFixed(2)})`);
    }

    // On-account (credit) sales: lock the customer, enforce the credit limit.
    let custName = customer_name || null;
    if (customer_id) {
      const cust = await client.query("SELECT * FROM customers WHERE id = $1 FOR UPDATE", [customer_id]);
      if (!cust.rows.length) throw new Error("Customer not found");
      const c = cust.rows[0];
      custName = c.name;
      if (payment_method === "account") {
        const newBal = Number(c.balance) + total;
        if (Number(c.credit_limit) > 0 && newBal > Number(c.credit_limit) + 1e-9) {
          throw new Error(`Exceeds credit limit — owed ${newBal.toFixed(2)} of ${Number(c.credit_limit).toFixed(2)}`);
        }
      }
    } else if (payment_method === "account") {
      throw new Error("Account sales require a registered customer");
    }

    // Controlled-drug compliance: no scheduled item leaves the counter without
    // a customer and the prescribing doctor's license number on record.
    if (hasControlled && controlledGate) {
      if (!prescriber_license || !String(prescriber_license).trim())
        throw new Error("Controlled items require the prescriber's license number");
      if (!customer_id && !(custName && custName.trim()))
        throw new Error("Controlled items require a customer on the sale");
    }

    // Stamp FX provenance on the ledger row (amounts stay in ledger currency).
    const fxRate = ctx.marketActive ? ctx.rate : null;
    const fxBase = ctx.marketActive ? ctx.base : null;
    const shiftId = await openShiftId(req.user.id, client); // tag to the cashier's open till
    const sale = await client.query(
      `INSERT INTO sales (branch_id, user_id, customer_id, customer_name, subtotal, discount, tax, total, payment_method, fx_rate, fx_base, pricing_mode, shift_id, prescriber_name, prescriber_license)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id, created_at`,
      [branchId, req.user.id, customer_id || null, custName, subtotal, disc, tax, total, payment_method, fxRate, fxBase, ctx.mode, shiftId, prescriber_name || null, prescriber_license || null]
    );
    const saleId = sale.rows[0].id;
    const receiptNo = `R-${String(saleId).padStart(5, "0")}`;
    await client.query("UPDATE sales SET receipt_no = $1 WHERE id = $2", [receiptNo, saleId]);

    for (const l of lines) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, batch_id, name, qty, unit_price, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [saleId, l.product_id, l.batch_id, l.name, l.qty, l.unit_price, l.line_total]
      );
    }

    // Accrue customer stats — on-account adds to balance; all linked sales build
    // spend, visits and loyalty points.
    if (customer_id) {
      const points = Math.floor(total * loyaltyRate);
      const addBal = payment_method === "account" ? total : 0;
      await client.query(
        `UPDATE customers SET
           balance = balance + $1,
           total_spent = total_spent + $2,
           visit_count = visit_count + 1,
           loyalty_points = loyalty_points + $3
         WHERE id = $4`,
        [addBal, total, points, customer_id]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      id: saleId,
      receipt_no: receiptNo,
      subtotal,
      discount: disc,
      tax,
      total,
      payment_method,
      customer_name: custName,
      amount_paid: paidIn,
      change: paidIn != null ? Math.max(0, paidIn - total) : null,
      fx_rate: fxRate,
      fx_base: fxBase,
      created_at: sale.rows[0].created_at,
      items: lines,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ message: e.message });
  } finally {
    client.release();
  }
};

exports.listSales = async (req, res) => {
  const branchId = branchOf(req);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.receipt_no, s.customer_name, s.subtotal, s.discount, s.tax, s.total,
              s.payment_method, s.created_at, u.full_name AS cashier,
              (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id)::int AS item_count
       FROM sales s
       LEFT JOIN users u ON s.user_id = u.id
       WHERE ($1::int IS NULL OR s.branch_id = $1)
       ORDER BY s.created_at DESC
       LIMIT $2`,
      [branchId, limit]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getSale = async (req, res) => {
  try {
    const sale = await pool.query(
      `SELECT s.*, u.full_name AS cashier, b.name AS branch_name
       FROM sales s LEFT JOIN users u ON s.user_id = u.id
       LEFT JOIN branches b ON s.branch_id = b.id WHERE s.id = $1`,
      [req.params.id]
    );
    if (!sale.rows.length) return res.status(404).json({ message: "Sale not found" });
    // include how much of each line has already been returned
    const items = await pool.query(
      `SELECT si.*, COALESCE(r.returned, 0)::int AS returned_qty
       FROM sale_items si
       LEFT JOIN (SELECT sale_item_id, SUM(qty) returned FROM sale_return_items GROUP BY sale_item_id) r
         ON r.sale_item_id = si.id
       WHERE si.sale_id = $1 ORDER BY si.id`,
      [req.params.id]
    );
    const returns = await pool.query(
      "SELECT id, receipt_no, total, refund_method, created_at FROM sale_returns WHERE sale_id = $1 ORDER BY created_at",
      [req.params.id]
    );
    res.json({ ...sale.rows[0], items: items.rows, returns: returns.rows });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Process a return/refund against a sale (full or partial).
exports.createReturn = async (req, res) => {
  const saleId = Number(req.params.id);
  const { items, reason, refund_method = "cash", restock = true } = req.body || {};
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ message: "Select at least one item to return" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const saleRes = await client.query("SELECT * FROM sales WHERE id = $1 FOR UPDATE", [saleId]);
    if (!saleRes.rows.length) throw new Error("Sale not found");
    const sale = saleRes.rows[0];

    if (await moduleOn("finance", client)) {
      const sid = await openShiftId(req.user.id, client);
      if (!sid) throw new Error("Open your till before processing a refund");
    }

    const lineRows = await client.query(
      `SELECT si.*, COALESCE(r.returned, 0)::int AS returned
       FROM sale_items si
       LEFT JOIN (SELECT sale_item_id, SUM(qty) returned FROM sale_return_items GROUP BY sale_item_id) r
         ON r.sale_item_id = si.id
       WHERE si.sale_id = $1`,
      [saleId]
    );
    const byId = new Map(lineRows.rows.map((l) => [l.id, l]));

    let subtotal = 0;
    const retLines = [];
    for (const it of items) {
      const lineId = Number(it.sale_item_id);
      const qty = Number(it.qty);
      if (!lineId || !qty || qty <= 0) continue;
      const line = byId.get(lineId);
      if (!line) throw new Error("Invalid return line");
      const remaining = line.qty - line.returned;
      if (qty > remaining) throw new Error(`Only ${remaining} of "${line.name}" can still be returned`);
      const unit = Number(line.unit_price);
      const lineTotal = Math.round(qty * unit * 100) / 100;
      subtotal += lineTotal;
      retLines.push({ sale_item_id: lineId, product_id: line.product_id, batch_id: line.batch_id, name: line.name, qty, unit_price: unit, line_total: lineTotal });
    }
    if (retLines.length === 0) throw new Error("Nothing to return");

    // proportional discount + tax from the original sale
    const gross = Number(sale.subtotal) || subtotal;
    const propDiscount = gross > 0 ? Math.round((Number(sale.discount) * subtotal / gross) * 100) / 100 : 0;
    const propTax = gross > 0 ? Math.round((Number(sale.tax) * subtotal / gross) * 100) / 100 : 0;
    const total = Math.round((subtotal - propDiscount + propTax) * 100) / 100;

    const shiftId = await openShiftId(req.user.id, client);
    const ins = await client.query(
      `INSERT INTO sale_returns (sale_id, branch_id, user_id, customer_id, shift_id, reason, refund_method, subtotal, tax, total, restocked)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, created_at`,
      [saleId, sale.branch_id, req.user.id, sale.customer_id, shiftId, reason || null, refund_method, subtotal, propTax, total, !!restock]
    );
    const retId = ins.rows[0].id;
    const receiptNo = `RT-${String(retId).padStart(5, "0")}`;
    await client.query("UPDATE sale_returns SET receipt_no = $1 WHERE id = $2", [receiptNo, retId]);

    for (const l of retLines) {
      await client.query(
        `INSERT INTO sale_return_items (return_id, sale_item_id, product_id, batch_id, name, qty, unit_price, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [retId, l.sale_item_id, l.product_id, l.batch_id, l.name, l.qty, l.unit_price, l.line_total]
      );
      if (restock && l.batch_id) {
        await client.query("UPDATE product_batches SET quantity = quantity + $1 WHERE id = $2", [l.qty, l.batch_id]);
      }
    }

    if (sale.customer_id) {
      const reduceBal = refund_method === "account" ? total : 0;
      await client.query(
        `UPDATE customers SET
           balance = GREATEST(0, balance - $1),
           total_spent = GREATEST(0, total_spent - $2),
           loyalty_points = GREATEST(0, loyalty_points - $3)
         WHERE id = $4`,
        [reduceBal, total, Math.floor(total), sale.customer_id]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({
      id: retId, receipt_no: receiptNo, sale_receipt: sale.receipt_no,
      subtotal, tax: propTax, total, refund_method, restocked: !!restock,
      created_at: ins.rows[0].created_at, items: retLines,
    });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(400).json({ message: e.message });
  } finally {
    client.release();
  }
};

exports.listReturns = async (req, res) => {
  const branchId = branchOf(req);
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.receipt_no, r.total, r.refund_method, r.reason, r.restocked, r.created_at,
              s.receipt_no AS sale_receipt, u.full_name AS cashier
       FROM sale_returns r
       LEFT JOIN sales s ON r.sale_id = s.id
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
