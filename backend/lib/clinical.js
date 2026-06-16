// Clinical safety checks for a cart / prescription: a customer's recorded
// allergies against the items, and known drug-drug interactions between items.
// Matching is substring-based against product name + generic + category — simple
// but effective for a retail formulary; it's an aid, not a substitute for the
// pharmacist's judgement.
async function check(db, productIds, customerId) {
  const ids = [...new Set((productIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return { allergies: [], interactions: [] };

  const prods = (await db.query(
    "SELECT id, name, generic_name, category FROM products WHERE id = ANY($1)", [ids]
  )).rows;
  const textOf = (p) => [p.name, p.generic_name, p.category].filter(Boolean).join(" ").toLowerCase();

  // Allergies
  const allergies = [];
  if (customerId) {
    const c = (await db.query("SELECT allergies FROM customers WHERE id = $1", [Number(customerId)])).rows[0];
    const allergens = Array.isArray(c?.allergies) ? c.allergies : [];
    for (const p of prods) {
      const t = textOf(p);
      for (const a of allergens) {
        const term = String(a || "").toLowerCase().trim();
        if (term && t.includes(term)) allergies.push({ product: p.name, allergen: a });
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
  return { allergies, interactions };
}

module.exports = { check };
