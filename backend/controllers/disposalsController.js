const pool = require("../config/db");
const { logAudit } = require("../lib/audit");
const pdf = require("../lib/pdf");

// ── Writing off stock that must not be sold ─────────────────────────────────
//
// Expired stock could already be removed, one batch at a time, through the
// stock-adjust screen. What was missing was the document: twelve adjustments
// made over an afternoon are the same stock movement as one disposal and are
// not the same record, and the record is what an inspector asks for.
//
// Each line still writes its own stock_adjustments row, so everything already
// reading the stock ledger keeps working and nothing about stock history
// changes shape. The disposal header sits alongside it.

/** GET /api/disposals/eligible — batches that cannot be sold and are still on hand. */
exports.eligible = async (req, res) => {
  try {
    const reason = String(req.query.reason || "expired");
    // Only expiry can be detected from the data. Damage, loss and recalls are
    // things a person knows and the database does not, so those are chosen by
    // hand from the full list rather than pre-selected here.
    const where = reason === "expired"
      ? "b.quantity > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date < CURRENT_DATE"
      : "b.quantity > 0";

    const { rows } = await pool.query(
      `SELECT b.id AS batch_id, b.product_id, p.name AS product_name, p.is_controlled,
              b.batch_no, b.expiry_date, b.quantity,
              b.cost_price::float AS unit_cost,
              (b.quantity * b.cost_price)::float AS line_cost
         FROM product_batches b
         JOIN products p ON p.id = b.product_id
        WHERE ${where}
        ORDER BY b.expiry_date NULLS LAST, p.name
        LIMIT 500`
    );

    res.json({
      reason,
      rows,
      total_units: rows.reduce((s, r) => s + r.quantity, 0),
      total_cost: Math.round(rows.reduce((s, r) => s + r.line_cost, 0) * 100) / 100,
      controlled: rows.filter((r) => r.is_controlled).length,
    });
  } catch (e) {
    console.error("[disposals] eligible:", e.message);
    res.status(500).json({ message: "Could not list stock for disposal" });
  }
};

/** POST /api/disposals — write off the chosen batches as one documented event. */
exports.create = async (req, res) => {
  const { batch_ids, reason = "expired", method, witness_name, note } = req.body || {};
  const REASONS = ["expired", "damaged", "lost", "recall"];
  if (!Array.isArray(batch_ids) || !batch_ids.length)
    return res.status(400).json({ message: "Select at least one batch to dispose of" });
  if (!REASONS.includes(reason))
    return res.status(400).json({ message: "Invalid reason" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Locked before anything is read, so a till selling the last units of a
    // batch mid-disposal cannot leave the quantity negative.
    const { rows: batches } = await client.query(
      `SELECT b.*, p.name AS product_name, p.is_controlled
         FROM product_batches b JOIN products p ON p.id = b.product_id
        WHERE b.id = ANY($1::int[])
        FOR UPDATE OF b`,
      [batch_ids.map(Number)]
    );
    if (!batches.length) throw new Error("None of those batches exist");

    // A controlled drug destroyed without a named witness is a compliance
    // problem, not a paperwork preference — so it is refused rather than
    // recorded incomplete.
    if (batches.some((b) => b.is_controlled) && !String(witness_name || "").trim()) {
      throw new Error("A witness name is required when disposing of controlled drugs");
    }

    const d = await client.query(
      `INSERT INTO disposals (branch_id, user_id, reason, method, witness_name, note)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
      [req.user.branch_id || batches[0].branch_id, req.user.id, reason,
       method || null, String(witness_name || "").trim() || null, note || null]
    );
    const disposalId = d.rows[0].id;

    let units = 0, cost = 0;
    for (const b of batches) {
      if (b.quantity <= 0) continue;               // emptied between listing and now
      const qty = b.quantity;                      // whole batch — a part-expired batch is not a thing
      const unitCost = Number(b.cost_price) || 0;
      const lineCost = Math.round(qty * unitCost * 100) / 100;

      await client.query("UPDATE product_batches SET quantity = 0 WHERE id = $1", [b.id]);

      // The stock ledger still gets its row, exactly as a hand adjustment would.
      await client.query(
        `INSERT INTO stock_adjustments (batch_id, product_id, branch_id, user_id, reason, qty_change, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [b.id, b.product_id, b.branch_id, req.user.id, reason, -qty, `Disposal #${disposalId}`]
      );

      await client.query(
        `INSERT INTO disposal_items
           (disposal_id, batch_id, product_id, product_name, batch_no, expiry_date, qty, unit_cost, line_cost, is_controlled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [disposalId, b.id, b.product_id, b.product_name, b.batch_no, b.expiry_date,
         qty, unitCost, lineCost, b.is_controlled]
      );

      units += qty;
      cost = Math.round((cost + lineCost) * 100) / 100;
    }

    if (units === 0) throw new Error("Those batches are already empty — nothing to dispose of");

    const ref = `DSP-${String(disposalId).padStart(5, "0")}`;
    await client.query(
      "UPDATE disposals SET ref = $1, total_units = $2, total_cost = $3 WHERE id = $4",
      [ref, units, cost, disposalId]
    );

    await client.query("COMMIT");
    logAudit(req, "stock_disposal", "disposal", disposalId,
      { ref, reason, batches: batches.length, units, cost, witness: witness_name || null });

    res.status(201).json({ id: disposalId, ref, total_units: units, total_cost: cost });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(400).json({ message: e.message });
  } finally {
    client.release();
  }
};

/** GET /api/disposals — the register. */
exports.list = async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.ref, d.reason, d.method, d.witness_name, d.total_units,
              d.total_cost::float AS total_cost, d.created_at,
              u.full_name AS disposed_by,
              (SELECT COUNT(*)::int FROM disposal_items i WHERE i.disposal_id = d.id) AS lines
         FROM disposals d LEFT JOIN users u ON u.id = d.user_id
        ORDER BY d.created_at DESC
        LIMIT 200`
    );
    res.json(rows);
  } catch (e) {
    console.error("[disposals] list:", e.message);
    res.status(500).json({ message: "Could not read the disposal register" });
  }
};

/** GET /api/disposals/:id/certificate.pdf — the document itself. */
exports.certificatePDF = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, d.total_cost::float AS total_cost, u.full_name AS disposed_by
         FROM disposals d LEFT JOIN users u ON u.id = d.user_id WHERE d.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Disposal not found" });
    const d = rows[0];
    const items = (await pool.query(
      "SELECT * FROM disposal_items WHERE disposal_id = $1 ORDER BY product_name", [req.params.id]
    )).rows;
    const settings = (await pool.query("SELECT * FROM settings WHERE id = 1")).rows[0] || {};

    pdf.disposalCertificate(res, { disposal: d, items, settings });
  } catch (e) {
    console.error("[disposals] certificate:", e.message);
    res.status(500).json({ message: "Could not produce the certificate" });
  }
};
