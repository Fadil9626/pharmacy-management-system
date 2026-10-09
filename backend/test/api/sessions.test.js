/**
 * Sign-in and staff accounts: what a session is, and who may change whom.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const h = require("./_harness");

let skip;
test.before(async () => { skip = await h.available(); });
test.after(() => h.cleanup());

test("the two-step sign-in ticket is not a session", async (t) => {
  if (skip) return t.skip(skip);
  const owner = await h.staff("owner");
  const ticket = jwt.sign({ uid: owner.id, purpose: "2fa" }, process.env.JWT_SECRET, { expiresIn: "5m" });
  for (const p of ["/api/dashboard", "/api/sales", "/api/customers", "/api/settings", "/api/alerts/summary"]) {
    const r = await h.api("GET", p, { token: ticket });
    assert.equal(r.status, 401, `${p} accepted a sign-in ticket`);
  }
});

test("a token without a sign-in version is refused", async (t) => {
  if (skip) return t.skip(skip);
  const owner = await h.staff("owner");
  const legacy = jwt.sign({ id: owner.id, role: "owner", branch_id: 1 }, process.env.JWT_SECRET, { expiresIn: "5m" });
  assert.equal((await h.api("GET", "/api/dashboard", { token: legacy })).status, 401);
});

test("a deactivated account is signed out on its next request", async (t) => {
  if (skip) return t.skip(skip);
  const owner = await h.staff("owner");
  const cashier = await h.staff("cashier");
  const [ot, ct] = [await h.signIn(owner), await h.signIn(cashier)];
  assert.equal((await h.api("GET", "/api/me", { token: ct })).status, 200);
  const r = await h.api("PATCH", `/api/users/${cashier.id}`, { token: ot, body: { is_active: false } });
  assert.equal(r.status, 200);
  assert.equal((await h.api("GET", "/api/me", { token: ct })).status, 401);
});

test("a role change applies at once: a demoted manager loses manager rights", async (t) => {
  if (skip) return t.skip(skip);
  const owner = await h.staff("owner");
  const manager = await h.staff("manager");
  const [ot, mt] = [await h.signIn(owner), await h.signIn(manager)];
  assert.equal((await h.api("GET", "/api/users", { token: mt })).status, 200);
  await h.api("PATCH", `/api/users/${manager.id}`, { token: ot, body: { role: "cashier" } });
  // The old token is ended outright…
  assert.equal((await h.api("GET", "/api/users", { token: mt })).status, 401);
  // …and a fresh sign-in is a cashier.
  const fresh = await h.signIn(manager);
  assert.equal((await h.api("GET", "/api/users", { token: fresh })).status, 403);
});

test("a branch move applies on the next request, without signing out", async (t) => {
  if (skip) return t.skip(skip);
  const owner = await h.staff("owner");
  const cashier = await h.staff("cashier", 1);
  const [ot, ct] = [await h.signIn(owner), await h.signIn(cashier)];
  await h.api("PATCH", `/api/users/${cashier.id}`, { token: ot, body: { branch_id: 2 } });
  const me = await h.api("GET", "/api/me", { token: ct });
  assert.equal(me.status, 200);
  assert.equal(me.body.branch_id, 2);
});

test("a manager cannot take over an owner account", async (t) => {
  if (skip) return t.skip(skip);
  const owner = await h.staff("owner");
  const manager = await h.staff("manager");
  const cashier = await h.staff("cashier");
  const mt = await h.signIn(manager);
  const tries = [
    ["PATCH", `/api/users/${cashier.id}`, { role: "owner" }],
    ["PATCH", `/api/users/${owner.id}`, { is_active: false }],
    ["PATCH", `/api/users/${owner.id}`, { role: "cashier" }],
    ["POST", `/api/users/${owner.id}/reset-password`, { password: "Taken-over-2026!" }],
    ["POST", `/api/users/${owner.id}/send-reset`, {}],
  ];
  for (const [m, p, body] of tries) {
    const r = await h.api(m, p, { token: mt, body });
    assert.equal(r.status, 403, `${m} ${p} ${JSON.stringify(body)} → ${r.status}`);
  }
  // The owner still signs in with their own password.
  await h.signIn(owner);
  // A manager still manages ordinary staff.
  assert.equal((await h.api("PATCH", `/api/users/${cashier.id}`, { token: mt, body: { full_name: "Renamed" } })).status, 200);
});

test("setting a new password ends the person's existing sessions", async (t) => {
  if (skip) return t.skip(skip);
  const owner = await h.staff("owner");
  const cashier = await h.staff("cashier");
  const [ot, ct] = [await h.signIn(owner), await h.signIn(cashier)];
  const r = await h.api("POST", `/api/users/${cashier.id}/reset-password`, { token: ot, body: { password: "Brand-new-2026!" } });
  assert.equal(r.status, 200);
  assert.equal((await h.api("GET", "/api/me", { token: ct })).status, 401);
});

test("wrong passwords lock the account even when the sender claims a new address each time", async (t) => {
  if (skip) return t.skip(skip);
  const victim = await h.staff("cashier");
  let last;
  for (let i = 0; i < 9; i++) {
    last = await h.api("POST", "/api/auth/login", {
      body: { email: victim.email, password: "wrong" + i },
      headers: { "x-forwarded-for": `203.0.113.${i + 1}` },
    });
  }
  assert.equal(last.status, 429, "X-Forwarded-For must not reset the count");
});

test("wrong two-step codes are limited", async (t) => {
  if (skip) return t.skip(skip);
  const u = await h.staff("cashier");
  await h.db().query("UPDATE users SET totp_enabled = true, totp_secret = 'JBSWY3DPEHPK3PXP', backup_codes = '[]' WHERE id = $1", [u.id]);
  const first = await h.api("POST", "/api/auth/login", { body: { email: u.email, password: h.PASSWORD } });
  assert.equal(first.body.require_2fa, true);
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    statuses.push((await h.api("POST", "/api/auth/2fa/verify", { body: { ticket: first.body.ticket, code: "000000" } })).status);
  }
  assert.equal(statuses.at(-1), 429, `statuses: ${statuses}`);
});
