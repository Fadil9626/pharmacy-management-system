const { userCan } = require("../lib/permissions");

// Gate a route behind a granular permission. Owners always pass.
module.exports = function requirePermission(key) {
  return async (req, res, next) => {
    try {
      if (await userCan(req.user.role, key)) return next();
      return res.status(403).json({ message: "You don't have permission to perform this action." });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  };
};
