const pool = require("../config/db");
const { notify } = require("../lib/notify");
const pdf = require("../lib/pdf");

// Email/SMS a statement summary to a customer on demand.
exports.notifyStatement = async (req, res) => {
  const id = Number(req.params.id);
  const { channel } = req.body || {};
  if (!["email", "sms"].includes(channel)) return res.status(400).json({ message: "channel must be email or sms" });
  try {
    const c = (await pool.query("SELECT name, email, phone, balance FROM customers WHERE id = $1", [id])).rows[0];
    if (!c) return res.status(404).json({ message: "Customer not found" });
    const to = req.body.to || (channel === "email" ? c.email : c.phone);
    if (!to) return res.status(400).json({ message: `No ${channel} on file for this customer` });

    const since = "90 days";
    const charges = (await pool.query(
      `SELECT COALESCE(SUM(sp.amount),0)::numeric AS total, COUNT(DISTINCT s.id)::int AS n
       FROM sales s JOIN sale_payments sp ON sp.sale_id = s.id AND sp.method = 'account'
       WHERE s.customer_id = $1 AND s.created_at > NOW() - $2::interval`, [id, since])).rows[0];
    const pays = (await pool.query(
      `SELECT COALESCE(SUM(amount),0)::numeric AS total, COUNT(*)::int AS n
       FROM customer_payments WHERE customer_id = $1 AND created_at > NOW() - $2::interval`, [id, since])).rows[0];

    const sName = (await pool.query("SELECT pharmacy_name, currency_symbol FROM settings WHERE id = 1")).rows[0] || {};
    const sym = sName.currency_symbol || "";
    const body =
      `Account statement — ${sName.pharmacy_name || "Remedy"}\n` +
      `Customer: ${c.name}\n` +
      `Last 90 days: ${charges.n} charge(s) ${sym}${Number(charges.total).toFixed(2)}, ${pays.n} payment(s) ${sym}${Number(pays.total).toFixed(2)}\n` +
      `Current balance owed: ${sym}${Number(c.balance).toFixed(2)}`;

    const row = await notify({ channel, to, type: "statement", subject: `Your account statement — ${sName.pharmacy_name || "Remedy"}`, body, ref_type: "customer", ref_id: id });
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

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

const cleanAllergies = (a) => (Array.isArray(a) ? a.map((x) => String(x).trim()).filter(Boolean) : []);

exports.create = async (req, res) => {
  const { name, phone, email, address, credit_limit, notes, allergies } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ message: "Customer name is required" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO customers (name, phone, email, address, credit_limit, notes, allergies)
       VALUES ($1,$2,$3,$4,COALESCE($5,0),$6,$7) RETURNING *`,
      [name.trim(), phone || null, email || null, address || null,
       credit_limit != null && credit_limit !== "" ? Number(credit_limit) : 0, notes || null,
       JSON.stringify(cleanAllergies(allergies))]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.update = async (req, res) => {
  const id = Number(req.params.id);
  const { name, phone, email, address, credit_limit, notes, is_active, allergies } = req.body || {};
  try {
    const { rows } = await pool.query(
      `UPDATE customers SET
         name = COALESCE($1, name), phone = $2, email = $3, address = $4,
         credit_limit = COALESCE($5, credit_limit), notes = $6,
         is_active = COALESCE($7, is_active),
         allergies = COALESCE($9::jsonb, allergies)
       WHERE id = $8 RETURNING *`,
      [name?.trim() || null, phone || null, email || null, address || null,
       credit_limit != null && credit_limit !== "" ? Number(credit_limit) : null,
       notes || null, typeof is_active === "boolean" ? is_active : null, id,
       allergies !== undefined ? JSON.stringify(cleanAllergies(allergies)) : null]
    );
    if (!rows.length) return res.status(404).json({ message: "Customer not found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Account statement: a running ledger of on-account charges and repayments over
// a date range, reconstructed from transactions (opening balance = net activity
// before `from`). Used for the printable/exportable customer statement.
async function buildStatement(id, fromQ, toQ) {
  const from = fromQ ? `${fromQ} 00:00:00` : "1970-01-01";
  const to = toQ ? `${toQ} 23:59:59` : "2999-12-31";
  const c = await pool.query("SELECT id, name, phone, email, address, balance, credit_limit FROM customers WHERE id = $1", [id]);
  if (!c.rows.length) return null;
  const charges = await pool.query(
    `SELECT s.id, s.receipt_no, s.created_at, SUM(sp.amount)::numeric AS amount
     FROM sales s JOIN sale_payments sp ON sp.sale_id = s.id AND sp.method = 'account'
     WHERE s.customer_id = $1 GROUP BY s.id, s.receipt_no, s.created_at`, [id]);
  const pays = await pool.query(
    `SELECT cp.id, cp.created_at, cp.amount, cp.method, cp.note FROM customer_payments cp WHERE cp.customer_id = $1`, [id]);
  const events = [
    ...charges.rows.map((r) => ({ at: new Date(r.created_at), type: "charge", ref: r.receipt_no, amount: Number(r.amount), label: "On-account sale" })),
    ...pays.rows.map((r) => ({ at: new Date(r.created_at), type: "payment", ref: null, amount: Number(r.amount), label: `Payment (${r.method})${r.note ? " — " + r.note : ""}` })),
  ].sort((a, b) => a.at - b.at);
  const fromTs = new Date(from), toTs = new Date(to);
  let opening = 0;
  for (const e of events) if (e.at < fromTs) opening += e.type === "charge" ? e.amount : -e.amount;
  let running = opening;
  const lines = [];
  for (const e of events) {
    if (e.at < fromTs || e.at > toTs) continue;
    running += e.type === "charge" ? e.amount : -e.amount;
    lines.push({ date: e.at, type: e.type, ref: e.ref, label: e.label,
      charge: e.type === "charge" ? e.amount : 0, payment: e.type === "payment" ? e.amount : 0,
      balance: Math.round(running * 100) / 100 });
  }
  return {
    customer: c.rows[0], from: fromQ || null, to: toQ || null,
    opening_balance: Math.round(opening * 100) / 100,
    closing_balance: Math.round(running * 100) / 100,
    total_charges: Math.round(lines.reduce((s, l) => s + l.charge, 0) * 100) / 100,
    total_payments: Math.round(lines.reduce((s, l) => s + l.payment, 0) * 100) / 100,
    current_balance: Number(c.rows[0].balance), lines,
  };
}

exports.statement = async (req, res) => {
  const id = Number(req.params.id);
  const from = req.query.from ? `${req.query.from} 00:00:00` : "1970-01-01";
  const to = req.query.to ? `${req.query.to} 23:59:59` : "2999-12-31";
  try {
    const c = await pool.query("SELECT id, name, phone, email, address, balance, credit_limit FROM customers WHERE id = $1", [id]);
    if (!c.rows.length) return res.status(404).json({ message: "Customer not found" });

    // On-account charges = the 'account' tender portion of each sale.
    const charges = await pool.query(
      `SELECT s.id, s.receipt_no, s.created_at, SUM(sp.amount)::numeric AS amount
       FROM sales s JOIN sale_payments sp ON sp.sale_id = s.id AND sp.method = 'account'
       WHERE s.customer_id = $1
       GROUP BY s.id, s.receipt_no, s.created_at`,
      [id]
    );
    const pays = await pool.query(
      `SELECT cp.id, cp.created_at, cp.amount, cp.method, cp.note, u.full_name AS taken_by
       FROM customer_payments cp LEFT JOIN users u ON cp.user_id = u.id
       WHERE cp.customer_id = $1`,
      [id]
    );

    const events = [
      ...charges.rows.map((r) => ({ at: new Date(r.created_at), type: "charge", ref: r.receipt_no, amount: Number(r.amount), label: "On-account sale" })),
      ...pays.rows.map((r) => ({ at: new Date(r.created_at), type: "payment", ref: null, amount: Number(r.amount), label: `Payment (${r.method})${r.note ? " — " + r.note : ""}`, taken_by: r.taken_by })),
    ].sort((a, b) => a.at - b.at);

    const fromTs = new Date(from), toTs = new Date(to);
    let opening = 0;
    for (const e of events) if (e.at < fromTs) opening += e.type === "charge" ? e.amount : -e.amount;

    let running = opening;
    const lines = [];
    for (const e of events) {
      if (e.at < fromTs || e.at > toTs) continue;
      running += e.type === "charge" ? e.amount : -e.amount;
      lines.push({
        date: e.at, type: e.type, ref: e.ref, label: e.label, taken_by: e.taken_by || null,
        charge: e.type === "charge" ? e.amount : 0,
        payment: e.type === "payment" ? e.amount : 0,
        balance: Math.round(running * 100) / 100,
      });
    }
    const totalCharges = lines.reduce((s, l) => s + l.charge, 0);
    const totalPayments = lines.reduce((s, l) => s + l.payment, 0);
    res.json({
      customer: c.rows[0],
      from: req.query.from || null, to: req.query.to || null,
      opening_balance: Math.round(opening * 100) / 100,
      closing_balance: Math.round(running * 100) / 100,
      total_charges: Math.round(totalCharges * 100) / 100,
      total_payments: Math.round(totalPayments * 100) / 100,
      current_balance: Number(c.rows[0].balance),
      lines,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Downloadable PDF statement.
exports.statementPDF = async (req, res) => {
  try {
    const data = await buildStatement(Number(req.params.id), req.query.from, req.query.to);
    if (!data) return res.status(404).json({ message: "Customer not found" });
    const settings = (await pool.query("SELECT * FROM settings WHERE id = 1")).rows[0] || {};
    pdf.statement(res, { data, settings });
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
