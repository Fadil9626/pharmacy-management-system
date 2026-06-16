// Evaluate active promotions against a set of sale lines and return the total
// discount + a per-promotion breakdown. Server-authoritative: used both by the
// POS preview and by createSale (which never trusts a client-sent discount).
//
// lines: [{ product_id, qty, unit_price, line_total? }]
async function evaluate(db, lines) {
  const clean = (lines || [])
    .map((l) => ({
      product_id: Number(l.product_id),
      qty: Number(l.qty) || 0,
      unit_price: Number(l.unit_price) || 0,
      line_total: l.line_total != null ? Number(l.line_total) : (Number(l.qty) || 0) * (Number(l.unit_price) || 0),
    }))
    .filter((l) => l.product_id && l.qty > 0);
  if (!clean.length) return { discount: 0, applied: [] };

  // Map products -> category for category-scoped rules.
  const ids = [...new Set(clean.map((l) => l.product_id))];
  const cats = await db.query("SELECT id, category_id FROM products WHERE id = ANY($1)", [ids]);
  const catOf = Object.fromEntries(cats.rows.map((r) => [r.id, r.category_id]));

  const { rows: promos } = await db.query(
    `SELECT * FROM promotions
     WHERE is_active = true
       AND (starts_at IS NULL OR starts_at <= CURRENT_DATE)
       AND (ends_at   IS NULL OR ends_at   >= CURRENT_DATE)
     ORDER BY id`
  );

  const subtotal = clean.reduce((s, l) => s + l.line_total, 0);
  const matches = (p, l) => {
    if (p.scope === "all") return true;
    if (p.scope === "category") return p.category_id && catOf[l.product_id] === p.category_id;
    if (p.scope === "products") return Array.isArray(p.product_ids) && p.product_ids.map(Number).includes(l.product_id);
    return false;
  };

  let discount = 0;
  const applied = [];
  for (const p of promos) {
    const matching = clean.filter((l) => matches(p, l));
    if (p.scope !== "all" && !matching.length) continue;
    const base = p.scope === "all" ? subtotal : matching.reduce((s, l) => s + l.line_total, 0);
    let amount = 0;

    if (p.type === "percent") {
      amount = base * (Number(p.value) / 100);
    } else if (p.type === "amount") {
      if (subtotal + 1e-9 >= Number(p.min_subtotal || 0)) amount = Math.min(Number(p.value), base);
    } else if (p.type === "bxgy") {
      const buy = Number(p.buy_qty) || 0, get = Number(p.get_qty) || 0;
      if (buy > 0 && get > 0) {
        // Expand matching items to individual unit prices; the cheapest units in
        // each (buy+get) group are the free ones.
        const units = [];
        for (const l of matching) for (let i = 0; i < l.qty; i++) units.push(l.unit_price);
        units.sort((a, b) => a - b);
        const freeCount = Math.floor(units.length / (buy + get)) * get;
        amount = units.slice(0, freeCount).reduce((s, x) => s + x, 0);
      }
    }

    amount = Math.round(Math.max(0, amount) * 100) / 100;
    if (amount > 0) { discount += amount; applied.push({ promotion_id: p.id, name: p.name, amount }); }
  }

  // Never discount below zero.
  discount = Math.min(Math.round(discount * 100) / 100, subtotal);
  return { discount, applied };
}

module.exports = { evaluate };
