const jwt = require("jsonwebtoken");
const pool = require("../config/db");

// Small cache of users' current token_version so the per-request revocation
// check doesn't hit the DB every time. 30s TTL; bumped immediately on logout-all.
const versionCache = new Map(); // id -> { v, exp }
const TTL = 30 * 1000;

async function currentVersion(id) {
  const hit = versionCache.get(id);
  if (hit && hit.exp > Date.now()) return hit.v;
  const { rows } = await pool.query("SELECT token_version FROM users WHERE id = $1", [id]);
  const v = rows[0] ? rows[0].token_version : null;
  versionCache.set(id, { v, exp: Date.now() + TTL });
  return v;
}

function bumpTokenVersion(id, v) {
  versionCache.set(id, { v, exp: Date.now() + TTL });
}

async function protect(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Not authenticated" });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET); // { id, role, branch_id, full_name, tv }
  } catch {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
  // Session revocation: a token carrying a stale version was logged out elsewhere.
  if (payload.tv !== undefined) {
    try {
      const v = await currentVersion(payload.id);
      if (v === null) return res.status(401).json({ message: "Account unavailable" });
      if (v !== payload.tv) return res.status(401).json({ message: "Session ended — please sign in again", code: "SESSION_REVOKED" });
    } catch {
      return res.status(401).json({ message: "Could not verify session" });
    }
  }
  req.user = payload;
  next();
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || (roles.length && !roles.includes(req.user.role))) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
}

module.exports = { protect, authorize, bumpTokenVersion };
