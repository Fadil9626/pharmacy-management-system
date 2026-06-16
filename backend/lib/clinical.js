// Clinical safety checks for a cart / prescription: a customer's recorded
// allergies against the items, and known drug-drug interactions between items.
// Matching is substring-based against product name + generic + category — simple
// but effective for a retail formulary; it's an aid, not a substitute for the
// pharmacist's judgement.
async function check(db, productIds, customerId) {
  const ids = [...new Set((productIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return { allergies: [], interactions: [], conditions: [] };

  const prods = (await db.query(
    "SELECT id, name, generic_name, category, pregnancy_risk, lactation_risk, contraindications FROM products WHERE id = ANY($1)", [ids]
  )).rows;
  const textOf = (p) => [p.name, p.generic_name, p.category].filter(Boolean).join(" ").toLowerCase();

  // Allergies + condition/pregnancy/lactation flags (need the customer record)
  const allergies = [];
  const conditions = [];
  if (customerId) {
    const c = (await db.query("SELECT allergies, conditions FROM customers WHERE id = $1", [Number(customerId)])).rows[0];
    const allergens = Array.isArray(c?.allergies) ? c.allergies : [];
    const conds = (Array.isArray(c?.conditions) ? c.conditions : []).map((x) => String(x).toLowerCase().trim());
    const has = (...keys) => keys.some((k) => conds.includes(k));
    for (const p of prods) {
      const t = textOf(p);
      for (const a of allergens) {
        const term = String(a || "").toLowerCase().trim();
        if (term && t.includes(term)) allergies.push({ product: p.name, allergen: a });
      }
      // Pregnancy / lactation risk
      if (p.pregnancy_risk && p.pregnancy_risk !== "none" && has("pregnant", "pregnancy"))
        conditions.push({ product: p.name, severity: p.pregnancy_risk === "avoid" ? "severe" : "moderate", note: `${p.pregnancy_risk === "avoid" ? "Avoid" : "Caution"} in pregnancy` });
      if (p.lactation_risk && p.lactation_risk !== "none" && has("breastfeeding", "lactating", "lactation"))
        conditions.push({ product: p.name, severity: p.lactation_risk === "avoid" ? "severe" : "moderate", note: `${p.lactation_risk === "avoid" ? "Avoid" : "Caution"} while breastfeeding` });
      // Drug–disease contraindications
      const cis = Array.isArray(p.contraindications) ? p.contraindications : [];
      for (const ci of cis) {
        const key = String(ci).toLowerCase().trim();
        if (key && conds.includes(key)) conditions.push({ product: p.name, severity: "severe", note: `Contraindicated in ${ci}` });
      }
    }
  }

  // Interactions
  const rules = (await db.query("SELECT term_a, term_b, severity, note FROM drug_interactions")).rows;
  const matching = (term) => prods.filter((p) => textOf(p).includes(String(term).toLowerCase()));
  const seen = new Set();
  const interactions = [];
  for (const r of rules) {
    for (const a of matching(r.term_a)) {
      for (const b of matching(r.term_b)) {
        if (a.id === b.id) continue;
        const key = [a.id, b.id].sort((x, y) => x - y).join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        interactions.push({ a: a.name, b: b.name, severity: r.severity, note: r.note });
      }
    }
  }
  // Cart-level risk flags (independent of any customer) — drives the walk-in
  // "is the patient pregnant / affected?" prompt when no customer is attached.
  const flags = prods
    .filter((p) => (p.pregnancy_risk && p.pregnancy_risk !== "none") ||
                   (p.lactation_risk && p.lactation_risk !== "none") ||
                   (Array.isArray(p.contraindications) && p.contraindications.length))
    .map((p) => ({
      product: p.name,
      pregnancy: p.pregnancy_risk && p.pregnancy_risk !== "none" ? p.pregnancy_risk : null,
      lactation: p.lactation_risk && p.lactation_risk !== "none" ? p.lactation_risk : null,
      contraindications: Array.isArray(p.contraindications) ? p.contraindications : [],
    }));

  return { allergies, interactions, conditions, flags };
}

module.exports = { check };
