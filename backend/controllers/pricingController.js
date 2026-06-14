const pool = require("../config/db");
const { pricingContext } = require("../lib/pricing");

// GET /api/pricing — current context + latest market/official rates + history.
exports.get = async (_req, res) => {
  try {
    const ctx = await pricingContext();
    const hist = await pool.query(
      `SELECT r.id, r.base_currency, r.quote_currency, r.rate, r.source, r.note,
              r.created_at, u.full_name AS set_by
       FROM exchange_rates r LEFT JOIN users u ON r.created_by = u.id
       WHERE r.base_currency = $1 AND r.quote_currency = $2
       ORDER BY r.created_at DESC LIMIT 30`,
      [ctx.base, ctx.quote]
    );
    const latest = (src) => hist.rows.find((r) => r.source === src) || null;
    res.json({
      mode: ctx.mode,
      base_currency: ctx.base,
      quote_currency: ctx.quote,
      market_rate: latest("market"),
      official_rate: latest("official"),
      current_rate: ctx.rate,
      history: hist.rows,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// POST /api/pricing/rate — record a new market/official rate.
exports.setRate = async (req, res) => {
  const { rate, source = "market", note } = req.body || {};
  const r = Number(rate);
  if (!r || r <= 0) return res.status(400).json({ message: "A positive rate is required" });
  if (!["market", "official"].includes(source)) return res.status(400).json({ message: "Invalid rate source" });
  try {
    const ctx = await pricingContext();
    const { rows } = await pool.query(
      `INSERT INTO exchange_rates (base_currency, quote_currency, rate, source, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [ctx.base, ctx.quote, r, source, note || null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
