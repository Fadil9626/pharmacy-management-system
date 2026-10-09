// Authenticates Control Center → Remedy management calls via a shared admin key.
const crypto = require("crypto");

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

// Compared as hashes so the comparison takes the same time whatever is sent —
// a plain !== stops at the first wrong character, which can be timed.
const digest = (s) => crypto.createHash("sha256").update(String(s)).digest();

module.exports = function adminApiKey(req, res, next) {
  if (!ADMIN_API_KEY) {
    return res.status(503).json({ message: "Admin API not configured." });
  }
  const provided = req.headers["x-admin-key"];
  if (!provided || !crypto.timingSafeEqual(digest(provided), digest(ADMIN_API_KEY))) {
    return res.status(401).json({ message: "Invalid or missing admin API key." });
  }
  next();
};
