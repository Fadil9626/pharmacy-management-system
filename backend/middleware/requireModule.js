const pool = require("../config/db");

let cache = { at: 0, map: {} };
async function loadModules() {
  if (Date.now() - cache.at < 15000) return cache.map;
  const { rows } = await pool.query("SELECT module_key, is_enabled FROM app_modules");
  cache = { at: Date.now(), map: Object.fromEntries(rows.map((r) => [r.module_key, r.is_enabled])) };
  return cache.map;
}

// Gate a route behind a licensable module (the SaaS switch).
function requireModule(key) {
  return async (req, res, next) => {
    try {
      const map = await loadModules();
      if (map[key] === true) return next();
      return res.status(403).json({ message: `The '${key}' module is not enabled on this plan.` });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  };
}
requireModule.invalidate = () => { cache.at = 0; };

module.exports = { requireModule };
