const pool = require("../config/db");
const { PERMISSIONS, ROLES, ALL_KEYS, permsForRole, invalidate } = require("../lib/permissions");
const { logAudit } = require("../lib/audit");

// GET /api/permissions — catalogue + current matrix (owner = all).
exports.list = async (_req, res) => {
  try {
    const matrix = {};
    for (const role of ROLES) matrix[role] = await permsForRole(role);
    res.json({ permissions: PERMISSIONS, roles: ROLES, matrix });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// PUT /api/permissions/:role — replace a role's permission set.
exports.updateRole = async (req, res) => {
  const role = req.params.role;
  const { permissions } = req.body || {};
  if (!ROLES.includes(role)) return res.status(400).json({ message: "Unknown role" });
  if (role === "owner") return res.status(400).json({ message: "The owner role always has full access" });
  if (!Array.isArray(permissions)) return res.status(400).json({ message: "permissions array is required" });

  const valid = permissions.filter((p) => ALL_KEYS.includes(p));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM role_permissions WHERE role = $1", [role]);
    for (const k of valid) {
      await client.query("INSERT INTO role_permissions (role, permission) VALUES ($1,$2)", [role, k]);
    }
    await client.query("COMMIT");
    invalidate();
    logAudit(req, "permissions_update", "role", role, { count: valid.length });
    res.json({ success: true, role, permissions: valid });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(500).json({ message: e.message });
  } finally {
    client.release();
  }
};
