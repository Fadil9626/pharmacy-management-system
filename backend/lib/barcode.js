// Store-generated EAN-13 barcodes. GS1 reserves prefixes 20–29 for in-store /
// restricted distribution, so codes minted here won't collide with real product
// GTINs. 12 data digits + 1 check digit = 13.
const pool = require("../config/db");

function checkDigit(d12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

function buildEAN13() {
  let body = "20"; // in-store prefix
  for (let i = 0; i < 10; i++) body += Math.floor(Math.random() * 10);
  return body + checkDigit(body);
}

// Generic uniqueness retry wrapper around a code factory.
async function allocate(make) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = make();
    const { rows } = await pool.query("SELECT 1 FROM products WHERE barcode = $1 LIMIT 1", [code]);
    if (!rows.length) return code;
  }
  throw new Error("Could not allocate a unique barcode — try again");
}

const uniqueEAN13 = () => allocate(buildEAN13);

// Letters/digits only, uppercased, capped — safe for a CODE128 prefix.
const cleanPrefix = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

// First 3 alpha characters of a product name, e.g. "Paracetamol 500mg" -> "PAR".
const deriveFromName = (name) => String(name || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);

// Alphanumeric CODE128 SKU: PREFIX + 5 random digits, e.g. "RMD48201".
const uniquePrefixed = (prefix) =>
  allocate(() => prefix + String(Math.floor(Math.random() * 1e5)).padStart(5, "0"));

module.exports = { checkDigit, uniqueEAN13, uniquePrefixed, cleanPrefix, deriveFromName };
