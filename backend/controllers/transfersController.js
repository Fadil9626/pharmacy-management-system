const pool = require("../config/db");
const { effectiveBranch, canSeeBranch, CROSS_BRANCH_ROLES } = require("../lib/context");
const { logAudit } = require("../lib/audit");
const { moveKind } = require("../lib/stockMoves");

/**
 * Move stock between branches.
 *
 * The stock leaves the sending branch at once (FEFO, never expired). It then
 * travels: the transfer is IN TRANSIT until someone at the receiving branch
 * confirms it arrived (receive), or the sender cancels it, which puts it back.
 * With settings.transfers_need_receiving off, it lands at once, as it used to.
 */
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
    const names = Object.fromEntries((await client.query(
      "SELECT id, name FROM branches WHERE id = ANY($1) AND is_active", [[fromBranch, toBranch]])).rows.map((b) => [b.id, b.name]));
    if (!names[toBranch]) throw new Error("That destination branch doesn't exist");
    const travels = (await client.query("SELECT transfers_need_receiving FROM settings WHERE id = 1")).rows[0]?.transfers_need_receiving !== false;

    const tr = await client.query(
      "INSERT INTO stock_transfers (from_branch_id, to_branch_id, user_id, note, status) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [fromBranch, toBranch, req.user.id, note || null, travels ? "in_transit" : "received"]
    );
    const trId = tr.rows[0].id;
    const reference = `TR-${String(trId).padStart(5, "0")}`;
    await client.query("UPDATE stock_transfers SET reference = $1 WHERE id = $2", [reference, trId]);
    const out = { kind: "transfer_out", user_id: req.user.id, ref_type: "transfer", ref_id: trId, ref_no: reference, party: names[toBranch] };

    let lines = 0;
    for (const it of items) {
      const productId = Number(it.product_id);
      let need = Number(it.qty);
      if (!productId || !need || need <= 0) continue;
      if (!Number.isInteger(need)) throw new Error("Transfer whole units");
      const pname = (await client.query("SELECT name FROM products WHERE id = $1", [productId])).rows[0]?.name;

      const batches = await client.query(
        `SELECT * FROM product_batches WHERE product_id = $1 AND branch_id = $2 AND quantity > 0
           AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
         ORDER BY expiry_date NULLS LAST, id FOR UPDATE`,
        [productId, fromBranch]
      );
      const avail = batches.rows.reduce((s, b) => s + b.quantity, 0);
      if (avail < need) throw new Error(`Insufficient stock for ${pname} (have ${avail}, need ${need})`);

      let moved = 0;
      for (const b of batches.rows) {
        if (need <= 0) break;
        const take = Math.min(need, b.quantity);
        await moveKind(client, out);
        await client.query("UPDATE product_batches SET quantity = quantity - $1 WHERE id = $2", [take, b.id]);
        await client.query(
          `INSERT INTO stock_transfer_batches (transfer_id, source_batch_id, product_id, supplier_id, batch_no, expiry_date, qty, cost_price, selling_price)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [trId, b.id, productId, b.supplier_id, b.batch_no, b.expiry_date, take, b.cost_price, b.selling_price]
        );
        moved += take; need -= take;
      }
      await client.query("INSERT INTO stock_transfer_items (transfer_id, product_id, name, qty) VALUES ($1,$2,$3,$4)", [trId, productId, pname, moved]);
      lines++;
    }
    if (!lines) throw new Error("Add at least one product");

    if (!travels) await landAt(client, req, trId, reference, toBranch, names[fromBranch]);

    await client.query("COMMIT");
    logAudit(req, "stock_transfer", "transfer", trId, { from: fromBranch, to: toBranch, items: items.length, in_transit: travels });
    res.status(201).json({ id: trId, reference, status: travels ? "in_transit" : "received" });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(400).json({ message: e.message });
  } finally {
    client.release();
  }
};

// Put a transfer's batches on the receiving branch's shelf.
async function landAt(client, req, trId, reference, toBranch, fromName) {
  await moveKind(client, { kind: "transfer_in", user_id: req.user.id, ref_type: "transfer", ref_id: trId, ref_no: reference, party: fromName || null });
  const { rows } = await client.query("SELECT * FROM stock_transfer_batches WHERE transfer_id = $1 ORDER BY id", [trId]);
  for (const b of rows) {
    await client.query(
      `INSERT INTO product_batches (product_id, branch_id, supplier_id, batch_no, expiry_date, quantity, cost_price, selling_price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [b.product_id, toBranch, b.supplier_id, b.batch_no, b.expiry_date, b.qty, b.cost_price, b.selling_price]
    );
  }
  await client.query(
    "UPDATE stock_transfers SET status = 'received', received_by = $2, received_at = NOW() WHERE id = $1", [trId, req.user.id]);
}

// Lock an in-transit transfer for receiving or cancelling.
async function openTransfer(client, id) {
  const t = (await client.query(
    `SELECT t.*, fb.name AS from_name, tb.name AS to_name FROM stock_transfers t
       LEFT JOIN branches fb ON fb.id = t.from_branch_id LEFT JOIN branches tb ON tb.id = t.to_branch_id
      WHERE t.id = $1 FOR UPDATE OF t`, [id])).rows[0];
  if (!t) throw Object.assign(new Error("Transfer not found"), { status: 404 });
  if (t.status !== "in_transit") throw new Error(`This transfer is already ${t.status === "received" ? "received" : "cancelled"}`);
  return t;
}

// The receiving branch confirms the stock arrived.
exports.receive = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = await openTransfer(client, Number(req.params.id));
    if (!canSeeBranch(req, t.to_branch_id)) throw Object.assign(new Error("Transfer not found"), { status: 404 });
    await landAt(client, req, t.id, t.reference, t.to_branch_id, t.from_name);
    if (req.body?.note) await client.query("UPDATE stock_transfers SET closed_note = $1 WHERE id = $2", [String(req.body.note), t.id]);
    await client.query("COMMIT");
    logAudit(req, "transfer_receive", "transfer", t.id, { reference: t.reference });
    res.json({ id: t.id, status: "received" });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(e.status || 400).json({ message: e.message });
  } finally {
    client.release();
  }
};

