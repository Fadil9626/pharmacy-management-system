// In-memory brute-force guard for sign-in. Process-local (resets on restart) —
// fine for a single-node deploy; swap for Redis if Remedy ever runs multi-node.
//
// Two counters, both must be clear:
//   • per address + account — 8 wrong passwords from one place locks that pair;
//   • per account alone     — 20 wrong passwords from anywhere locks the account
//     for a while, so spreading guesses over many addresses doesn't get round it.
//
// The address is req.ip: the connection's own address, or — only when the app
// is told it sits behind a proxy (TRUST_PROXY) — the one that proxy reports.
// It used to read X-Forwarded-For directly, which any client can set, so every
// guess could arrive "from" a fresh address and the lock never tripped.
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILS = 8;              // per address + account
const MAX_ACCOUNT_FAILS = 20;     // per account, any address
const LOCK_MS = 15 * 60 * 1000;   // lockout duration once tripped

const attempts = new Map(); // key -> { fails, first, lockedUntil }

const addressOf = (req) => String(req.ip || req.socket?.remoteAddress || "?");
const who = (email) => String(email || "").trim().toLowerCase();
const pairKey = (req, email) => `${addressOf(req)}:${who(email)}`;
const accountKey = (email) => `acct:${who(email)}`;

function lockedFor(key) {
  const e = attempts.get(key);
  if (e && e.lockedUntil && Date.now() < e.lockedUntil) return Math.ceil((e.lockedUntil - Date.now()) / 1000);
  return 0;
}

function bump(key, max) {
  const now = Date.now();
  let e = attempts.get(key);
  if (!e || now - e.first > WINDOW_MS) e = { fails: 0, first: now, lockedUntil: 0 };
  e.fails += 1;
  if (e.fails >= max) e.lockedUntil = now + LOCK_MS;
  attempts.set(key, e);
}

// Returns seconds remaining if locked, else 0.
function retryAfter(req, email) {
  return Math.max(lockedFor(pairKey(req, email)), lockedFor(accountKey(email)));
}

function recordFail(req, email) {
  bump(pairKey(req, email), MAX_FAILS);
  bump(accountKey(email), MAX_ACCOUNT_FAILS);
}

function reset(req, email) {
  attempts.delete(pairKey(req, email));
  attempts.delete(accountKey(email));
}

// The second step (6-digit code) is limited per account: the ticket only proves
// the password, and without a limit a million codes is a short script.
const MAX_CODE_FAILS = 5;
const codeKey = (userId) => `2fa:${userId}`;
const codeRetryAfter = (userId) => lockedFor(codeKey(userId));
const codeFail = (userId) => bump(codeKey(userId), MAX_CODE_FAILS);
const codeReset = (userId) => attempts.delete(codeKey(userId));

// Periodic sweep so the map can't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of attempts) {
    if ((!e.lockedUntil || now > e.lockedUntil) && now - e.first > WINDOW_MS) attempts.delete(k);
  }
}, WINDOW_MS).unref?.();

module.exports = { retryAfter, recordFail, reset, codeRetryAfter, codeFail, codeReset };
