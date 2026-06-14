const pool = require("../config/db");

exports.list = async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT module_key, display_name, is_enabled, is_core, sort_order FROM app_modules ORDER BY sort_order"
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
