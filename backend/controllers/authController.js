const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const { permsForRole } = require("../lib/permissions");
const loginGuard = require("../lib/loginGuard");

exports.login = async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: "Email and password are required" });
  const wait = loginGuard.retryAfter(req, email);
  if (wait > 0) {
    res.set("Retry-After", String(wait));
    return res.status(429).json({ message: `Too many attempts. Try again in ${Math.ceil(wait / 60)} min.` });
  }
  try {
    const { rows } = await pool.query(
      `SELECT u.*, b.name AS branch_name FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE lower(u.email) = lower($1)`,
      [email]
    );
    const user = rows[0];
    if (!user || !user.is_active) { loginGuard.recordFail(req, email); return res.status(401).json({ message: "Invalid credentials" }); }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) { loginGuard.recordFail(req, email); return res.status(401).json({ message: "Invalid credentials" }); }
    loginGuard.reset(req, email);

    const token = jwt.sign(
      { id: user.id, role: user.role, branch_id: user.branch_id, full_name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );
    res.json({
      token,
      user: {
        id: user.id, full_name: user.full_name, email: user.email,
        role: user.role, branch_id: user.branch_id, branch_name: user.branch_name,
        permissions: await permsForRole(user.role),
      },
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.me = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.branch_id, b.name AS branch_name
       FROM users u LEFT JOIN branches b ON u.branch_id = b.id WHERE u.id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });
    res.json({ ...rows[0], permissions: await permsForRole(rows[0].role) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
