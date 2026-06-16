const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const { permsForRole } = require("../lib/permissions");
const loginGuard = require("../lib/loginGuard");
const totp = require("../lib/totp");
const { bumpTokenVersion } = require("../middleware/auth");
const { validatePassword } = require("../lib/passwordPolicy");
const { logAudit } = require("../lib/audit");

// Issue the full session token (embeds token_version for revocation) + user payload.
async function issueSession(user, res) {
  const token = jwt.sign(
    { id: user.id, role: user.role, branch_id: user.branch_id, full_name: user.full_name, tv: user.token_version || 0 },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
  pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]).catch(() => {});
  res.json({
    token,
    user: {
      id: user.id, full_name: user.full_name, email: user.email,
      role: user.role, branch_id: user.branch_id, branch_name: user.branch_name,
      totp_enabled: user.totp_enabled,
      permissions: await permsForRole(user.role),
    },
  });
}

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

    // Two-factor: hand back a short-lived ticket; the code is verified next.
    if (user.totp_enabled) {
      const ticket = jwt.sign({ uid: user.id, purpose: "2fa" }, process.env.JWT_SECRET, { expiresIn: "5m" });
      return res.json({ require_2fa: true, ticket });
    }
    await issueSession(user, res);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Second login step: verify the TOTP (or a backup) code against the ticket.
exports.verify2fa = async (req, res) => {
  const { ticket, code } = req.body || {};
  if (!ticket || !code) return res.status(400).json({ message: "Ticket and code are required" });
  try {
    let payload;
    try { payload = jwt.verify(ticket, process.env.JWT_SECRET); } catch { return res.status(401).json({ message: "Your sign-in expired — start again" }); }
    if (payload.purpose !== "2fa") return res.status(400).json({ message: "Invalid ticket" });
    const { rows } = await pool.query(
      `SELECT u.*, b.name AS branch_name FROM users u LEFT JOIN branches b ON u.branch_id = b.id WHERE u.id = $1`,
      [payload.uid]
    );
    const user = rows[0];
    if (!user || !user.is_active) return res.status(401).json({ message: "Account unavailable" });

    const clean = String(code).trim().toUpperCase();
    const step = totp.matchStep(user.totp_secret, clean);
    if (step !== null) {
      // Replay protection: a code from an already-used (or earlier) step is refused.
      if (step <= (user.totp_last_step || 0)) {
        return res.status(401).json({ message: "That code was already used — wait for the next one" });
      }
      await pool.query("UPDATE users SET totp_last_step = $1 WHERE id = $2", [step, user.id]);
      return await issueSession(user, res);
    }
    // Backup code (one-time use)
    const h = totp.hashCode(clean);
    const codes = Array.isArray(user.backup_codes) ? user.backup_codes : [];
    if (codes.includes(h)) {
      await pool.query("UPDATE users SET backup_codes = $1 WHERE id = $2", [JSON.stringify(codes.filter((c) => c !== h)), user.id]);
      return await issueSession(user, res);
    }
    return res.status(401).json({ message: "Incorrect code" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Begin 2FA setup: generate a pending secret + provisioning URI (for the QR).
exports.setup2fa = async (req, res) => {
  try {
    const secret = totp.generateSecret();
    await pool.query("UPDATE users SET totp_pending = $1 WHERE id = $2", [secret, req.user.id]);
    const me = await pool.query("SELECT email FROM users WHERE id = $1", [req.user.id]);
    res.json({ secret, otpauth_url: totp.otpauthURL(secret, me.rows[0]?.email || "user") });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Confirm setup with a code; enable 2FA and return one-time backup codes.
exports.enable2fa = async (req, res) => {
  const { code } = req.body || {};
  try {
    const { rows } = await pool.query("SELECT totp_pending FROM users WHERE id = $1", [req.user.id]);
    const pending = rows[0]?.totp_pending;
    if (!pending) return res.status(400).json({ message: "Start setup first" });
    if (!totp.verify(pending, code)) return res.status(400).json({ message: "That code didn't match — check the time on your phone and try again" });
    const backup = totp.makeBackupCodes(10);
    await pool.query(
      "UPDATE users SET totp_secret = $1, totp_pending = NULL, totp_enabled = true, backup_codes = $2 WHERE id = $3",
      [pending, JSON.stringify(backup.map(totp.hashCode)), req.user.id]
    );
    res.json({ enabled: true, backup_codes: backup });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Turn off 2FA (requires a current code or backup code).
exports.disable2fa = async (req, res) => {
  const { code } = req.body || {};
  try {
    const { rows } = await pool.query("SELECT totp_secret, backup_codes FROM users WHERE id = $1", [req.user.id]);
    const u = rows[0];
    if (!u) return res.status(404).json({ message: "User not found" });
    const clean = String(code || "").trim().toUpperCase();
    const codes = Array.isArray(u.backup_codes) ? u.backup_codes : [];
    if (!totp.verify(u.totp_secret, clean) && !codes.includes(totp.hashCode(clean)))
      return res.status(400).json({ message: "Incorrect code" });
    await pool.query("UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled = false, backup_codes = '[]'::jsonb WHERE id = $1", [req.user.id]);
    res.json({ enabled: false });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Revoke every existing token for this user (log out all devices).
exports.logoutAll = async (req, res) => {
  try {
    const { rows } = await pool.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING token_version", [req.user.id]);
    bumpTokenVersion(req.user.id, rows[0].token_version);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Self-service: update your own display name.
exports.updateProfile = async (req, res) => {
  const { full_name } = req.body || {};
  if (!full_name || !full_name.trim()) return res.status(400).json({ message: "Name can't be empty" });
  try {
    await pool.query("UPDATE users SET full_name = $1 WHERE id = $2", [full_name.trim(), req.user.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Self-service: change your own password. Verifies the current one, applies the
// policy, then bumps token_version (logs out other devices) and reissues this
// session's token so the current device stays signed in.
exports.changePassword = async (req, res) => {
  const { current_password, new_password } = req.body || {};
  const pwErr = validatePassword(new_password);
  if (pwErr) return res.status(400).json({ message: pwErr });
  try {
    const u = (await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id])).rows[0];
    if (!u) return res.status(404).json({ message: "User not found" });
    const ok = await bcrypt.compare(current_password || "", u.password_hash);
    if (!ok) return res.status(400).json({ message: "Current password is incorrect" });
    const hash = await bcrypt.hash(new_password, 10);
    const { rows } = await pool.query(
      "UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2 RETURNING token_version, role, branch_id, full_name",
      [hash, req.user.id]
    );
    bumpTokenVersion(req.user.id, rows[0].token_version);
    const token = jwt.sign(
      { id: req.user.id, role: rows[0].role, branch_id: rows[0].branch_id, full_name: rows[0].full_name, tv: rows[0].token_version },
      process.env.JWT_SECRET, { expiresIn: "12h" }
    );
    logAudit(req, "password_change", "user", req.user.id, null);
    res.json({ success: true, token });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.me = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.branch_id, u.totp_enabled, u.last_login_at, b.name AS branch_name
       FROM users u LEFT JOIN branches b ON u.branch_id = b.id WHERE u.id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });
    res.json({ ...rows[0], permissions: await permsForRole(rows[0].role) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
