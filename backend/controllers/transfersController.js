const pool = require("../config/db");
const { effectiveBranch, CROSS_BRANCH_ROLES } = require("../lib/context");
const { logAudit } = require("../lib/audit");

// Move stock between branches: FEFO-deduct at source, recreate batches at dest.
exports.create = async (req, res) => {
  const { from_branch_id, to_branch_id, items, note } = req.body || {};

  // The SOURCE is where stock leaves from, and it arrived in the request body —
  // which meant anyone who could transfer could empty a branch they have
  // nothing to do with. effectiveBranch pins the lens for ordinary staff, and
  // this path went round it by reading the body first.
  //
  // Sending stock TO another branch is fine for anyone: it is the branch you are
  // taking it OUT of that has to be yours.
  const mayCross = CROSS_BRANCH_ROLES.includes(req.user?.role);
  const requestedFrom = Number(from_branch_id) || effectiveBranch(req);
  if (!mayCross && requestedFrom && req.user?.branch_id && requestedFrom !== req.user.branch_id) {
    return res.status(403).json({ message: "You can only transfer stock out of your own branch" });
  }

  const fromBranch = mayCross ? requestedFrom : (req.user?.branch_id || requestedFrom);
  const toBranch = Number(to_branch_id);
  if (!fromBranch) return res.status(400).json({ message: "No source branch — pick a branch to transfer from" });
  if (!toBranch) return res.status(400).json({ message: "Choose a destination branch" });
  if (fromBranch === toBranch) return res.status(400).json({ message: "Source and destination must differ" });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: "Add at least one product" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tr = await client.query(
      "INSERT INTO stock_transfers (from_branch_id, to_branch_id, user_id, note) VALUES ($1,$2,$3,$4) RETURNING id",
      [fromBranch, toBranch, req.user.id, note || null]
    );
    const trId = tr.rows[0].id;
    const reference = `TR-${String(trId).padStart(5, "0")}`;
    await client.query("UPDATE stock_transfers SET reference = $1 WHERE id = $2", [reference, trId]);

    for (const it of items) {
      const productId = Number(it.product_id);
      let need = Number(it.qty);
      if (!productId || !need || need <= 0) continue;
      const pinfo = await client.query("SELECT name FROM products WHERE id = $1", [productId]);
      const pname = pinfo.rows[0]?.name;

      const batches = await client.query(
        `SELECT * FROM product_batches WHERE product_id = $1 AND branch_id = $2 AND quantity > 0
         ORDER BY expiry_date NULLS LAST, id FOR UPDATE`,
        [productId, fromBranch]
      );
      const avail = batches.rows.reduce((s, b) => s + b.quantity, 0);
      if (avail < need) throw new Error(`Insufficient stock for ${pname} (have ${avail}, need ${need})`);

      let moved = 0;
      for (const b of batches.rows) {
        if (need <= 0) break;
        const take = Math.min(need, b.quantity);
        await client.query("UPDATE product_batches SET quantity = quantity - $1 WHERE id = $2", [take, b.id]);
        await client.query(
          `INSERT INTO product_batches (product_id, branch_id, supplier_id, batch_no, expiry_date, quantity, cost_price, selling_price)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [productId, toBranch, b.supplier_id, b.batch_no, b.expiry_date, take, b.cost_price, b.selling_price]
        );
        moved += take; need -= take;
      }
      await client.query("INSERT INTO stock_transfer_items (transfer_id, product_id, name, qty) VALUES ($1,$2,$3,$4)", [trId, productId, pname, moved]);
    }

    await client.query("COMMIT");
    logAudit(req, "stock_transfer", "transfer", trId, { from: fromBranch, to: toBranch, items: items.length });
    res.status(201).json({ id: trId, reference });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(400).json({ message: e.message });
  } finally {
    client.release();
  }
};

exports.list = async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.reference, t.note, t.created_at, u.full_name AS moved_by,
              fb.name AS from_branch, tb.name AS to_branch,
              (SELECT COUNT(*) FROM stock_transfer_items i WHERE i.transfer_id = t.id)::int AS line_count,
              (SELECT COALESCE(SUM(qty),0) FROM stock_transfer_items i WHERE i.transfer_id = t.id)::int AS units
       FROM stock_transfers t
       LEFT JOIN users u ON t.user_id = u.id
       LEFT JOIN branches fb ON t.from_branch_id = fb.id
       LEFT JOIN branches tb ON t.to_branch_id = tb.id
       ORDER BY t.created_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
