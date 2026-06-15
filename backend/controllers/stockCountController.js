const pool = require("../config/db");
const { effectiveBranch } = require("../lib/context");
const { logAudit } = require("../lib/audit");

// Post a physical count: reconcile system stock to counted figures.
// Body: { note?, items: [{ product_id, counted_qty }] }. Rows with a blank
// counted_qty are skipped (not counted). Shortages deduct FEFO; surpluses land
// on the newest batch. Every non-zero variance writes a correction adjustment.
exports.create = async (req, res) => {
  const branchId = effectiveBranch(req);
  const { items, note } = req.body || {};
  if (!branchId) return res.status(400).json({ message: "Pick a single branch to count (not 'All branches')" });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: "Enter at least one counted product" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const head = await client.query(
      "INSERT INTO stock_counts (branch_id, user_id, note) VALUES ($1,$2,$3) RETURNING id",
      [branchId, req.user.id, note || null]
    );
    const cid = head.rows[0].id;
    let counted = 0;
    let varianceValue = 0;

    for (const it of items) {
      const productId = Number(it.product_id);
      const cq = Number(it.counted_qty);
      if (!productId || it.counted_qty === "" || it.counted_qty == null || Number.isNaN(cq) || cq < 0) continue;

      const batches = await client.query(
        `SELECT * FROM product_batches WHERE product_id = $1 AND branch_id = $2
         ORDER BY expiry_date NULLS LAST, id FOR UPDATE`,
        [productId, branchId]
      );
      const sys = batches.rows.reduce((s, b) => s + b.quantity, 0);
      const variance = cq - sys;
      const pinfo = await client.query("SELECT name FROM products WHERE id = $1", [productId]);
      const pname = pinfo.rows[0]?.name;
      const unitCost = batches.rows[0] ? Number(batches.rows[0].cost_price) || 0 : 0;

      if (variance < 0) {
        let need = -variance;
        for (const b of batches.rows) {
          if (need <= 0) break;
          const take = Math.min(need, b.quantity);
          if (take > 0) {
            await client.query("UPDATE product_batches SET quantity = quantity - $1 WHERE id = $2", [take, b.id]);
            need -= take;
          }
        }
      } else if (variance > 0) {
        const newest = batches.rows[batches.rows.length - 1];
        if (newest) {
          await client.query("UPDATE product_batches SET quantity = quantity + $1 WHERE id = $2", [variance, newest.id]);
        } else {
          await client.query(
            "INSERT INTO product_batches (product_id, branch_id, quantity, cost_price, selling_price) VALUES ($1,$2,$3,0,0)",
            [productId, branchId, variance]
          );
        }
      }

      if (variance !== 0) {
        varianceValue += variance * unitCost;
        await client.query(
          `INSERT INTO stock_adjustments (batch_id, product_id, branch_id, user_id, reason, qty_change, note)
           VALUES ($1,$2,$3,$4,'correction',$5,$6)`,
          [batches.rows[0]?.id || null, productId, branchId, req.user.id, variance, `Stock-take #${cid}`]
        );
      }

      await client.query(
        "INSERT INTO stock_count_items (count_id, product_id, name, system_qty, counted_qty, variance) VALUES ($1,$2,$3,$4,$5,$6)",
        [cid, productId, pname, sys, cq, variance]
      );
      counted++;
    }

    if (!counted) throw new Error("Nothing counted — enter a quantity for at least one product");
    const vv = Math.round(varianceValue * 100) / 100;
    await client.query("UPDATE stock_counts SET items_counted = $1, variance_value = $2 WHERE id = $3", [counted, vv, cid]);
    await client.query("COMMIT");
    logAudit(req, "stock_count", "stock_count", cid, { items: counted, variance_value: vv });
    res.status(201).json({ id: cid, items_counted: counted, variance_value: vv });
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
      `SELECT c.id, c.note, c.items_counted, c.variance_value, c.created_at,
              u.full_name AS counted_by, b.name AS branch,
              (SELECT COUNT(*) FROM stock_count_items i WHERE i.count_id = c.id AND i.variance <> 0)::int AS discrepancies
       FROM stock_counts c
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN branches b ON c.branch_id = b.id
       WHERE ($1::int IS NULL OR c.branch_id = $1)
       ORDER BY c.created_at DESC LIMIT 100`,
      [branchId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.get = async (req, res) => {
  try {
    const head = await pool.query(
      `SELECT c.*, u.full_name AS counted_by, b.name AS branch
       FROM stock_counts c LEFT JOIN users u ON c.user_id = u.id LEFT JOIN branches b ON c.branch_id = b.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (!head.rows[0]) return res.status(404).json({ message: "Count not found" });
    const items = await pool.query(
      "SELECT * FROM stock_count_items WHERE count_id = $1 ORDER BY (variance <> 0) DESC, name",
      [req.params.id]
    );
    res.json({ ...head.rows[0], items: items.rows });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
