/**
 * Shared set-up for the API tests: they talk to a running Remedy (REMEDY_URL,
 * default http://127.0.0.1:5190) and its database (DATABASE_URL from .env).
 *
 * Each test file makes its own throw-away staff with known passwords, and
 * deactivates them afterwards (rows that sales point at can't be deleted).
 * Skipped when no database is configured or the server isn't answering.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });
const bcrypt = require("bcryptjs");

const BASE = process.env.REMEDY_URL || "http://127.0.0.1:5190";
const PASSWORD = "Test-pass-2026!";
const run = Date.now().toString(36);

let pool;
function db() {
  if (!pool) { const { Pool } = require("pg"); pool = new Pool({ connectionString: process.env.DATABASE_URL }); }
  return pool;
}

async function available() {
  if (!process.env.DATABASE_URL) return "no database configured";
  try { await fetch(BASE + "/api/health"); return false; } catch { return `Remedy is not running at ${BASE}`; }
}

const made = [];
/** A staff member with a known password. */
async function staff(role, branchId = 1, extra = {}) {
  const email = `t-${role}-${made.length}-${run}@test.local`;
  const hash = await bcrypt.hash(PASSWORD, 4);
  const { rows } = await db().query(
    "INSERT INTO users (full_name, email, password_hash, role, branch_id) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [`Test ${role}`, email, hash, role, branchId]);
  const u = { id: rows[0].id, email, role, branch_id: branchId, ...extra };
  made.push(u.id);
  return u;
}

async function api(method, p, { token, body, headers = {} } = {}) {
  const r = await fetch(BASE + p, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json };
}

async function signIn(u) {
  const r = await api("POST", "/api/auth/login", { body: { email: u.email, password: PASSWORD } });
  if (r.status !== 200 || !r.body.token) throw new Error(`sign-in for ${u.email} failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.token;
}

async function cleanup() {
  if (made.length) await db().query("UPDATE users SET is_active = false, email = email || '.done' WHERE id = ANY($1) AND email NOT LIKE '%.done'", [made]);
  if (pool) await pool.end();
  pool = null;
}

module.exports = { BASE, PASSWORD, db, available, staff, api, signIn, cleanup };
