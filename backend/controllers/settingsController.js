const pool = require("../config/db");
const { logAudit } = require("../lib/audit");

exports.get = async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM settings WHERE id = 1");
    res.json(rows[0] || {});
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const numOrNull = (v) => (v != null && v !== "" ? Number(v) : null);

exports.update = async (req, res) => {
  const {
    pharmacy_name, currency_code, currency_symbol,
    tax_percent, receipt_footer, receipt_header, address, phone, email, website,
    base_currency, pricing_mode,
    near_expiry_months, low_stock_default, loyalty_points_per_unit,
    logo, theme, brand_color, theme_config,
  } = req.body || {};
  if (pricing_mode && !["fixed", "market"].includes(pricing_mode))
    return res.status(400).json({ message: "Invalid pricing mode" });
  try {
    const { rows } = await pool.query(
      `UPDATE settings SET
         pharmacy_name           = COALESCE($1, pharmacy_name),
         currency_code           = COALESCE($2, currency_code),
         currency_symbol         = COALESCE($3, currency_symbol),
         tax_percent             = COALESCE($4, tax_percent),
         receipt_footer          = $5,
         address                 = $6,
         phone                   = $7,
         base_currency           = COALESCE($8, base_currency),
         pricing_mode            = COALESCE($9, pricing_mode),
         email                   = $10,
         website                 = $11,
         receipt_header          = $12,
         near_expiry_months      = COALESCE($13, near_expiry_months),
         low_stock_default       = COALESCE($14, low_stock_default),
         loyalty_points_per_unit = COALESCE($15, loyalty_points_per_unit),
         logo                    = CASE WHEN $16 = '' THEN NULL WHEN $16 IS NULL THEN logo ELSE $16 END,
         theme                   = COALESCE($17, theme),
         brand_color             = COALESCE($18, brand_color),
         theme_config            = COALESCE($19::jsonb, theme_config),
         updated_at              = NOW()
       WHERE id = 1 RETURNING *`,
      [
        pharmacy_name || null,
        currency_code || null,
        currency_symbol || null,
        numOrNull(tax_percent),
        receipt_footer ?? null,
        address ?? null,
        phone ?? null,
        base_currency || null,
        pricing_mode || null,
        email ?? null,
        website ?? null,
        receipt_header ?? null,
        numOrNull(near_expiry_months),
        numOrNull(low_stock_default),
        numOrNull(loyalty_points_per_unit),
        logo === undefined ? null : logo,   // "" clears the logo; undefined/null keeps it
        theme || null,
        brand_color || null,
        theme_config ? JSON.stringify(theme_config) : null,
      ]
    );
    logAudit(req, "settings_update", "settings", 1, { fields: Object.keys(req.body || {}) });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
