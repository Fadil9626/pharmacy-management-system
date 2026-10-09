const pool = require("../config/db");

// What each kind of stock change is called on a register or stock card.
const LABEL = {
  opening: "Opening balance",
  received: "Received",
  sale: "Dispensed",
  return: "Returned by customer",
  transfer_out: "Transferred out",
  transfer_in: "Transferred in",
  transfer_cancelled: "Transfer called back",
  adjustment: "Adjusted",
  count: "Stock count",
  disposal: "Destroyed",
  return_to_supplier: "Returned to supplier",
  unlabelled: "Changed",
};

/**
 * Every change to a product's stock, oldest first, with the running balance —
 * read from the stock history (stock_moves), which the database writes for
 * every change to a batch. `branchId` null = all branches.
 *
 * The controlled-drug register and the stock card are both this.
 */
async function stockCard(productId, branchId) {
  const { rows } = await pool.query(
    `SELECT m.id, m.created_at AS at, m.delta, m.kind, m.ref_type, m.ref_no, m.party, m.detail,
            b.batch_no, b.expiry_date, br.name AS branch, u.full_name AS actor
       FROM stock_moves m
       LEFT JOIN product_batches b ON b.id = m.batch_id
       LEFT JOIN branches br ON br.id = m.branch_id
       LEFT JOIN users u ON u.id = m.user_id
      WHERE m.product_id = $1 AND ($2::int IS NULL OR m.branch_id = $2)
      ORDER BY m.created_at, m.id`,
    [productId, branchId]
  );
  let balance = 0;
  const ledger = rows.map((m) => {
    balance += m.delta;
    const d = m.detail || {};
    return {
      id: Number(m.id), at: m.at, type: m.kind, label: LABEL[m.kind] || m.kind,
      delta: m.delta, balance, ref: m.ref_no, party: m.party, actor: m.actor,
      batch_no: m.batch_no, expiry_date: m.expiry_date, branch: m.branch,
      prescriber: d.prescriber || null, license: d.license || null,
      reason: d.reason || null, witness: d.witness || null, note: d.note || null,
    };
  });
  // The balance on the shelf right now, for comparison: the two must agree.
  const shelf = (await pool.query(
    "SELECT COALESCE(SUM(quantity), 0)::int AS n FROM product_batches WHERE product_id = $1 AND ($2::int IS NULL OR branch_id = $2)",
    [productId, branchId]
  )).rows[0].n;
  return {
    balance,
    on_shelf: shelf,
    total_in: ledger.filter((m) => m.delta > 0 && m.type !== "opening").reduce((s, m) => s + m.delta, 0),
    total_out: ledger.filter((m) => m.delta < 0).reduce((s, m) => s - m.delta, 0),
    ledger,
  };
}

module.exports = { stockCard, LABEL };
