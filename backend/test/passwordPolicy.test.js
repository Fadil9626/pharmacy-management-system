const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validatePassword } = require("../lib/passwordPolicy");

test("rejects short passwords", () => {
  assert.match(validatePassword("abc1"), /at least 8/);
});

test("requires a letter", () => {
  assert.match(validatePassword("12345678"), /letter/);
});

test("requires a number", () => {
  assert.match(validatePassword("abcdefgh"), /number/);
});

test("accepts a compliant password", () => {
  assert.equal(validatePassword("abcd1234"), null);
  assert.equal(validatePassword("Remedy2026"), null);
});
