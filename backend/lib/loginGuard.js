// In-memory brute-force guard for login. Tracks failed attempts per IP+email
// over a rolling window and locks the pair out briefly once they pile up.
// Process-local (resets on restart) — fine for a single-node deploy; swap for
// Redis if Remedy ever runs multi-node.
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILS = 8;              // attempts before lockout
const LOCK_MS = 15 * 60 * 1000;   // lockout duration once tripped

const attempts = new Map(); // key -> { fails, first, lockedUntil }

const keyOf = (req, email) =>
  `${(req.headers["x-forwarded-for"] || req.ip || req.socket?.remoteAddress || "?").toString().split(",")[0].trim()}:${String(email || "").toLowerCase()}`;

// Returns seconds remaining if locked, else 0.
function retryAfter(req, email) {
  const e = attempts.get(keyOf(req, email));
  if (!e) return 0;
  if (e.lockedUntil && Date.now() < e.lockedUntil) return Math.ceil((e.lockedUntil - Date.now()) / 1000);
  return 0;
}

function recordFail(req, email) {
  const key = keyOf(req, email);
  const now = Date.now();
  let e = attempts.get(key);
  if (!e || now - e.first > WINDOW_MS) e = { fails: 0, first: now, lockedUntil: 0 };
  e.fails += 1;
  if (e.fails >= MAX_FAILS) e.lockedUntil = now + LOCK_MS;
  attempts.set(key, e);
}

function reset(req, email) {
  attempts.delete(keyOf(req, email));
}

// Periodic sweep so the map can't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of attempts) {
    if ((!e.lockedUntil || now > e.lockedUntil) && now - e.first > WINDOW_MS) attempts.delete(k);
  }
}, WINDOW_MS).unref?.();

module.exports = { retryAfter, recordFail, reset };
