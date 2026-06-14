const pool = require("../config/db");

exports.list = async (req, res) => {
  const status = req.query.status;
  const q = (req.query.q || "").trim().toLowerCase();
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.rx_number, p.patient_name, p.prescriber_name, p.prescribed_date,
              p.status, p.refills_allowed, p.refills_used, p.created_at,
              (SELECT COUNT(*) FROM prescription_items i WHERE i.prescription_id = p.id)::int AS item_count
       FROM prescriptions p
       WHERE ($1::text IS NULL OR p.status = $1)
         AND ($2 = '' OR lower(p.patient_name) LIKE '%'||$2||'%' OR lower(p.prescriber_name) LIKE '%'||$2||'%' OR p.rx_number ILIKE '%'||$2||'%')
       ORDER BY p.created_at DESC LIMIT 200`,
      [status || null, q]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.get = async (req, res) => {
  try {
    const rx = await pool.query(
      `SELECT p.*, c.name AS customer_name, cb.full_name AS created_by_name, db.full_name AS dispensed_by_name
       FROM prescriptions p
       LEFT JOIN customers c ON p.customer_id = c.id
       LEFT JOIN users cb ON p.created_by = cb.id
       LEFT JOIN users db ON p.dispensed_by = db.id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rx.rows.length) return res.status(404).json({ message: "Prescription not found" });
    const items = await pool.query(
      "SELECT * FROM prescription_items WHERE prescription_id = $1 ORDER BY id",
      [req.params.id]
    );
    res.json({ ...rx.rows[0], items: items.rows });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.create = async (req, res) => {
  const {
    patient_name, customer_id, prescriber_name, prescriber_facility,
    prescribed_date, refills_allowed, notes, items,
  } = req.body || {};
  if (!patient_name || !patient_name.trim()) return res.status(400).json({ message: "Patient name is required" });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "Add at least one drug" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rx = await client.query(
      `INSERT INTO prescriptions (patient_name, customer_id, prescriber_name, prescriber_facility, prescribed_date, refills_allowed, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,0),$7,$8) RETURNING id, created_at`,
      [patient_name.trim(), customer_id || null, prescriber_name || null, prescriber_facility || null,
       prescribed_date || null, refills_allowed, notes || null, req.user.id]
    );
    const rxId = rx.rows[0].id;
    await client.query("UPDATE prescriptions SET rx_number = $1 WHERE id = $2", [`RX-${String(rxId).padStart(5, "0")}`, rxId]);

    for (const it of items) {
      if (!it.drug_name || !it.drug_name.trim()) continue;
      // Link to a catalogue product by exact name when possible.
      let productId = it.product_id || null;
      if (!productId) {
        const m = await client.query("SELECT id FROM products WHERE lower(name) = lower($1) AND is_active = true LIMIT 1", [it.drug_name.trim()]);
        productId = m.rows[0]?.id || null;
      }
      await client.query(
        `INSERT INTO prescription_items (prescription_id, product_id, drug_name, dosage, quantity)
         VALUES ($1,$2,$3,$4,COALESCE($5,0))`,
        [rxId, productId, it.drug_name.trim(), it.dosage || null, it.quantity]
      );
    }
    await client.query("COMMIT");
    res.status(201).json({ id: rxId, rx_number: `RX-${String(rxId).padStart(5, "0")}` });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(400).json({ message: e.message });
  } finally {
    client.release();
  }
};

// Mark a prescription dispensed (clinical record; stock moves via POS sale).
exports.dispense = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const cur = await pool.query("SELECT status, refills_allowed, refills_used FROM prescriptions WHERE id = $1", [id]);
    if (!cur.rows.length) return res.status(404).json({ message: "Prescription not found" });
    if (cur.rows[0].status === "cancelled") return res.status(400).json({ message: "This prescription was cancelled" });

    await pool.query("UPDATE prescription_items SET dispensed_qty = quantity WHERE prescription_id = $1", [id]);
    // A dispense consumes a refill if any remain and it was already dispensed once.
    const usedRefill = cur.rows[0].status === "dispensed" && cur.rows[0].refills_used < cur.rows[0].refills_allowed;
    const { rows } = await pool.query(
      `UPDATE prescriptions SET
         status = 'dispensed', dispensed_by = $1, dispensed_at = NOW(),
         refills_used = refills_used + $2
       WHERE id = $3 RETURNING status, refills_used, refills_allowed`,
      [req.user.id, usedRefill ? 1 : 0, id]
    );
    res.json({ success: true, ...rows[0] });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.cancel = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE prescriptions SET status = 'cancelled' WHERE id = $1 AND status <> 'dispensed' RETURNING id",
      [req.params.id]
    );
    if (!rows.length) return res.status(400).json({ message: "Cannot cancel this prescription" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
