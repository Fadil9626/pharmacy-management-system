const pool = require("../config/db");
const { logAudit } = require("../lib/audit");

exports.get = async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM settings WHERE id = 1");
    const s = rows[0] || {};
    // /api/settings is readable by every authenticated user (drives currency,
    // branding, etc.) — never ship notification provider secrets here. Manage
    // them via the owner-only /api/notifications/config endpoint.
    delete s.notify_config;
    res.json(s);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const numOrNull = (v) => (v != null && v !== "" ? Number(v) : null);
const nonNegOrNull = (v) => { const n = numOrNull(v); return n != null && Number.isFinite(n) && n >= 0 ? n : null; };

// A field the request leaves out keeps its value; an empty string clears it.
// Text fields used to be set to whatever was sent, so a save that sent only
// one field (the Pricing page sends just the base currency) wiped the address,
// phone, email, website and receipt text.
exports.update = async (req, res) => {
  const {
    pharmacy_name, currency_code, currency_symbol,
    tax_percent, receipt_footer, receipt_header, address, phone, email, website,
    base_currency, pricing_mode,
    near_expiry_months, low_stock_default, loyalty_points_per_unit, loyalty_redeem_value,
    logo, theme, brand_color, theme_config,
    receipt_paper, label_size, barcode_prefix, barcode_auto, require_expiry_on_receive,
    approve_refund_over, approve_payout_over, approve_adjust_units_over, approve_count_value_over,
    transfers_need_receiving,
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
         receipt_footer          = COALESCE($5, receipt_footer),
         address                 = COALESCE($6, address),
         phone                   = COALESCE($7, phone),
         base_currency           = COALESCE($8, base_currency),
         pricing_mode            = COALESCE($9, pricing_mode),
         email                   = COALESCE($10, email),
         website                 = COALESCE($11, website),
         receipt_header          = COALESCE($12, receipt_header),
         near_expiry_months      = COALESCE($13, near_expiry_months),
         low_stock_default       = COALESCE($14, low_stock_default),
         loyalty_points_per_unit = COALESCE($15, loyalty_points_per_unit),
         logo                    = CASE WHEN $16 = '' THEN NULL WHEN $16 IS NULL THEN logo ELSE $16 END,
         theme                   = COALESCE($17, theme),
         brand_color             = COALESCE($18, brand_color),
         theme_config            = COALESCE($19::jsonb, theme_config),
         loyalty_redeem_value    = COALESCE($20, loyalty_redeem_value),
         receipt_paper           = COALESCE($21, receipt_paper),
         label_size              = COALESCE($22, label_size),
         barcode_prefix          = CASE WHEN $23::text IS NULL THEN barcode_prefix ELSE $23::text END,
         barcode_auto            = COALESCE($24, barcode_auto),
         require_expiry_on_receive = COALESCE($25, require_expiry_on_receive),
         approve_refund_over       = COALESCE($26, approve_refund_over),
         approve_payout_over       = COALESCE($27, approve_payout_over),
         approve_adjust_units_over = COALESCE($28, approve_adjust_units_over),
         approve_count_value_over  = COALESCE($29, approve_count_value_over),
         transfers_need_receiving  = COALESCE($30, transfers_need_receiving),
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
        numOrNull(loyalty_redeem_value),
        receipt_paper || null,
        label_size || null,
        barcode_prefix === undefined ? null : barcode_prefix,
        typeof barcode_auto === "boolean" ? barcode_auto : null,
        typeof require_expiry_on_receive === "boolean" ? require_expiry_on_receive : null,
        nonNegOrNull(approve_refund_over),
        nonNegOrNull(approve_payout_over),
        nonNegOrNull(approve_adjust_units_over) == null ? null : Math.round(nonNegOrNull(approve_adjust_units_over)),
        nonNegOrNull(approve_count_value_over),
        typeof transfers_need_receiving === "boolean" ? transfers_need_receiving : null,
      ]
    );
    logAudit(req, "settings_update", "settings", 1, { fields: Object.keys(req.body || {}) });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
