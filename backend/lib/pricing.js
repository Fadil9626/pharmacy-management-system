const pool = require("../config/db");

// Resolve the live pricing context: mode, base currency, and the current
// open-market rate (quote units per 1 base unit). The `market_pricing` MODULE
// flag is the switch — off = fixed pricing. Pass a pg client to read inside a
// transaction.
async function pricingContext(db = pool) {
  const s = await db.query("SELECT base_currency, currency_code FROM settings WHERE id = 1");
  const cfg = s.rows[0] || { base_currency: "USD", currency_code: "USD" };

  const m = await db.query("SELECT is_enabled FROM app_modules WHERE module_key = 'market_pricing'");
  const moduleOn = m.rows[0]?.is_enabled === true;

  let rate = null;
  if (moduleOn) {
    const r = await db.query(
      `SELECT rate FROM exchange_rates
       WHERE source = 'market' AND base_currency = $1 AND quote_currency = $2
       ORDER BY created_at DESC LIMIT 1`,
      [cfg.base_currency, cfg.currency_code]
    );
    rate = r.rows[0] ? Number(r.rows[0].rate) : null;
  }
  return {
    mode: moduleOn ? "market" : "fixed",
    base: cfg.base_currency,
    quote: cfg.currency_code,
    rate,
    // market pricing only kicks in when the module is on AND a rate exists
    marketActive: moduleOn && rate > 0,
  };
}

// Effective unit price in LEDGER/local currency.
// Market mode + a base-currency anchor → derive from the live rate; otherwise
// fall back to the locally-recorded price (batch selling price).
function effectivePrice(ctx, basePrice, localPrice) {
  const bp = Number(basePrice);
  if (ctx.marketActive && bp > 0) {
    return Math.round(bp * ctx.rate * 100) / 100;
  }
  return Number(localPrice || 0);
}

module.exports = { pricingContext, effectivePrice };
