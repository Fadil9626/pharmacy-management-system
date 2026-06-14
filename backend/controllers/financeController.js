const pool = require("../config/db");

const branchOf = (req) => Number(req.query.branch_id) || Number(req.body?.branch_id) || req.user.branch_id || null;

// Find the caller's current open shift id (used by POS to tag sales).
async function openShiftId(userId, db = pool) {
  const { rows } = await db.query(
    "SELECT id FROM shifts WHERE user_id = $1 AND status = 'open' ORDER BY opened_at DESC LIMIT 1",
    [userId]
  );
  return rows[0]?.id || null;
}
exports.openShiftId = openShiftId;

// Live tally for a shift: sales by method, cash movements, expenses, expected cash.
async function tally(shiftId) {
  const [shiftRes, byMethod, moves, exp] = await Promise.all([
    pool.query("SELECT * FROM shifts WHERE id = $1", [shiftId]),
    pool.query(
      `SELECT payment_method, COUNT(*)::int AS n, COALESCE(SUM(total),0)::float AS amount
       FROM sales WHERE shift_id = $1 GROUP BY payment_method`,
      [shiftId]
    ),
    pool.query(
      `SELECT COALESCE(SUM(CASE WHEN type='in' THEN amount ELSE -amount END),0)::float AS net,
              COALESCE(SUM(amount) FILTER (WHERE type='drop'),0)::float AS drops,
              COALESCE(SUM(amount) FILTER (WHERE type='payout'),0)::float AS payouts,
              COALESCE(SUM(amount) FILTER (WHERE type='in'),0)::float AS topups
       FROM cash_movements WHERE shift_id = $1`,
      [shiftId]
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE paid_from_till),0)::float AS till_expenses,
              COALESCE(SUM(amount),0)::float AS total_expenses
       FROM expenses WHERE shift_id = $1`,
      [shiftId]
    ),
  ]);
  const shift = shiftRes.rows[0];
  const cashSales = byMethod.rows.find((r) => r.payment_method === "cash")?.amount || 0;
  const m = moves.rows[0];
  const e = exp.rows[0];
  const expected = Number(shift.opening_float) + cashSales + m.topups - m.drops - m.payouts - e.till_expenses;
  return {
    by_method: byMethod.rows,
    total_sales: byMethod.rows.reduce((s, r) => s + r.amount, 0),
    sales_count: byMethod.rows.reduce((s, r) => s + r.n, 0),
    cash_sales: cashSales,
    drops: m.drops, payouts: m.payouts, topups: m.topups,
    till_expenses: e.till_expenses, total_expenses: e.total_expenses,
    expected_cash: Math.round(expected * 100) / 100,
  };
}

exports.current = async (req, res) => {
  try {
    const id = await openShiftId(req.user.id);
    if (!id) return res.json({ shift: null });
    const shift = (await pool.query("SELECT * FROM shifts WHERE id = $1", [id])).rows[0];
    res.json({ shift, ...(await tally(id)) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.open = async (req, res) => {
  const { opening_float, note } = req.body || {};
  try {
    if (await openShiftId(req.user.id)) return res.status(400).json({ message: "You already have an open till" });
    const { rows } = await pool.query(
      `INSERT INTO shifts (branch_id, user_id, opening_float, note)
       VALUES ($1,$2,COALESCE($3,0),$4) RETURNING *`,
      [req.user.branch_id || null, req.user.id, Number(opening_float) || 0, note || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.close = async (req, res) => {
  const { closing_counted, note } = req.body || {};
  const counted = Number(closing_counted);
  if (Number.isNaN(counted)) return res.status(400).json({ message: "Enter the counted cash amount" });
  try {
    const id = await openShiftId(req.user.id);
    if (!id) return res.status(400).json({ message: "No open till to close" });
    const t = await tally(id);
    const variance = Math.round((counted - t.expected_cash) * 100) / 100;
    const { rows } = await pool.query(
      `UPDATE shifts SET status='closed', closed_at=NOW(),
         expected_cash=$1, closing_counted=$2, variance=$3, note=COALESCE($4, note)
       WHERE id=$5 RETURNING *`,
      [t.expected_cash, counted, variance, note || null, id]
    );
    res.json({ ...rows[0], ...t, variance });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.cashMovement = async (req, res) => {
  const { type, amount, note } = req.body || {};
  const amt = Number(amount);
  if (!["drop", "payout", "in"].includes(type)) return res.status(400).json({ message: "Invalid movement type" });
  if (!amt || amt <= 0) return res.status(400).json({ message: "A positive amount is required" });
  try {
    const id = await openShiftId(req.user.id);
    if (!id) return res.status(400).json({ message: "Open a till first" });
    await pool.query(
      "INSERT INTO cash_movements (shift_id, type, amount, note, user_id) VALUES ($1,$2,$3,$4,$5)",
      [id, type, amt, note || null, req.user.id]
    );
    res.status(201).json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.shifts = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, u.full_name AS cashier FROM shifts s LEFT JOIN users u ON s.user_id = u.id
       WHERE status='closed' ORDER BY closed_at DESC LIMIT 60`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.shiftReport = async (req, res) => {
  try {
    const shift = (await pool.query(
      `SELECT s.*, u.full_name AS cashier FROM shifts s LEFT JOIN users u ON s.user_id = u.id WHERE s.id = $1`,
      [req.params.id]
    )).rows[0];
    if (!shift) return res.status(404).json({ message: "Shift not found" });
    res.json({ shift, ...(await tally(req.params.id)) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ── Expenses ────────────────────────────────────────────────
exports.createExpense = async (req, res) => {
  const { category, amount, note, paid_from_till = true } = req.body || {};
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ message: "A positive amount is required" });
  try {
    const shiftId = await openShiftId(req.user.id);
    const { rows } = await pool.query(
      `INSERT INTO expenses (branch_id, shift_id, category, amount, note, paid_from_till, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.branch_id || null, shiftId, category || null, amt, note || null, paid_from_till !== false, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.listExpenses = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.*, u.full_name AS by_name FROM expenses e LEFT JOIN users u ON e.user_id = u.id
       ORDER BY e.created_at DESC LIMIT 100`
    );
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    res.json({ expenses: rows, total });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
