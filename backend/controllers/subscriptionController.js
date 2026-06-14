const pool = require("../config/db");
const { requireModule } = require("../middleware/requireModule");

// GET /api/subscription/remote/modules — report this instance's module states
// to the Control Center toggle UI. Mirrors the ELIMS/HMS contract.
exports.remoteGetModules = async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT module_key, display_name, is_enabled, is_core
       FROM app_modules WHERE is_core = false ORDER BY sort_order, module_key`
    );
    return res.json({
      plan_key: null,
      modules: rows.map((r) => ({
        key: r.module_key,
        label: r.display_name || r.module_key,
        enabled: r.is_enabled,
      })),
    });
  } catch (err) {
    console.error("remoteGetModules error:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
};

// PUT /api/subscription/remote/apply — apply the EXACT module set sent by the
// Control Center (per-subscriber override). Only keys this instance actually
// has are toggled; unknown keys are ignored and core modules stay enabled, so a
// push can never grant a capability the product doesn't have.
exports.remoteApplyModules = async (req, res) => {
  const sent = Array.isArray(req.body.modules) ? req.body.modules : null;
  if (!sent) return res.status(400).json({ message: "modules array is required" });

  const client = await pool.connect();
  try {
    const { rows: reg } = await client.query(
      "SELECT module_key FROM app_modules WHERE is_core = false"
    );
    const known = reg.map((r) => r.module_key);
    const valid = sent.filter((m) => known.includes(m));
    const unknown = sent.filter((m) => !known.includes(m));

    await client.query("BEGIN");
    for (const key of known) {
      await client.query("UPDATE app_modules SET is_enabled = $1 WHERE module_key = $2", [
        valid.includes(key),
        key,
      ]);
    }
    await client.query("COMMIT");
    requireModule.invalidate();

    return res.json({
      success: true,
      enabled_modules: valid,
      ignored_unknown: unknown.length ? unknown : undefined,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("remoteApplyModules error:", err.message);
    return res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
};

// PUT /api/subscription/plans/:planKey/pricing — the Control Center "Push to All
// Subscribers" syncs each plan's price/modules definition here so the instance
// knows its own tier pricing. Mirrors the ELIMS/HMS contract.
exports.updatePlanPricing = async (req, res) => {
  const { planKey } = req.params;
  const { price, original_price, currency, billing_period, description, max_users, modules } = req.body || {};
  try {
    const { rows } = await pool.query(
      `INSERT INTO subscription_plans (plan_key, price, original_price, currency, billing_period, description, max_users, modules, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (plan_key) DO UPDATE SET
         price=EXCLUDED.price, original_price=EXCLUDED.original_price, currency=EXCLUDED.currency,
         billing_period=EXCLUDED.billing_period, description=EXCLUDED.description,
         max_users=EXCLUDED.max_users, modules=EXCLUDED.modules, updated_at=NOW()
       RETURNING *`,
      [planKey, price ?? null, original_price ?? null, currency || null, billing_period || null,
       description || null, max_users ?? null, Array.isArray(modules) ? modules : null]
    );
    return res.json({ success: true, plan: rows[0] });
  } catch (e) {
    console.error("updatePlanPricing error:", e.message);
    return res.status(500).json({ message: e.message });
  }
};

// GET /api/subscription/status — lightweight liveness/state for the Control Center.
exports.status = async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS enabled FROM app_modules WHERE is_enabled = true"
    );
    return res.json({
      plan_key: null,
      status: "active",
      expires_at: null,
      enabled_modules: rows[0].enabled,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};
