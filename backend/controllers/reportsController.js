const pool = require("../config/db");

const branchOf = (req) => Number(req.query.branch_id) || req.user.branch_id || null;

const iso = (d) => d.toISOString().slice(0, 10);
const range = (req) => {
  const to = req.query.to || iso(new Date());
  let from = req.query.from;
  if (!from) {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    from = iso(d);
  }
  return { from, to };
};

// ── Sales analytics for a date range ────────────────────────
exports.sales = async (req, res) => {
  const branchId = branchOf(req);
  const { from, to } = range(req);
  try {
    const [summary, cogs, byDay, byPayment, top] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS txns,
                COALESCE(SUM(total), 0)::float    AS revenue,
                COALESCE(SUM(subtotal), 0)::float AS gross_sales,
                COALESCE(SUM(discount), 0)::float AS discounts
         FROM sales
         WHERE created_at::date BETWEEN $1 AND $2 AND ($3::int IS NULL OR branch_id = $3)`,
        [from, to, branchId]
      ),
      pool.query(
        `SELECT COALESCE(SUM(si.qty * b.cost_price), 0)::float AS cogs
         FROM sale_items si
         JOIN sales s ON si.sale_id = s.id
         LEFT JOIN product_batches b ON si.batch_id = b.id
         WHERE s.created_at::date BETWEEN $1 AND $2 AND ($3::int IS NULL OR s.branch_id = $3)`,
        [from, to, branchId]
      ),
      pool.query(
        `SELECT created_at::date AS day, COUNT(*)::int AS txns,
                COALESCE(SUM(total), 0)::float AS revenue
         FROM sales
         WHERE created_at::date BETWEEN $1 AND $2 AND ($3::int IS NULL OR branch_id = $3)
         GROUP BY day ORDER BY day`,
        [from, to, branchId]
      ),
      pool.query(
        `SELECT payment_method, COUNT(*)::int AS txns,
                COALESCE(SUM(total), 0)::float AS revenue
         FROM sales
         WHERE created_at::date BETWEEN $1 AND $2 AND ($3::int IS NULL OR branch_id = $3)
         GROUP BY payment_method ORDER BY revenue DESC`,
        [from, to, branchId]
      ),
      pool.query(
        `SELECT COALESCE(si.name, p.name) AS name,
                SUM(si.qty)::int AS qty,
                COALESCE(SUM(si.line_total), 0)::float AS revenue
         FROM sale_items si
         JOIN sales s ON si.sale_id = s.id
         LEFT JOIN products p ON si.product_id = p.id
         WHERE s.created_at::date BETWEEN $1 AND $2 AND ($3::int IS NULL OR s.branch_id = $3)
         GROUP BY COALESCE(si.name, p.name)
         ORDER BY revenue DESC LIMIT 8`,
        [from, to, branchId]
      ),
    ]);

    const s = summary.rows[0];
    const cogsVal = cogs.rows[0].cogs;
    const grossProfit = s.revenue - cogsVal;
    const margin = s.revenue > 0 ? (grossProfit / s.revenue) * 100 : 0;

    res.json({
      from, to,
      summary: {
        ...s,
        cogs: cogsVal,
        gross_profit: grossProfit,
        margin_pct: margin,
        avg_sale: s.txns > 0 ? s.revenue / s.txns : 0,
      },
      by_day: byDay.rows,
      by_payment: byPayment.rows,
      top_products: top.rows,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ── Inventory valuation + expiry exposure ───────────────────
exports.inventory = async (req, res) => {
  const branchId = branchOf(req);
  const days = Math.min(Number(req.query.days) || 90, 365);
  try {
    const [val, expiry, low] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(quantity * cost_price), 0)::float    AS cost_value,
                COALESCE(SUM(quantity * selling_price), 0)::float AS retail_value,
                COALESCE(SUM(quantity), 0)::int                   AS units
         FROM product_batches
         WHERE quantity > 0 AND ($1::int IS NULL OR branch_id = $1)`,
        [branchId]
      ),
      pool.query(
        `SELECT p.name, b.batch_no, b.expiry_date, b.quantity,
                (b.quantity * b.cost_price)::float AS value,
                (b.expiry_date < CURRENT_DATE)     AS expired
         FROM product_batches b
         JOIN products p ON b.product_id = p.id
         WHERE b.quantity > 0 AND b.expiry_date IS NOT NULL
           AND b.expiry_date <= CURRENT_DATE + make_interval(days => $2)
           AND ($1::int IS NULL OR b.branch_id = $1)
         ORDER BY b.expiry_date`,
        [branchId, days]
      ),
      pool.query(
        `SELECT COUNT(*)::int n FROM (
           SELECT p.id FROM products p
           LEFT JOIN product_batches b ON b.product_id = p.id AND ($1::int IS NULL OR b.branch_id = $1)
           WHERE p.is_active = true
           GROUP BY p.id, p.reorder_level
           HAVING COALESCE(SUM(b.quantity), 0) <= p.reorder_level
         ) x`,
        [branchId]
      ),
    ]);

    res.json({
      valuation: val.rows[0],
      expiry: expiry.rows,
      expiry_value: expiry.rows.reduce((s, r) => s + r.value, 0),
      low_stock_count: low.rows[0].n,
      days,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
