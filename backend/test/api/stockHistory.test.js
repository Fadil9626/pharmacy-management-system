/**
 * Stock history: every change to a batch is recorded, labelled, and adds up to
 * what is on the shelf. The controlled-drug register reads from it.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./_harness");

let skip;
test.before(async () => { skip = await h.available(); });
test.after(() => h.cleanup());

const nextYear = () => new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);

async function blankProduct(controlled = false) {
  const { rows } = await h.db().query(
    "INSERT INTO products (name, unit, is_controlled, base_price) VALUES ($1,'tab',$2,0) RETURNING id",
    [`History ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, controlled]);
  return rows[0].id;
}

test("the controlled register: receive 100, dispense 30 — the balance is 70, and the prescriber is on the line", async (t) => {
  if (skip) return t.skip(skip);
  const m = await h.staff("manager");
  const token = await h.signIn(m);
  await h.openTill(token);
  const pid = await blankProduct(true);
  const rec = await h.api("POST", "/api/stock/receive", { token, body: { product_id: pid, quantity: 100, cost_price: 2, selling_price: 5, batch_no: "CD1", expiry_date: nextYear(), branch_id: 1 } });
  assert.equal(rec.status, 201, JSON.stringify(rec.body));
  const sale = await h.api("POST", "/api/sales", { token, body: {
    items: [{ product_id: pid, qty: 30 }], payment_method: "cash", customer_name: "Patient A",
    prescriber_name: "Dr Kamara", prescriber_license: "SL-MD-0042", branch_id: 1 } });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));

  const reg = (await h.api("GET", `/api/controlled/${pid}/register?branch_id=1`, { token })).body;
  assert.equal(reg.balance, 70, "it used to say 40");
  assert.equal(reg.on_shelf, 70);
  assert.equal(reg.total_in, 100);
  assert.equal(reg.total_out, 30);
  const dispensed = reg.ledger.find((x) => x.type === "sale");
  assert.equal(dispensed.ref, sale.body.receipt_no);
  assert.equal(dispensed.license, "SL-MD-0042");
  assert.equal(dispensed.party, "Patient A");
});

test("every kind of movement is recorded and labelled, and the history adds up to the shelf", async (t) => {
  if (skip) return t.skip(skip);
  const m = await h.staff("manager");
  const token = await h.signIn(m);
  await h.openTill(token);
  const pid = await blankProduct();
  const { rows: sup } = await h.db().query("INSERT INTO suppliers (name) VALUES ('History supplier') RETURNING id");

  // received (via a purchase order, in two parts)
  const po = await h.api("POST", "/api/purchase-orders", { token, body: { supplier_id: sup[0].id, status: "ordered", branch_id: 1, items: [{ product_id: pid, qty_ordered: 50, cost_price: 1, selling_price: 3 }] } });
  const line = (await h.api("GET", `/api/purchase-orders/${po.body.id}`, { token })).body.items[0].id;
  for (const q of [30, 20]) {
    const r = await h.api("POST", `/api/purchase-orders/${po.body.id}/receive`, { token, body: { lines: [{ id: line, qty_received: q, expiry_date: nextYear(), batch_no: `P${q}` }] } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  // sale + a return to stock
  const sale = await h.api("POST", "/api/sales", { token, body: { items: [{ product_id: pid, qty: 5 }], payment_method: "cash", branch_id: 1 } });
  const item = (await h.api("GET", `/api/sales/${sale.body.id}`, { token })).body.items[0].id;
  assert.equal((await h.api("POST", `/api/sales/${sale.body.id}/return`, { token, body: { items: [{ sale_item_id: item, qty: 2 }], refund_method: "cash", restock: true } })).status, 201);
  // transfer to another branch
  assert.equal((await h.api("POST", "/api/transfers", { token, body: { from_branch_id: 1, to_branch_id: 2, items: [{ product_id: pid, qty: 4 }] } })).status, 201);
  // adjustment, count
  const batch = (await h.db().query("SELECT id FROM product_batches WHERE product_id = $1 AND branch_id = 1 AND quantity > 0 ORDER BY id LIMIT 1", [pid])).rows[0].id;
  assert.equal((await h.api("POST", "/api/stock/adjust", { token, body: { batch_id: batch, qty_change: -1, reason: "damaged", note: "dropped" } })).status, 200);
  const onHand = (await h.db().query("SELECT SUM(quantity)::int n FROM product_batches WHERE product_id = $1 AND branch_id = 1", [pid])).rows[0].n;
  assert.equal((await h.api("POST", "/api/stock-counts", { token, body: { branch_id: 1, items: [{ product_id: pid, counted_qty: onHand - 1 }] } })).status, 201);
  // return to supplier
  assert.equal((await h.api("POST", "/api/rtv", { token, body: { supplier_id: sup[0].id, branch_id: 1, reason: "damaged", items: [{ batch_id: batch, qty: 1 }] } })).status, 201);

  const card = (await h.api("GET", `/api/products/${pid}/stock-card?branch_id=all`, { token })).body;
  const kinds = new Set(card.ledger.map((x) => x.type));
  for (const k of ["received", "sale", "return", "transfer_out", "transfer_in", "adjustment", "count", "return_to_supplier"]) {
    assert.ok(kinds.has(k), `missing ${k}: ${[...kinds]}`);
  }
  assert.ok(!kinds.has("unlabelled"), "every change says what it was");
  assert.equal(card.balance, card.on_shelf, "the history adds up to the shelf");
  assert.equal(card.balance, 50 - 5 + 2 - 1 - 1 - 1, "transfers move stock between branches, not out of the business");
  assert.ok(card.ledger.find((x) => x.type === "received").party === "History supplier");
});

test("expired stock is not transferred to another branch", async (t) => {
  if (skip) return t.skip(skip);
  const m = await h.staff("manager");
  const token = await h.signIn(m);
  const pid = await blankProduct();
  await h.db().query(
    "INSERT INTO product_batches (product_id, branch_id, batch_no, expiry_date, quantity, cost_price, selling_price) VALUES ($1,1,'OLD',CURRENT_DATE - 10,20,1,2)", [pid]);
  const r = await h.api("POST", "/api/transfers", { token, body: { from_branch_id: 1, to_branch_id: 2, items: [{ product_id: pid, qty: 5 }] } });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /Insufficient stock/);
});
