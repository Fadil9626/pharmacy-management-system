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

// A fresh EAN-13 not already used by another product.
async function uniqueEAN13() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = buildEAN13();
    const { rows } = await pool.query("SELECT 1 FROM products WHERE barcode = $1 LIMIT 1", [code]);
    if (!rows.length) return code;
  }
  throw new Error("Could not allocate a unique barcode — try again");
}

module.exports = { checkDigit, uniqueEAN13 };
