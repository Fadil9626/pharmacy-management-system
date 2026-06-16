const crypto = require("crypto");

// RFC 6238 TOTP (and 4226 HOTP) with no external dependency — Google
// Authenticator / Authy compatible. SHA-1, 6 digits, 30s step.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  let bits = 0, value = 0;
  const out = [];
  for (const c of String(str).toUpperCase().replace(/=+$/, "").replace(/\s/g, "")) {
    const idx = B32.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

const generateSecret = () => base32Encode(crypto.randomBytes(20));

function hotp(secret, counter) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1e6).padStart(6, "0");
}

// Verify a code against the current 30s window ± `window` steps (clock drift).
function verify(secret, token, window = 1) {
  if (!secret || !/^\d{6}$/.test(String(token || "").trim())) return false;
  const t = Math.floor(Date.now() / 1000 / 30);
  const code = String(token).trim();
  for (let i = -window; i <= window; i++) {
    if (hotp(secret, t + i) === code) return true;
  }
  return false;
}

const otpauthURL = (secret, account, issuer = "Remedy") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

// One-time backup codes (shown once, stored as SHA-256 hashes).
const hashCode = (c) => crypto.createHash("sha256").update(String(c)).digest("hex");
function makeBackupCodes(n = 10) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    codes.push(crypto.randomBytes(4).toString("hex").toUpperCase().replace(/(.{4})(.{4})/, "$1-$2"));
  }
  return codes;
}

module.exports = { generateSecret, verify, otpauthURL, makeBackupCodes, hashCode };
