const pool = require("../config/db");

exports.list = async (req, res) => {
  const q = (req.query.q || "").trim().toLowerCase();
  try {
    const { rows } = await pool.query(
      `SELECT id, name, phone, email, credit_limit, balance, loyalty_points,
              total_spent, visit_count, is_active
       FROM customers
       WHERE is_active = true
         AND ($1 = '' OR lower(name) LIKE '%'||$1||'%' OR phone LIKE '%'||$1||'%')
       ORDER BY name`,
      [q]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.get = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const c = await pool.query("SELECT * FROM customers WHERE id = $1", [id]);
    if (!c.rows.length) return res.status(404).json({ message: "Customer not found" });
    const [sales, payments] = await Promise.all([
      pool.query(
        `SELECT id, receipt_no, total, payment_method, created_at
         FROM sales WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [id]
      ),
      pool.query(
        `SELECT cp.*, u.full_name AS taken_by FROM customer_payments cp
         LEFT JOIN users u ON cp.user_id = u.id
         WHERE cp.customer_id = $1 ORDER BY cp.created_at DESC LIMIT 20`,
        [id]
      ),
    ]);
    res.json({ ...c.rows[0], sales: sales.rows, payments: payments.rows });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.create = async (req, res) => {
  const { name, phone, email, address, credit_limit, notes } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ message: "Customer name is required" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO customers (name, phone, email, address, credit_limit, notes)
       VALUES ($1,$2,$3,$4,COALESCE($5,0),$6) RETURNING *`,
      [name.trim(), phone || null, email || null, address || null,
       credit_limit != null && credit_limit !== "" ? Number(credit_limit) : 0, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.update = async (req, res) => {
  const id = Number(req.params.id);
  const { name, phone, email, address, credit_limit, notes, is_active } = req.body || {};
  try {
    const { rows } = await pool.query(
      `UPDATE customers SET
         name = COALESCE($1, name), phone = $2, email = $3, address = $4,
         credit_limit = COALESCE($5, credit_limit), notes = $6,
         is_active = COALESCE($7, is_active)
       WHERE id = $8 RETURNING *`,
      [name?.trim() || null, phone || null, email || null, address || null,
       credit_limit != null && credit_limit !== "" ? Number(credit_limit) : null,
       notes || null, typeof is_active === "boolean" ? is_active : null, id]
    );
    if (!rows.length) return res.status(404).json({ message: "Customer not found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Customer pays down their account balance.
exports.recordPayment = async (req, res) => {
  const id = Number(req.params.id);
  const { amount, method = "cash", note } = req.body || {};
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ message: "A positive amount is required" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const c = await client.query("SELECT balance FROM customers WHERE id = $1 FOR UPDATE", [id]);
    if (!c.rows.length) throw new Error("Customer not found");
    const newBalance = Math.max(0, Number(c.rows[0].balance) - amt);
    await client.query("UPDATE customers SET balance = $1 WHERE id = $2", [newBalance, id]);
    await client.query(
      `INSERT INTO customer_payments (customer_id, amount, method, note, user_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, amt, method, note || null, req.user.id]
    );
    await client.query("COMMIT");
    res.status(201).json({ success: true, balance: newBalance });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(400).json({ message: e.message });
  } finally {
    client.release();
  }
};
