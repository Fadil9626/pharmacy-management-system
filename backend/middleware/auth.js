const jwt = require("jsonwebtoken");

function protect(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Not authenticated" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { id, role, branch_id, full_name }
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || (roles.length && !roles.includes(req.user.role))) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
}

module.exports = { protect, authorize };
