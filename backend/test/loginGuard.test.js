const { test } = require("node:test");
const assert = require("node:assert/strict");
const guard = require("../lib/loginGuard");

const reqFor = (ip) => ({ headers: {}, ip, socket: { remoteAddress: ip } });

test("locks out after repeated failures and resets on success", () => {
  const email = "lock@test.local";
  const req = reqFor("10.0.0.1");
  assert.equal(guard.retryAfter(req, email), 0);
  for (let i = 0; i < 8; i++) guard.recordFail(req, email);
  assert.ok(guard.retryAfter(req, email) > 0, "should be locked after 8 fails");
  guard.reset(req, email);
  assert.equal(guard.retryAfter(req, email), 0, "reset clears the lock");
});

test("a different IP/email is unaffected", () => {
  const email = "other@test.local";
  const a = reqFor("10.0.0.2");
  const b = reqFor("10.0.0.3");
  for (let i = 0; i < 8; i++) guard.recordFail(a, email);
  assert.ok(guard.retryAfter(a, email) > 0);
  assert.equal(guard.retryAfter(b, email), 0);
});
