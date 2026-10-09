/**
 * Labels for the stock history (migrations/046_stock_moves.sql).
 *
 * The history itself is written by a database trigger on product_batches, so
 * nothing here is needed for a change to be recorded. These two calls say what
 * the change WAS. Both must run inside the transaction making the change.
 *
 *   await moveKind(client, { kind: "sale", user_id, party })   // before the UPDATEs
 *   await moveRef(client, { ref_type: "sale", ref_id, ref_no }) // once the reference exists
 */

// Say what the next stock changes in this transaction are. Call again to change it.
async function moveKind(client, ctx) {
  await client.query("SELECT set_config('remedy.move', $1, true)", [JSON.stringify(ctx || {})]);
}

// Attach the reference (a receipt or order number) to the rows this
// transaction has written so far that don't have one yet.
async function moveRef(client, { ref_type, ref_id, ref_no, party, detail }) {
  await client.query(
    `UPDATE stock_moves SET ref_type = COALESCE($1, ref_type), ref_id = $2, ref_no = COALESCE($3, ref_no),
            party = COALESCE($4, party), detail = COALESCE($5::jsonb, detail)
      WHERE txid = txid_current() AND ref_id IS NULL`,
    [ref_type || null, ref_id, ref_no || null, party || null, detail ? JSON.stringify(detail) : null]
  );
}

module.exports = { moveKind, moveRef };
