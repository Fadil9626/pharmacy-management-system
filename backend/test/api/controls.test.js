/**
 * Controls: a manager approves large refunds, pay-outs, write-offs and count
 * differences; transfers travel until the receiving branch confirms them.
 * Settings changed here are put back after.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./_harness");

let skip, saved;
const COLS = ["approve_refund_over", "approve_payout_over", "approve_adjust_units_over", "approve_count_value_over", "transfers_need_receiving"];
test.before(async () => {
  skip = await h.available();
  if (skip) return;
  saved = (await h.db().query(`SELECT ${COLS.join(", ")} FROM settings WHERE id = 1`)).rows[0];
  await h.db().query(`UPDATE settings SET approve_refund_over = 100, approve_payout_over = 50,
    approve_adjust_units_over = 10, approve_count_value_over = 20, transfers_need_receiving = true WHERE id = 1`);
});
test.after(async () => {
  if (!skip) await h.db().query(`UPDATE settings SET ${COLS.map((c, i) => `${c} = $${i + 1}`).join(", ")} WHERE id = 1`, COLS.map((c) => saved[c]));
  await h.cleanup();
});

const creds = (u) => ({ email: u.email, password: h.PASSWORD });

test("a large refund needs a manager: not the person refunding, and not a cashier", async (t) => {
  if (skip) return t.skip(skip);
  const ph = await h.staff("pharmacist");
  const token = await h.signIn(ph);
  await h.openTill(token);
  const p = await h.product({ price: 60 });
  const sale = await h.api("POST", "/api/sales", { token, body: { items: [{ product_id: p.id, qty: 3 }], payment_method: "cash" } });
  const line = (await h.api("GET", `/api/sales/${sale.body.id}`, { token })).body.items[0].id;
  const refund = (approval) => h.api("POST", `/api/sales/${sale.body.id}/return`, { token, body: { items: [{ sale_item_id: line, qty: 2 }], refund_method: "cash", approval } });

  let r = await refund();
  assert.equal(r.status, 403);
  assert.equal(r.body.code, "APPROVAL_REQUIRED");
  r = await refund(creds(ph));
  assert.equal(r.body.code, "APPROVAL_INVALID", "nobody approves their own refund");
  r = await refund(creds(await h.staff("cashier")));
  assert.equal(r.body.code, "APPROVAL_INVALID", "a cashier can not approve");
  const m = await h.staff("manager");
  r = await refund({ email: m.email, password: "wrong" });
  assert.equal(r.body.code, "APPROVAL_INVALID");
  r = await refund(creds(m));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const row = (await h.db().query("SELECT approved_by FROM sale_returns WHERE id = $1", [r.body.id])).rows[0];
  assert.equal(row.approved_by, m.id);
});

test("a small refund needs no approval", async (t) => {
  if (skip) return t.skip(skip);
  const ph = await h.staff("pharmacist");
  const token = await h.signIn(ph);
  await h.openTill(token);
  const p = await h.product({ price: 10 });
  const sale = await h.api("POST", "/api/sales", { token, body: { items: [{ product_id: p.id, qty: 1 }], payment_method: "cash" } });
  const line = (await h.api("GET", `/api/sales/${sale.body.id}`, { token })).body.items[0].id;
  assert.equal((await h.api("POST", `/api/sales/${sale.body.id}/return`, { token, body: { items: [{ sale_item_id: line, qty: 1 }], refund_method: "cash" } })).status, 201);
});

test("pay-outs, write-offs and stock-count differences above the limits need approval", async (t) => {
  if (skip) return t.skip(skip);
  const a = await h.staff("manager");
  const b = await h.staff("manager");
  const token = await h.signIn(a);
  await h.openTill(token);
  // pay-out
  assert.equal((await h.api("POST", "/api/finance/cash", { token, body: { type: "payout", amount: 60 } })).body.code, "APPROVAL_REQUIRED");
  assert.equal((await h.api("POST", "/api/finance/cash", { token, body: { type: "payout", amount: 60, approval: creds(b) } })).status, 201);
  assert.equal((await h.api("POST", "/api/finance/cash", { token, body: { type: "payout", amount: 20 } })).status, 201, "under the limit");
  // write-off
  const p = await h.product({ qty: 50, cost: 5 });
  assert.equal((await h.api("POST", "/api/stock/adjust", { token, body: { batch_id: p.batch_id, qty_change: -12, reason: "damaged" } })).body.code, "APPROVAL_REQUIRED");
  assert.equal((await h.api("POST", "/api/stock/adjust", { token, body: { batch_id: p.batch_id, qty_change: -12, reason: "damaged", approval: creds(b) } })).status, 200);
  // count: 38 on the shelf, counted 33, so 5 x 5 = 25 worth of difference
  assert.equal((await h.api("POST", "/api/stock-counts", { token, body: { branch_id: 1, items: [{ product_id: p.id, counted_qty: 33 }] } })).body.code, "APPROVAL_REQUIRED");
  const qty = (await h.db().query("SELECT quantity FROM product_batches WHERE id = $1", [p.batch_id])).rows[0].quantity;
  assert.equal(qty, 38, "a refused count changed nothing");
  assert.equal((await h.api("POST", "/api/stock-counts", { token, body: { branch_id: 1, items: [{ product_id: p.id, counted_qty: 33 }], approval: creds(b) } })).status, 201);
});

test("a transfer is on its way until the receiving branch confirms it", async (t) => {
  if (skip) return t.skip(skip);
  const m = await h.staff("manager", 1);
  const token = await h.signIn(m);
  const p = await h.product({ branchId: 1, qty: 20 });
  const shelf = async (branch) => (await h.db().query("SELECT COALESCE(SUM(quantity),0)::int n FROM product_batches WHERE product_id = $1 AND branch_id = $2", [p.id, branch])).rows[0].n;

  const tr = await h.api("POST", "/api/transfers", { token, body: { from_branch_id: 1, to_branch_id: 2, items: [{ product_id: p.id, qty: 8 }] } });
  assert.equal(tr.body.status, "in_transit");
  assert.equal(await shelf(1), 12);
  assert.equal(await shelf(2), 0, "not on the other shelf until someone there confirms it");

  // Staff at the sending branch can not receive it; staff at the receiving branch can.
  const here = await h.staff("pharmacist", 1);
  assert.equal((await h.api("POST", `/api/transfers/${tr.body.id}/receive`, { token: await h.signIn(here) })).status, 404);
  const there = await h.staff("pharmacist", 2);
  const tt = await h.signIn(there);
  const incoming = (await h.api("GET", "/api/transfers?incoming=1", { token: tt })).body;
  assert.ok(incoming.some((x) => x.id === tr.body.id), "listed as on its way to branch 2");
  assert.equal((await h.api("POST", `/api/transfers/${tr.body.id}/receive`, { token: tt })).status, 200);
  assert.equal(await shelf(2), 8);
  assert.equal((await h.api("POST", `/api/transfers/${tr.body.id}/receive`, { token: tt })).status, 400, "only once");
});

test("a transfer called back puts the stock back where it came from", async (t) => {
  if (skip) return t.skip(skip);
  const m = await h.staff("manager", 1);
  const token = await h.signIn(m);
  const p = await h.product({ branchId: 1, qty: 20 });
  const tr = await h.api("POST", "/api/transfers", { token, body: { from_branch_id: 1, to_branch_id: 2, items: [{ product_id: p.id, qty: 5 }] } });
  assert.equal((await h.api("POST", `/api/transfers/${tr.body.id}/cancel`, { token })).status, 200);
  const q = (await h.db().query("SELECT quantity FROM product_batches WHERE id = $1", [p.batch_id])).rows[0].quantity;
  assert.equal(q, 20, "back in the same batch");
  const card = (await h.api("GET", `/api/products/${p.id}/stock-card?branch_id=all`, { token })).body;
  assert.equal(card.balance, card.on_shelf);
  assert.ok(card.ledger.some((x) => x.type === "transfer_cancelled"));
});
