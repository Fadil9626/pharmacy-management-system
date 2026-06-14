// Authenticates Control Center → Remedy management calls via a shared admin key.
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

module.exports = function adminApiKey(req, res, next) {
  if (!ADMIN_API_KEY) {
    return res.status(503).json({ message: "Admin API not configured." });
  }
  const provided = req.headers["x-admin-key"];
  if (!provided || provided !== ADMIN_API_KEY) {
    return res.status(401).json({ message: "Invalid or missing admin API key." });
  }
  next();
};
