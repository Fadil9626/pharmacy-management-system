const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const { logAudit } = require("../lib/audit");
const { validatePassword } = require("../lib/passwordPolicy");
const { forgetUser } = require("../middleware/auth");

// Owner accounts are the owner's to manage. "Manage staff" is a permission a
// manager (or anyone the owner grants it to) holds, and before this check it
// was enough to promote an account to owner, deactivate the owner, or set the
// owner's password and sign in as them.
async function guardOwnerAccount(req, id) {
  if (req.user.role === "owner") return null;
  const t = (await pool.query("SELECT role FROM users WHERE id = $1", [id])).rows[0];
  if (t && t.role === "owner") return "Only an owner can change an owner's account";
  return null;
}
exports.guardOwnerAccount = guardOwnerAccount;

const ROLES = ["owner", "manager", "pharmacist", "cashier"];

exports.list = async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.branch_id, u.is_active, u.created_at,
              b.name AS branch_name
       FROM users u LEFT JOIN branches b ON u.branch_id = b.id
       ORDER BY u.created_at`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.create = async (req, res) => {
  const { full_name, email, password, role, branch_id } = req.body || {};
  if (!full_name || !email || !password)
    return res.status(400).json({ message: "Name, email and password are required" });
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ message: pwErr });
  if (role && !ROLES.includes(role))
    return res.status(400).json({ message: "Invalid role" });
  // Only an owner may mint another owner.
  if (role === "owner" && req.user.role !== "owner")
    return res.status(403).json({ message: "Only an owner can create another owner" });
  try {
    const hash = await bcrypt.hash(password, 10);
    const branch = branch_id || req.user.branch_id || null;
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, branch_id)
       VALUES ($1, lower($2), $3, $4, $5)
       RETURNING id, full_name, email, role, branch_id, is_active, created_at`,
      [full_name, email, hash, role || "cashier", branch]
    );
    logAudit(req, "user_create", "user", rows[0].id, { name: full_name, role: rows[0].role });
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ message: "That email is already in use" });
    res.status(500).json({ message: e.message });
  }
};

exports.update = async (req, res) => {
  const id = Number(req.params.id);
  const { full_name, role, branch_id, is_active } = req.body || {};
  if (role && !ROLES.includes(role)) return res.status(400).json({ message: "Invalid role" });
  if (id === req.user.id && is_active === false)
    return res.status(400).json({ message: "You can't deactivate your own account" });
  if (id === req.user.id && role && role !== req.user.role)
    return res.status(400).json({ message: "You can't change your own role" });
  if (role === "owner" && req.user.role !== "owner")
    return res.status(403).json({ message: "Only an owner can make someone an owner" });
  try {
    const refused = await guardOwnerAccount(req, id);
    if (refused) return res.status(403).json({ message: refused });
    const before = (await pool.query("SELECT role, is_active FROM users WHERE id = $1", [id])).rows[0];
    const { rows } = await pool.query(
      `UPDATE users SET
         full_name = COALESCE($1, full_name),
         role      = COALESCE($2, role),
         branch_id = COALESCE($3, branch_id),
         is_active = COALESCE($4, is_active)
       WHERE id = $5
       RETURNING id, full_name, email, role, branch_id, is_active, created_at`,
      [full_name || null, role || null, branch_id || null,
       typeof is_active === "boolean" ? is_active : null, id]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });
    // A changed role or a deactivation ends the person's sessions; a branch
    // move needs no sign-out, the next request reads the new branch.
    if (before && (before.role !== rows[0].role || (before.is_active && !rows[0].is_active))) {
      await pool.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [id]);
    }
    forgetUser(id);
    logAudit(req, "user_update", "user", id, { name: rows[0].full_name, role: rows[0].role, is_active: rows[0].is_active });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.resetPassword = async (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body || {};
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ message: pwErr });
  try {
    const refused = await guardOwnerAccount(req, id);
    if (refused) return res.status(403).json({ message: refused });
    const hash = await bcrypt.hash(password, 10);
    // A new password ends the sessions signed in with the old one.
    const { rowCount } = await pool.query(
      "UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2", [hash, id]);
    if (!rowCount) return res.status(404).json({ message: "User not found" });
    forgetUser(id);
    logAudit(req, "user_password_reset", "user", id, null);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
