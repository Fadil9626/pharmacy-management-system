/**
 * Automation: scheduled alerts and summary, alerts as things happen, and
 * reorder suggestions that know what is already on order.
 *
 * The notification settings are saved before and put back after.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./_harness");

let skip, savedCfg, savedJobs;
test.before(async () => {
  skip = await h.available();
  if (skip) return;
  savedCfg = (await h.db().query("SELECT notify_config FROM settings WHERE id = 1")).rows[0].notify_config;
  savedJobs = (await h.db().query("SELECT job, last_run FROM job_runs")).rows;
  const cfg = { ...(savedCfg || {}),
    recipients: { emails: ["ops@test.local"], phones: [] },
    events: { ...(savedCfg?.events || {}), till_variance: true, large_refund: true, daily_summary: true, low_stock: true, near_expiry: false, refill_due: false, overdue_accounts: false },
    thresholds: { till_variance: 50, large_refund: 100, overdue_days: 30 },
    schedule: { alerts_every_hours: 6, summary_hour: 0 },
    dedupe_hours: 0 };
  await h.db().query("UPDATE settings SET notify_config = $1::jsonb WHERE id = 1", [JSON.stringify(cfg)]);
});
test.after(async () => {
  if (!skip) {
    await h.db().query("UPDATE settings SET notify_config = $1::jsonb WHERE id = 1", [savedCfg == null ? null : JSON.stringify(savedCfg)]);
    for (const j of savedJobs) await h.db().query("UPDATE job_runs SET last_run = $2 WHERE job = $1", [j.job, j.last_run]);
  }
  await h.cleanup();
});

const sentSince = async (type, since) =>
  (await h.db().query("SELECT recipient, subject, body FROM notifications WHERE type = $1 AND created_at >= $2 ORDER BY id", [type, since])).rows;

test("a till closed short by more than the threshold tells the alert recipients", async (t) => {
  if (skip) return t.skip(skip);
  const since = new Date();
  const u = await h.staff("cashier");
  const token = await h.signIn(u);
  await h.api("POST", "/api/finance/shift/open", { token, body: { opening_float: 200 } });
  const r = await h.api("POST", "/api/finance/shift/close", { token, body: { closing_counted: 120 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.variance, -80);
  await new Promise((ok) => setTimeout(ok, 300));
  const sent = await sentSince("till_variance", since);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].recipient, "ops@test.local");
  assert.match(sent[0].subject, /short by 80\.00/);
});

test("a small till difference stays quiet", async (t) => {
  if (skip) return t.skip(skip);
  const since = new Date();
  const u = await h.staff("cashier");
  const token = await h.signIn(u);
  await h.api("POST", "/api/finance/shift/open", { token, body: { opening_float: 200 } });
  await h.api("POST", "/api/finance/shift/close", { token, body: { closing_counted: 190 } });
  await new Promise((ok) => setTimeout(ok, 300));
  assert.equal((await sentSince("till_variance", since)).length, 0);
});

test("a large refund tells the alert recipients", async (t) => {
  if (skip) return t.skip(skip);
  const since = new Date();
  const m = await h.staff("manager");
  const token = await h.signIn(m);
  await h.openTill(token);
  const p = await h.product({ price: 60 });
  const sale = await h.api("POST", "/api/sales", { token, body: { items: [{ product_id: p.id, qty: 3 }], payment_method: "cash", branch_id: 1 } });
  const line = (await h.api("GET", `/api/sales/${sale.body.id}`, { token })).body.items[0].id;
  assert.equal((await h.api("POST", `/api/sales/${sale.body.id}/return`, { token, body: { items: [{ sale_item_id: line, qty: 2 }], refund_method: "cash", reason: "test" } })).status, 201);
  await new Promise((ok) => setTimeout(ok, 300));
  const sent = await sentSince("large_refund", since);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Refund of 120\.00/);
});

test("the scheduler runs alerts and the daily summary by itself, once each", async (t) => {
  if (skip) return t.skip(skip);
  const since = new Date();
  await h.db().query("UPDATE job_runs SET last_run = 'epoch'");
  await h.product({ qty: 0 }); // something is low on stock
  const { tick } = require("../../lib/scheduler");
  await tick();
  await tick();   // a second check straight after must not repeat either job
  assert.equal((await sentSince("low_stock", since)).length, 1, "alerts ran once");
  assert.equal((await sentSince("report", since)).length, 1, "daily summary sent once");
  const jobs = (await h.db().query("SELECT job FROM job_runs WHERE last_run >= $1", [since])).rows.map((r) => r.job).sort();
  assert.deepEqual(jobs, ["alerts", "daily_summary"]);
});

test("reorder suggestions count what is already on order", async (t) => {
  if (skip) return t.skip(skip);
  const m = await h.staff("manager");
  const token = await h.signIn(m);
  const p = await h.product({ qty: 0 });
  const before = (await h.api("GET", "/api/purchasing/reorder?branch_id=1", { token })).body.items.find((x) => x.id === p.id);
  assert.ok(before && before.suggested_qty > 0, "an empty shelf is suggested");
  await h.api("POST", "/api/purchase-orders", { token, body: { status: "ordered", branch_id: 1, items: [{ product_id: p.id, qty_ordered: before.suggested_qty, cost_price: 1 }] } });
  const after = (await h.api("GET", "/api/purchasing/reorder?branch_id=1", { token })).body.items.find((x) => x.id === p.id);
  assert.equal(after, undefined, "already ordered — not suggested again");
});
