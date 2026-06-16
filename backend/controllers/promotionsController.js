const pool = require("../config/db");
const { logAudit } = require("../lib/audit");
const { evaluate } = require("../lib/promotions");

const TYPES = ["percent", "amount", "bxgy"];
const SCOPES = ["all", "category", "products"];

exports.list = async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.name AS category_name,
              (p.is_active
                AND (p.starts_at IS NULL OR p.starts_at <= CURRENT_DATE)
                AND (p.ends_at   IS NULL OR p.ends_at   >= CURRENT_DATE)) AS live
       FROM promotions p LEFT JOIN categories c ON p.category_id = c.id
       ORDER BY p.is_active DESC, p.created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

function clean(body) {
  const type = TYPES.includes(body.type) ? body.type : "percent";
  const scope = SCOPES.includes(body.scope) ? body.scope : "all";
  return {
    name: String(body.name || "").trim(),
    type, scope,
    category_id: scope === "category" ? (Number(body.category_id) || null) : null,
    product_ids: scope === "products" && Array.isArray(body.product_ids) ? body.product_ids.map(Number).filter(Boolean) : [],
    value: Number(body.value) || 0,
    min_subtotal: Number(body.min_subtotal) || 0,
    buy_qty: Number(body.buy_qty) || 0,
    get_qty: Number(body.get_qty) || 0,
    starts_at: body.starts_at || null,
    ends_at: body.ends_at || null,
    is_active: body.is_active !== false,
  };
}

exports.create = async (req, res) => {
  const p = clean(req.body || {});
  if (!p.name) return res.status(400).json({ message: "Give the promotion a name" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO promotions (name, type, scope, category_id, product_ids, value, min_subtotal, buy_qty, get_qty, starts_at, ends_at, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [p.name, p.type, p.scope, p.category_id, JSON.stringify(p.product_ids), p.value, p.min_subtotal, p.buy_qty, p.get_qty, p.starts_at, p.ends_at, p.is_active]
    );
    logAudit(req, "promotion_create", "promotion", rows[0].id, { name: p.name, type: p.type });
    res.status(201).json({ id: rows[0].id });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.update = async (req, res) => {
  const id = Number(req.params.id);
  const p = clean(req.body || {});
  if (!p.name) return res.status(400).json({ message: "Give the promotion a name" });
  try {
    const { rowCount } = await pool.query(
      `UPDATE promotions SET name=$1, type=$2, scope=$3, category_id=$4, product_ids=$5, value=$6,
              min_subtotal=$7, buy_qty=$8, get_qty=$9, starts_at=$10, ends_at=$11, is_active=$12
       WHERE id=$13`,
      [p.name, p.type, p.scope, p.category_id, JSON.stringify(p.product_ids), p.value, p.min_subtotal, p.buy_qty, p.get_qty, p.starts_at, p.ends_at, p.is_active, id]
    );
    if (!rowCount) return res.status(404).json({ message: "Promotion not found" });
    logAudit(req, "promotion_update", "promotion", id, { name: p.name, active: p.is_active });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.remove = async (req, res) => {
  try {
    await pool.query("DELETE FROM promotions WHERE id = $1", [Number(req.params.id)]);
    logAudit(req, "promotion_delete", "promotion", Number(req.params.id), null);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Live preview for the till — what would apply to this cart right now.
exports.preview = async (req, res) => {
  try {
    const result = await evaluate(pool, req.body?.items || []);
    res.json(result);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
