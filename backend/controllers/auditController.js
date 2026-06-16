const pool = require("../config/db");
const { verifyAuditChain } = require("../lib/audit");

// Confirm the audit log hasn't been tampered with (hash chain intact).
exports.verify = async (_req, res) => {
  try {
    res.json(await verifyAuditChain());
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.list = async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  const action = req.query.action || null;
  const q = (req.query.q || "").trim().toLowerCase();
  try {
    const { rows } = await pool.query(
      `SELECT id, user_name, action, entity, entity_id, details, created_at
       FROM audit_log
       WHERE ($1::text IS NULL OR action = $1)
         AND ($2 = '' OR lower(user_name) LIKE '%'||$2||'%' OR lower(action) LIKE '%'||$2||'%' OR lower(coalesce(entity,'')) LIKE '%'||$2||'%')
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [action, q, limit, offset]
    );
    const actions = await pool.query("SELECT DISTINCT action FROM audit_log ORDER BY action");
    res.json({ rows, actions: actions.rows.map((r) => r.action) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
