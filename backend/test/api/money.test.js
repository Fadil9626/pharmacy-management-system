/**
 * Money: refunds, the till, purchase orders, customer accounts, settings.
 * Each test makes its own staff, products and customers.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./_harness");

let skip;
test.before(async () => { skip = await h.available(); });
test.after(() => h.cleanup());

async function seller(role = "pharmacist", branch = 1) {
  const u = await h.staff(role, branch);
  const token = await h.signIn(u);
  await h.openTill(token);
  return { u, token };
}

test("an account sale is refunded to the account, never as cash, and never beyond what was paid", async (t) => {
  if (skip) return t.skip(skip);
  const { token } = await seller();
  const p = await h.product({ price: 10 });
  const c = await h.customer();
  const sale = await h.api("POST", "/api/sales", { token, body: {
    items: [{ product_id: p.id, qty: 4 }], customer_id: c.id, payments: [{ method: "account", amount: 40 }] } });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));
  const detail = await h.api("GET", `/api/sales/${sale.body.id}`, { token });
  assert.deepEqual(detail.body.refundable_by_method, { account: 40 });
  const line = detail.body.items[0].id;

  const asCash = await h.api("POST", `/api/sales/${sale.body.id}/return`, { token, body: { items: [{ sale_item_id: line, qty: 1 }], refund_method: "cash" } });
  assert.equal(asCash.status, 400);
  assert.match(asCash.body.message, /paid by account/);

  const toAccount = await h.api("POST", `/api/sales/${sale.body.id}/return`, { token, body: { items: [{ sale_item_id: line, qty: 1 }], refund_method: "account" } });
  assert.equal(toAccount.status, 201, JSON.stringify(toAccount.body));

  // The statement now agrees with the balance: 40 charged, 10 refunded.
  const st = await h.api("GET", `/api/customers/${c.id}/statement`, { token });
  assert.equal(st.body.closing_balance, 30);
  assert.equal(Number(st.body.current_balance), 30);
});

test("a refund takes back the points that sale earned, in proportion", async (t) => {
  if (skip) return t.skip(skip);
  const before = (await h.db().query("SELECT loyalty_points_per_unit FROM settings WHERE id = 1")).rows[0].loyalty_points_per_unit;
  await h.db().query("UPDATE settings SET loyalty_points_per_unit = 2 WHERE id = 1");
  try {
    const { token } = await seller();
    const p = await h.product({ price: 10 });
    const c = await h.customer();
    const sale = await h.api("POST", "/api/sales", { token, body: { items: [{ product_id: p.id, qty: 2 }], customer_id: c.id, payment_method: "cash" } });
    assert.equal(sale.status, 201, JSON.stringify(sale.body));
    const pts = async () => (await h.db().query("SELECT loyalty_points FROM customers WHERE id = $1", [c.id])).rows[0].loyalty_points;
    assert.equal(await pts(), 40, "20 spent at 2 points each");
    const line = (await h.api("GET", `/api/sales/${sale.body.id}`, { token })).body.items[0].id;
    const r = await h.api("POST", `/api/sales/${sale.body.id}/return`, { token, body: { items: [{ sale_item_id: line, qty: 1 }], refund_method: "cash" } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(await pts(), 20, "half refunded takes back half the points (it used to take back 10)");
  } finally {
    await h.db().query("UPDATE settings SET loyalty_points_per_unit = $1 WHERE id = 1", [before]);
  }
});

test("a cashier can drop cash to the safe but not pay cash out", async (t) => {
  if (skip) return t.skip(skip);
  const { token } = await seller("cashier");
  assert.equal((await h.api("POST", "/api/finance/cash", { token, body: { type: "drop", amount: 5 } })).status, 201);
  assert.equal((await h.api("POST", "/api/finance/cash", { token, body: { type: "payout", amount: 5 } })).status, 403);
  const m = await seller("manager");
  assert.equal((await h.api("POST", "/api/finance/cash", { token: m.token, body: { type: "payout", amount: 5 } })).status, 201);
});

test("a till report is for its own cashier, or for whoever reconciles tills", async (t) => {
  if (skip) return t.skip(skip);
  const a = await seller("cashier");
  const b = await seller("cashier");
  const shift = (await h.api("GET", "/api/finance/shift/current", { token: a.token })).body.shift;
  assert.equal((await h.api("GET", `/api/finance/shifts/${shift.id}`, { token: a.token })).status, 200);
  assert.equal((await h.api("GET", `/api/finance/shifts/${shift.id}`, { token: b.token })).status, 404);
  const m = await h.staff("manager");
  assert.equal((await h.api("GET", `/api/finance/shifts/${shift.id}`, { token: await h.signIn(m) })).status, 200);
});

test("only one till can be open per person, even with two quick clicks", async (t) => {
  if (skip) return t.skip(skip);
  const u = await h.staff("cashier");
  const token = await h.signIn(u);
  const both = await Promise.all([1, 2].map(() => h.api("POST", "/api/finance/shift/open", { token, body: { opening_float: 10 } })));
  assert.deepEqual(both.map((r) => r.status).sort(), [201, 400]);
});

test("purchase orders: received in parts, owed only for what arrived", async (t) => {
  if (skip) return t.skip(skip);
  const m = await h.staff("manager");
  const token = await h.signIn(m);
  const p = await h.product({ qty: 0 });

  const asReceived = await h.api("POST", "/api/purchase-orders", { token, body: { status: "received", items: [{ product_id: p.id, qty_ordered: 10, cost_price: 3 }] } });
  assert.equal(asReceived.status, 400, "an order can't be born received");

  const po = await h.api("POST", "/api/purchase-orders", { token, body: { status: "ordered", items: [{ product_id: p.id, qty_ordered: 10, cost_price: 3 }] } });
  assert.equal(po.status, 201);
  const lineId = (await h.api("GET", `/api/purchase-orders/${po.body.id}`, { token })).body.items[0].id;
  const recv = (qty, expiry) => h.api("POST", `/api/purchase-orders/${po.body.id}/receive`, { token, body: { lines: [{ id: lineId, qty_received: qty, expiry_date: expiry, batch_no: "B1" }] } });
  const nextYear = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);

  assert.match((await recv(4, "2020-01-01")).body.message, /already passed/);
  assert.match((await recv(4, null)).body.message, /expiry date/);
  const part = await recv(4, nextYear);
  assert.equal(part.body.status, "partial");

  const payables = (await h.api("GET", "/api/purchasing/payables", { token })).body.payables || [];
  const mine = payables.find((x) => x.id === po.body.id);
  assert.equal(mine?.outstanding, 12, "4 arrived at 3 each — not the 30 ordered");
  assert.equal((await h.api("POST", `/api/purchase-orders/${po.body.id}/pay`, { token, body: { amount: 13 } })).status, 400);

  assert.match((await recv(7, nextYear)).body.message, /Only 6/);
  assert.equal((await recv(6, nextYear)).body.status, "received");
});

test("editing a customer changes only what is sent; a cashier can't change a credit limit", async (t) => {
  if (skip) return t.skip(skip);
  const c = await h.customer({ phone: "+23277111222" });
  const cashier = await h.staff("cashier");
  const token = await h.signIn(cashier);
  const r = await h.api("PATCH", `/api/customers/${c.id}`, { token, body: { name: "Renamed customer" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.phone, "+23277111222", "phone kept");
  assert.equal(r.body.email, c.email, "email kept");
  assert.equal((await h.api("PATCH", `/api/customers/${c.id}`, { token, body: { credit_limit: 99999 } })).status, 403);
});

test("a statement goes to the customer's own email, not an address in the request", async (t) => {
  if (skip) return t.skip(skip);
  const c = await h.customer();
  const m = await h.staff("manager");
  const r = await h.api("POST", `/api/customers/${c.id}/statement/send`, { token: await h.signIn(m), body: { channel: "email", to: "someone-else@test.local" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.recipient, c.email);
});

test("saving one setting keeps the others", async (t) => {
  if (skip) return t.skip(skip);
  const before = (await h.db().query("SELECT address, phone FROM settings WHERE id = 1")).rows[0];
  await h.db().query("UPDATE settings SET address = '12 Test Street', phone = '+232 76 000000' WHERE id = 1");
  try {
    const o = await h.staff("owner");
    const token = await h.signIn(o);
    const base = (await h.api("GET", "/api/settings", { token })).body.base_currency;
    assert.equal((await h.api("PUT", "/api/settings", { token, body: { base_currency: base } })).status, 200);
    const after = (await h.db().query("SELECT address, phone FROM settings WHERE id = 1")).rows[0];
    assert.deepEqual(after, { address: "12 Test Street", phone: "+232 76 000000" });
  } finally {
    await h.db().query("UPDATE settings SET address = $1, phone = $2 WHERE id = 1", [before.address, before.phone]);
  }
});

test("staff at one branch can't open or change another branch's records by number", async (t) => {
  if (skip) return t.skip(skip);
  const { token: t1 } = await seller("pharmacist", 1);
  const p = await h.product({ branchId: 1 });
  const sale = await h.api("POST", "/api/sales", { token: t1, body: { items: [{ product_id: p.id, qty: 1 }], payment_method: "cash" } });
  const parked = await h.api("POST", "/api/pos/park", { token: t1, body: { items: [{ product_id: p.id, qty: 1, price: 10 }] } });

  const other = await h.staff("pharmacist", 2);
  const t2 = await h.signIn(other);
  assert.equal((await h.api("GET", `/api/sales/${sale.body.id}`, { token: t2 })).status, 404);
  assert.equal((await h.api("GET", `/api/sales/${sale.body.id}/invoice.pdf`, { token: t2 })).status, 404);
  assert.equal((await h.api("GET", `/api/pos/parked/${parked.body.id}`, { token: t2 })).status, 404);
  assert.equal((await h.api("DELETE", `/api/pos/parked/${parked.body.id}`, { token: t2 })).status, 404);
  assert.equal((await h.api("POST", "/api/stock/adjust", { token: t2, body: { batch_id: p.batch_id, qty_change: -1, reason: "damaged" } })).status, 400);
  const qty = (await h.db().query("SELECT quantity FROM product_batches WHERE id = $1", [p.batch_id])).rows[0].quantity;
  assert.equal(qty, 99, "only the sale moved stock");
});

test("a stock count can't invent a zero-cost batch for stock with none on record", async (t) => {
  if (skip) return t.skip(skip);
  const m = await h.staff("manager");
  const token = await h.signIn(m);
  const { rows } = await h.db().query("INSERT INTO products (name, unit) VALUES ($1,'tab') RETURNING id", [`Unstocked ${Date.now()}`]);
  const r = await h.api("POST", "/api/stock-counts", { token, body: { branch_id: 1, items: [{ product_id: rows[0].id, counted_qty: 5 }] } });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /receive it into stock/);
});