// The sending branch calls it back: the stock goes back on its own shelf.
exports.cancel = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = await openTransfer(client, Number(req.params.id));
    if (!canSeeBranch(req, t.from_branch_id)) throw Object.assign(new Error("Transfer not found"), { status: 404 });
    await moveKind(client, { kind: "transfer_cancelled", user_id: req.user.id, ref_type: "transfer", ref_id: t.id, ref_no: t.reference, party: t.to_name });
    const { rows } = await client.query("SELECT * FROM stock_transfer_batches WHERE transfer_id = $1 ORDER BY id", [t.id]);
    for (const b of rows) {
      // Back into the batch it came from; if that batch is gone, as a batch again.
      const back = b.source_batch_id
        ? await client.query("UPDATE product_batches SET quantity = quantity + $1 WHERE id = $2 AND branch_id = $3", [b.qty, b.source_batch_id, t.from_branch_id])
        : { rowCount: 0 };
      if (!back.rowCount) {
        await client.query(
          `INSERT INTO product_batches (product_id, branch_id, supplier_id, batch_no, expiry_date, quantity, cost_price, selling_price)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [b.product_id, t.from_branch_id, b.supplier_id, b.batch_no, b.expiry_date, b.qty, b.cost_price, b.selling_price]
        );
      }
    }
    await client.query("UPDATE stock_transfers SET status = 'cancelled', closed_note = $2 WHERE id = $1", [t.id, req.body?.note || null]);
    await client.query("COMMIT");
    logAudit(req, "transfer_cancel", "transfer", t.id, { reference: t.reference });
    res.json({ id: t.id, status: "cancelled" });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(e.status || 400).json({ message: e.message });
  } finally {
    client.release();
  }
};

exports.list = async (req, res) => {
  // Transfers in or out of the branch being looked at. ?incoming=1: only those
  // on their way to it, waiting to be received.
  const branchId = effectiveBranch(req);
  const incoming = req.query.incoming === "1";
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.reference, t.note, t.status, t.created_at, t.received_at, t.from_branch_id, t.to_branch_id,
              u.full_name AS moved_by, ru.full_name AS received_by,
              fb.name AS from_branch, tb.name AS to_branch,
              (SELECT COUNT(*) FROM stock_transfer_items i WHERE i.transfer_id = t.id)::int AS line_count,
              (SELECT COALESCE(SUM(qty),0) FROM stock_transfer_items i WHERE i.transfer_id = t.id)::int AS units,
              (SELECT json_agg(json_build_object('name', i.name, 'qty', i.qty) ORDER BY i.id) FROM stock_transfer_items i WHERE i.transfer_id = t.id) AS items
       FROM stock_transfers t
       LEFT JOIN users u ON t.user_id = u.id
       LEFT JOIN users ru ON t.received_by = ru.id
       LEFT JOIN branches fb ON t.from_branch_id = fb.id
       LEFT JOIN branches tb ON t.to_branch_id = tb.id
       WHERE ${incoming
         ? "t.status = 'in_transit' AND ($1::int IS NULL OR t.to_branch_id = $1)"
         : "($1::int IS NULL OR t.from_branch_id = $1 OR t.to_branch_id = $1)"}
       ORDER BY t.created_at DESC LIMIT 100`, [branchId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
