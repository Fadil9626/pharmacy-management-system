const pool = require("../config/db");
const { logAudit } = require("../lib/audit");
const { check } = require("../lib/clinical");

const SEV = ["minor", "moderate", "severe"];

// Live safety check for a cart / prescription.
exports.check = async (req, res) => {
  try {
    const items = req.body?.items || [];
    const ids = items.map((i) => i.product_id ?? i);
    res.json(await check(pool, ids, req.body?.customer_id));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ── Interaction rule management (owner/manager) ─────────────
exports.listInteractions = async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM drug_interactions ORDER BY severity DESC, term_a");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.addInteraction = async (req, res) => {
  const { term_a, term_b, severity, note } = req.body || {};
  if (!term_a || !term_b) return res.status(400).json({ message: "Both drug terms are required" });
  try {
    const { rows } = await pool.query(
      "INSERT INTO drug_interactions (term_a, term_b, severity, note) VALUES (lower($1),lower($2),$3,$4) RETURNING id",
      [term_a.trim(), term_b.trim(), SEV.includes(severity) ? severity : "moderate", note || null]
    );
    logAudit(req, "interaction_add", "drug_interaction", rows[0].id, { term_a, term_b });
    res.status(201).json({ id: rows[0].id });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.removeInteraction = async (req, res) => {
  try {
    await pool.query("DELETE FROM drug_interactions WHERE id = $1", [Number(req.params.id)]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
