const pool = require("../config/db");

// Record a sensitive action. Fire-and-forget — an audit failure must never
// break the underlying request. Call AFTER the action has succeeded.
async function logAudit(req, action, entity, entityId, details) {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, details)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        req.user?.id || null,
        req.user?.full_name || null,
        action,
        entity || null,
        entityId != null ? String(entityId) : null,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (e) {
    console.error("audit log error:", e.message);
  }
}

module.exports = { logAudit };
