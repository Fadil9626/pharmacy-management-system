const { test } = require("node:test");
const assert = require("node:assert/strict");
const totp = require("../lib/totp");

test("generateSecret returns a base32 string", () => {
  const s = totp.generateSecret();
  assert.match(s, /^[A-Z2-7]+$/);
  assert.ok(s.length >= 30);
});

test("verify accepts a freshly generated code and rejects a wrong one", () => {
  const s = totp.generateSecret();
  const code = totp.current(s);
  assert.equal(totp.verify(s, code), true);
  const wrong = String((Number(code) + 1) % 1e6).padStart(6, "0");
  assert.equal(totp.verify(s, wrong), false);
});

test("verify rejects malformed input", () => {
  const s = totp.generateSecret();
  assert.equal(totp.verify(s, ""), false);
  assert.equal(totp.verify(s, "abc"), false);
  assert.equal(totp.verify(s, "12345"), false);
  assert.equal(totp.verify("", "123456"), false);
});

test("matchStep returns a step for a valid code (used for replay protection)", () => {
  const s = totp.generateSecret();
  const step = totp.matchStep(s, totp.current(s));
  assert.equal(typeof step, "number");
  // The same code resolves to the same step — so a server tracking last-used
  // step will reject the second use.
  assert.equal(totp.matchStep(s, totp.current(s)), step);
  assert.equal(totp.matchStep(s, "000000") === step, false);
});

test("backup codes are unique and hashing is stable", () => {
  const codes = totp.makeBackupCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.equal(totp.hashCode("ABCD-1234"), totp.hashCode("ABCD-1234"));
  assert.notEqual(totp.hashCode("ABCD-1234"), totp.hashCode("ABCD-5678"));
});

test("otpauthURL embeds the secret and issuer", () => {
  const url = totp.otpauthURL("JBSWY3DPEHPK3PXP", "user@x.com", "Remedy");
  assert.match(url, /^otpauth:\/\/totp\//);
  assert.match(url, /secret=JBSWY3DPEHPK3PXP/);
  assert.match(url, /issuer=Remedy/);
});
