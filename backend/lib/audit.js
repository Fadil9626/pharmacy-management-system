const crypto = require("crypto");
const pool = require("../config/db");

// Canonical string for a row (stable across insert + verify). details uses the
// DB's jsonb ::text form; created_at uses ISO.
function canonical(row) {
  return [
    String(row.id),
    row.user_id ?? "",
    row.user_name ?? "",
    row.action ?? "",
    row.entity ?? "",
    row.entity_id ?? "",
    row.details_text ?? "",
    new Date(row.created_at).toISOString(),
  ].join("|");
}
const rowHash = (prevHash, row) =>
  crypto.createHash("sha256").update((prevHash || "") + canonical(row)).digest("hex");

const LOCK = 727001; // advisory lock key — serialize audit writes so the chain is linear

// Record a sensitive action and link it into the hash chain. Fire-and-forget —
// an audit failure must never break the underlying request.
async function logAudit(req, action, entity, entityId, details) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK]);
    const prev = (await client.query("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1")).rows[0]?.hash || "";
    const ins = await client.query(
      `INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, details, prev_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, user_id, user_name, action, entity, entity_id, details::text AS details_text, created_at`,
      [
        req.user?.id || null,
        req.user?.full_name || null,
        action,
        entity || null,
        entityId != null ? String(entityId) : null,
        details ? JSON.stringify(details) : null,
        prev,
      ]
    );
    const row = ins.rows[0];
    await client.query("UPDATE audit_log SET hash = $1 WHERE id = $2", [rowHash(prev, row), row.id]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("audit log error:", e.message);
  } finally {
    client.release();
  }
}

// Establish the chain for any rows that don't have a hash yet (e.g. history
// created before hashing was added). Runs once on boot.
async function backfillAuditChain() {
  const { rows } = await pool.query(
    `SELECT id, user_id, user_name, action, entity, entity_id, details::text AS details_text, created_at
     FROM audit_log WHERE hash IS NULL ORDER BY id ASC`
  );
  if (!rows.length) return 0;
  let prev = (await pool.query("SELECT hash FROM audit_log WHERE hash IS NOT NULL ORDER BY id DESC LIMIT 1")).rows[0]?.hash || "";
  for (const r of rows) {
    const h = rowHash(prev, r);
    await pool.query("UPDATE audit_log SET hash = $1, prev_hash = $2 WHERE id = $3", [h, prev, r.id]);
    prev = h;
  }
  return rows.length;
}

// Walk the chain and confirm every row's hash matches and links to the previous.
async function verifyAuditChain() {
  const { rows } = await pool.query(
    `SELECT id, user_id, user_name, action, entity, entity_id, details::text AS details_text, created_at, hash, prev_hash
     FROM audit_log ORDER BY id ASC`
  );
  let prev = "";
  for (const r of rows) {
    if ((r.prev_hash || "") !== (prev || "")) return { ok: false, entries: rows.length, broken_at: r.id, reason: "broken link" };
    if (r.hash !== rowHash(prev, r)) return { ok: false, entries: rows.length, broken_at: r.id, reason: "content changed" };
    prev = r.hash;
  }
  return { ok: true, entries: rows.length, broken_at: null };
}

module.exports = { logAudit, backfillAuditChain, verifyAuditChain };
