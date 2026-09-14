const { test } = require("node:test");
const assert = require("node:assert/strict");
const { totalsFor, lineTotal, round2 } = require("../lib/saleMath");

const L = (qty, unit_price) => ({ qty, unit_price, line_total: lineTotal(qty, unit_price) });

test("a plain sale adds up", () => {
  const t = totalsFor({ lines: [L(2, 5), L(1, 3.5)], taxPercent: 0 });
  assert.equal(t.subtotal, 13.5);
  assert.equal(t.discount, 0);
  assert.equal(t.total, 13.5);
});

test("tax is charged on the discounted amount, not the subtotal", () => {
  // 100 subtotal, 10 off, 15% tax. On the discount: 90 + 13.50 = 103.50.
  // On the subtotal it would be 90 + 15 = 105 — an overcharge of 1.50 that
  // nobody at the counter would ever query.
  const t = totalsFor({ lines: [L(1, 100)], manualDiscount: 10, taxPercent: 15 });
  assert.equal(t.taxable, 90);
  assert.equal(t.tax, 13.5);
  assert.equal(t.total, 103.5);
});

test("a discount larger than the cart cannot make the total negative", () => {
  const t = totalsFor({ lines: [L(1, 20)], manualDiscount: 500, taxPercent: 15 });
  assert.equal(t.discount, 20);
  assert.equal(t.taxable, 0);
  assert.equal(t.tax, 0);
  assert.equal(t.total, 0);
});

test("manual and promotional discounts stack, still capped at the subtotal", () => {
  const t = totalsFor({ lines: [L(1, 30)], manualDiscount: 20, promoDiscount: 25, taxPercent: 0 });
  assert.equal(t.discount, 30);
  assert.equal(t.total, 0);
});

test("a negative discount is ignored, never treated as a surcharge", () => {
  const t = totalsFor({ lines: [L(1, 10)], manualDiscount: -5, taxPercent: 0 });
  assert.equal(t.discount, 0);
  assert.equal(t.total, 10);
});

test("a negative tax rate is ignored", () => {
  const t = totalsFor({ lines: [L(1, 10)], taxPercent: -20 });
  assert.equal(t.tax, 0);
  assert.equal(t.total, 10);
});

test("the total never carries floating-point noise", () => {
  // 0.1 + 0.2 is the classic; run a spread of awkward prices and rates and
  // assert every total is exactly 2dp.
  for (const price of [0.1, 0.2, 0.3, 1.005, 2.675, 19.99, 33.33]) {
    for (const pct of [0, 5, 7.5, 15, 17.5]) {
      for (const qty of [1, 3, 7]) {
        const t = totalsFor({ lines: [L(qty, price)], taxPercent: pct });
        assert.equal(t.total, round2(t.total), `total ${t.total} for ${qty}x${price} @ ${pct}%`);
        assert.equal(t.tax, round2(t.tax));
        assert.equal(t.subtotal, round2(t.subtotal));
      }
    }
  }
});

test("line totals round per line, the way the receipt prints them", () => {
  // 3 × 0.335 = 1.005 → 1.01 on the line, and the subtotal follows the lines
  // rather than being recomputed from raw prices. A subtotal that disagrees
  // with the lines above it is the version customers notice.
  assert.equal(lineTotal(3, 0.335), 1.01);
  const t = totalsFor({ lines: [L(3, 0.335), L(3, 0.335)] });
  assert.equal(t.subtotal, 2.02);
});

test("splitting one product across batches gives the same total as one line", () => {
  // FEFO can split a quantity across batches at the same price; the customer
  // must not pay a different amount because of how stock happened to be stored.
  const oneLine = totalsFor({ lines: [L(10, 2.5)], taxPercent: 15 });
  const split = totalsFor({ lines: [L(4, 2.5), L(6, 2.5)], taxPercent: 15 });
  assert.deepEqual(split, oneLine);
});

test("an empty cart is zero, not NaN", () => {
  const t = totalsFor({ lines: [], taxPercent: 15 });
  assert.deepEqual(t, { subtotal: 0, discount: 0, taxable: 0, tax: 0, total: 0 });
});

test("called with nothing at all, it still returns zeros", () => {
  assert.deepEqual(totalsFor(), { subtotal: 0, discount: 0, taxable: 0, tax: 0, total: 0 });
});
