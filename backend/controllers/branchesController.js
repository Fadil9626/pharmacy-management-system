const pool = require("../config/db");

// Branches with live metrics (stock value, units, today's sales).
exports.list = async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*,
              COALESCE(sv.val, 0)::float    AS stock_value,
              COALESCE(sv.units, 0)::int    AS units,
              COALESCE(ts.today, 0)::float  AS today_sales
       FROM branches b
       LEFT JOIN LATERAL (
         SELECT SUM(quantity * cost_price) AS val, SUM(quantity) AS units
         FROM product_batches WHERE branch_id = b.id
       ) sv ON true
       LEFT JOIN LATERAL (
         SELECT SUM(total) AS today FROM sales
         WHERE branch_id = b.id AND created_at::date = CURRENT_DATE
       ) ts ON true
       ORDER BY b.is_main DESC, b.name`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.create = async (req, res) => {
  const { name, code, address, phone } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ message: "Branch name is required" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO branches (name, code, address, phone) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name.trim(), code || null, address || null, phone || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.update = async (req, res) => {
  const id = Number(req.params.id);
  const { name, code, address, phone, is_active } = req.body || {};
  try {
    if (is_active === false) {
      const main = await pool.query("SELECT is_main FROM branches WHERE id = $1", [id]);
      if (main.rows[0]?.is_main) return res.status(400).json({ message: "The main branch can't be deactivated" });
    }
    const { rows } = await pool.query(
      `UPDATE branches SET
         name = COALESCE($1, name), code = $2, address = $3, phone = $4,
         is_active = COALESCE($5, is_active)
       WHERE id = $6 RETURNING *`,
      [name?.trim() || null, code || null, address || null, phone || null,
       typeof is_active === "boolean" ? is_active : null, id]
    );
    if (!rows.length) return res.status(404).json({ message: "Branch not found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
