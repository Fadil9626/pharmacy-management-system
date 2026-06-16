const { test } = require("node:test");
const assert = require("node:assert/strict");
const { checkDigit, cleanPrefix, deriveFromName } = require("../lib/barcode");

test("EAN-13 check digit matches a known barcode", () => {
  // 4006381333931 is a valid EAN-13 (check digit 1).
  assert.equal(checkDigit("400638133393"), 1);
});

test("check digit is a single 0-9 value", () => {
  const d = checkDigit("200123456789");
  assert.ok(Number.isInteger(d) && d >= 0 && d <= 9);
});

test("cleanPrefix uppercases, strips junk, and caps length", () => {
  assert.equal(cleanPrefix("par"), "PAR");
  assert.equal(cleanPrefix("rmd-123!"), "RMD123");
  assert.equal(cleanPrefix("abcdefghij"), "ABCDEF"); // capped at 6
  assert.equal(cleanPrefix(""), "");
  assert.equal(cleanPrefix(null), "");
});

test("deriveFromName takes the first three letters", () => {
  assert.equal(deriveFromName("Paracetamol 500mg"), "PAR");
  assert.equal(deriveFromName("Amoxicillin"), "AMO");
  assert.equal(deriveFromName("3M Tape"), "MTA"); // digits/spaces stripped, first 3 letters
  assert.equal(deriveFromName(""), "");
});
