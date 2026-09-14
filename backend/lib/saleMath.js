// ── What a sale comes to ────────────────────────────────────────────────────
//
// Extracted from salesController so it can be tested without a database, a
// transaction, a till or a logged-in user. It was correct there; it was just
// unreachable by any test, which is a different kind of risk. Arithmetic that
// nobody can check is arithmetic nobody does check — and a POS gets this wrong
// in front of a customer holding cash.
//
// Money is held in ordinary JS numbers and rounded to 2dp at every step that
// produces a figure somebody sees or is charged. That is not ideal — minor
// units as integers would be better — but it is what the schema and the rest
// of this product already assume, and quietly changing the representation
// underneath live data would be a far bigger risk than the rounding.

/** One line's money, rounded the way the receipt will show it. */
const lineTotal = (qty, unitPrice) =>
  Math.round(Number(qty) * Number(unitPrice) * 100) / 100;

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Totals for a cart.
 *
 * Deliberately mirrors the order the controller applied:
 *   subtotal  sum of already-rounded line totals
 *   discount  manual + promotional, never more than the subtotal
 *   taxable   subtotal less discount, never below zero
 *   tax       charged on the DISCOUNTED amount, not the subtotal
 *   total     taxable + tax
 *
 * Tax on the discounted amount is the part worth stating out loud: charge it on
 * the subtotal instead and every discounted sale overcharges, by an amount too
 * small for anyone to query and large enough to matter across a year.
 */
function totalsFor({ lines = [], manualDiscount = 0, promoDiscount = 0, taxPercent = 0 } = {}) {
  const subtotal = round2(
    lines.reduce((s, l) => s + (l.line_total != null ? Number(l.line_total) : lineTotal(l.qty, l.unit_price)), 0)
  );

  // A negative discount would be a price increase wearing a discount's name.
  const manual = Math.max(0, Number(manualDiscount) || 0);
  const promo = Math.max(0, Number(promoDiscount) || 0);
  const discount = round2(Math.min(subtotal, manual + promo));

  const taxable = round2(Math.max(0, subtotal - discount));
  const pct = Math.max(0, Number(taxPercent) || 0);
  const tax = round2(taxable * (pct / 100));

  // Rounded, not left as taxable + tax. Both halves are already 2dp, but adding
  // two such numbers in binary floating point can still land on 22.990000000000002,
  // and that is what would be written to the ledger and printed on the receipt.
  const total = round2(taxable + tax);

  return { subtotal, discount, taxable, tax, total };
}

module.exports = { totalsFor, lineTotal, round2 };
