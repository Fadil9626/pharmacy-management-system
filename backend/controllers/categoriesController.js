const pool = require("../config/db");

// List categories with how many active products each holds.
exports.list = async (req, res) => {
  const all = req.query.all === "1";
  try {
    const { rows } = await pool.query(
      `SELECT c.*,
              COUNT(p.id) FILTER (WHERE p.is_active)::int AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id
       ${all ? "" : "WHERE c.is_active = true"}
       GROUP BY c.id
       ORDER BY c.sort_order, c.name`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.create = async (req, res) => {
  const { name, code, description, surveillance_tag, sort_order } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ message: "Category name is required" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO categories (name, code, description, surveillance_tag, sort_order)
       VALUES ($1,$2,$3,$4,COALESCE($5,100)) RETURNING *`,
      [name.trim(), code || null, description || null, surveillance_tag || null, sort_order]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ message: "A category with that name already exists" });
    res.status(500).json({ message: e.message });
  }
};

exports.update = async (req, res) => {
  const id = Number(req.params.id);
  const { name, code, description, surveillance_tag, sort_order, is_active } = req.body || {};
  try {
    const { rows } = await pool.query(
      `UPDATE categories SET
         name = COALESCE($1, name),
         code = $2,
         description = $3,
         surveillance_tag = $4,
         sort_order = COALESCE($5, sort_order),
         is_active = COALESCE($6, is_active)
       WHERE id = $7 RETURNING *`,
      [name?.trim() || null, code || null, description || null,
       surveillance_tag || null, sort_order, typeof is_active === "boolean" ? is_active : null, id]
    );
    if (!rows.length) return res.status(404).json({ message: "Category not found" });
    res.json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ message: "A category with that name already exists" });
    res.status(500).json({ message: e.message });
  }
};

exports.deactivate = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE categories SET is_active = false WHERE id = $1 RETURNING id",
      [Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ message: "Category not found" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
