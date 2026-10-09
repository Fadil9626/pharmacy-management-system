const pool = require("../config/db");

/**
 * The checks every way of putting stock on the shelf shares — receiving a
 * purchase order, or receiving stock directly.
 *
 * An expiry date in the past is always refused: expired stock can never be
 * sold, so receiving it only puts a number on the shelf that isn't there. A
 * missing expiry date is refused too, unless the pharmacy has switched that off
 * in Settings → Inventory (some stock, like devices, has none).
 */
async function expiryProblem(expiry, label = "") {
  const what = label ? ` for ${label}` : "";
  if (!expiry) {
    const s = (await pool.query("SELECT require_expiry_on_receive FROM settings WHERE id = 1")).rows[0];
    if (s?.require_expiry_on_receive !== false) return `Enter the expiry date${what}`;
    return null;
  }
  const d = new Date(String(expiry).slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return `The expiry date${what} isn't a date`;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  if (d < today) return `The expiry date${what} has already passed — expired stock can't be received`;
  return null;
}

module.exports = { expiryProblem };
