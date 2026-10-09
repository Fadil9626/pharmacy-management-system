const jwt = require("jsonwebtoken");
const pool = require("../config/db");

// What the request is allowed to be is read from the users table, not from the
// token. The token says who signed in and which sign-in it was (`tv`); the
// role, branch and whether the account is still active are looked up, so that
// deactivating, demoting or moving someone takes effect on their next request
// rather than when a 12-hour token runs out.
//
// A small cache keeps that off the database on every request. Anything that
// changes a user calls forgetUser(id) so the change is not held back by it.
const userCache = new Map(); // id -> { row, exp }
const TTL = 30 * 1000;

async function currentUser(id) {
  const hit = userCache.get(id);
  if (hit && hit.exp > Date.now()) return hit.row;
  const { rows } = await pool.query(
    "SELECT id, role, branch_id, full_name, is_active, token_version FROM users WHERE id = $1", [id]
  );
  const row = rows[0] || null;
  userCache.set(id, { row, exp: Date.now() + TTL });
  return row;
}

function forgetUser(id) {
  userCache.delete(Number(id));
}

// Kept for existing callers: they pass the new version after bumping it.
function bumpTokenVersion(id) {
  forgetUser(id);
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
  // Only a session is a session. The two-step sign-in ticket is signed with the
  // same secret, and was accepted here: a password alone, without the code,
  // opened every branch's sales, customers and till reports.
  if (payload.purpose !== undefined || !Number.isInteger(payload.id) || !Number.isInteger(payload.tv)) {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
  let u;
  try {
    u = await currentUser(payload.id);
  } catch {
    return res.status(401).json({ message: "Could not verify session" });
  }
  if (!u || !u.is_active) return res.status(401).json({ message: "Account unavailable", code: "SESSION_REVOKED" });
  if (u.token_version !== payload.tv) {
    return res.status(401).json({ message: "Session ended — please sign in again", code: "SESSION_REVOKED" });
  }
  req.user = { id: u.id, role: u.role, branch_id: u.branch_id, full_name: u.full_name, tv: u.token_version };
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

module.exports = { protect, authorize, bumpTokenVersion, forgetUser };
