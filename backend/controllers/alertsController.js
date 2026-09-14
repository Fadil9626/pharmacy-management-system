const pool = require("../config/db");

// ── What needs attention right now ──────────────────────────────────────────
//
// Feeds the header bell. Deliberately NOT read from the notifications table:
// that is an outbox of messages already dispatched, and it is only written when
// a delivery channel is configured. A bell over it would sit at zero on a
// pharmacy with forty expiring batches and no SMTP set up — which is precisely
// the pharmacy that most needs telling.
//
// So these are live counts, and they use the same definitions as
// notificationsController.runAlerts. If the bell and the email disagree about
// what "low stock" means, one of them is lying and nobody can tell which.
//
// Counts plus a short preview, capped. The bell is a prompt to go and look, not
// a report — the full lists already live on the dashboard and in Inventory.
exports.summary = async (_req, res) => {
  try {
    const cfg = await pool.query("SELECT near_expiry_months FROM settings WHERE id = 1");
    const months = Number(cfg.rows[0]?.near_expiry_months || 3);

    // Batches with no expiry date still count as stock; a batch already expired
    // does not. Same FILTER as runAlerts.
    const low = await pool.query(
      `SELECT p.name,
              COALESCE(SUM(b.quantity) FILTER (WHERE b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE), 0)::int AS stock,
              p.reorder_level
         FROM products p LEFT JOIN product_batches b ON b.product_id = p.id
        WHERE p.is_active = true
        GROUP BY p.id, p.name, p.reorder_level
       HAVING COALESCE(SUM(b.quantity) FILTER (WHERE b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE), 0) <= p.reorder_level
        ORDER BY stock ASC
        LIMIT 100`
    );

    const exp = await pool.query(
      `SELECT p.name, b.batch_no, b.quantity, b.expiry_date
         FROM product_batches b JOIN products p ON b.product_id = p.id
        WHERE b.quantity > 0 AND b.expiry_date IS NOT NULL
          AND b.expiry_date <= (CURRENT_DATE + ($1 || ' months')::interval)
        ORDER BY b.expiry_date ASC
        LIMIT 100`,
      [String(months)]
    );

    // Already expired is a separate, harder fact than "expiring soon": that
    // stock must not be sold at all, so it is counted on its own rather than
    // folded into the same number.
    const expired = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM product_batches
        WHERE quantity > 0 AND expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE`
    );

    // Nothing sellable at all, which is not the same as "low". Low means order
    // more; zero means the next person asking for it leaves without it. Counted
    // apart so a shelf with one item at zero is not hidden inside a low-stock
    // number that has been amber for weeks.
    const out = await pool.query(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT p.id
           FROM products p LEFT JOIN product_batches b ON b.product_id = p.id
          WHERE p.is_active = true
          GROUP BY p.id
         HAVING COALESCE(SUM(b.quantity) FILTER (WHERE b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE), 0) <= 0
       ) z`
    );

    // Prescriptions with refills remaining, dispensed long enough ago to be due.
    // Soft-failed: an install without the prescriptions module still gets a bell.
    const refill = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM prescriptions pr
        WHERE pr.status = 'dispensed' AND pr.refills_allowed > pr.refills_used
          AND pr.dispensed_at IS NOT NULL AND pr.dispensed_at <= NOW() - INTERVAL '30 days'`
    ).catch(() => ({ rows: [{ n: 0 }] }));

    res.json({
      near_expiry_months: months,
      counts: {
        // low_stock counts products at or below reorder level INCLUDING those
        // at zero, which is how runAlerts counts them. out_of_stock is a subset,
        // surfaced separately — so the two must not be added together.
        low_stock:    low.rows.length,
        out_of_stock: out.rows[0].n,
        near_expiry:  exp.rows.length,
        expired:      expired.rows[0].n,
        refill_due:   refill.rows[0].n,
      },
      low_stock:   low.rows.slice(0, 5),
      near_expiry: exp.rows.slice(0, 5),
    });
  } catch (e) {
    console.error("[alerts] summary failed:", e.message);
    res.status(500).json({ message: "Could not read alerts" });
  }
};
