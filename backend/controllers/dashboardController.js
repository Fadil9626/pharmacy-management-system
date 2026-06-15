const pool = require("../config/db");
const { effectiveBranch } = require("../lib/context");

// Rich home-screen overview — KPIs, 14-day trend, payment mix, top products,
// recent sales, and stock alerts, all branch-aware. Not module-gated.
exports.summary = async (req, res) => {
  const branchId = effectiveBranch(req);
  const B = [branchId];
  try {
    const cfg = await pool.query("SELECT near_expiry_months FROM settings WHERE id = 1");
    const nearMonths = Number(cfg.rows[0]?.near_expiry_months || 3);

    const [
      kToday, kCogs, kWeek, stockVal, products, customers, lowCount, nearCount,
      trend, byPayment, top, recent, lowItems, expItems,
    ] = await Promise.all([
      // today sales (net of refunds)
      pool.query(
        `SELECT COALESCE(SUM(total),0)::float
                - COALESCE((SELECT SUM(total) FROM sale_returns r
                            WHERE r.created_at::date = CURRENT_DATE AND ($1::int IS NULL OR r.branch_id = $1)),0)::float AS v,
                COALESCE(SUM(discount),0)::float disc, COUNT(*)::int n
         FROM sales WHERE created_at::date = CURRENT_DATE AND ($1::int IS NULL OR branch_id = $1)`, B),
      // today COGS (for gross profit) — net of returned cost
      pool.query(
        `SELECT
           COALESCE(SUM(si.qty * b.cost_price),0)::float
           - COALESCE((SELECT SUM(ri.qty * b2.cost_price) FROM sale_return_items ri
                       JOIN sale_returns r ON ri.return_id = r.id
                       LEFT JOIN product_batches b2 ON ri.batch_id = b2.id
                       WHERE r.created_at::date = CURRENT_DATE AND ($1::int IS NULL OR r.branch_id = $1)),0)::float
           AS cogs
         FROM sale_items si JOIN sales s ON si.sale_id = s.id
         LEFT JOIN product_batches b ON si.batch_id = b.id
         WHERE s.created_at::date = CURRENT_DATE AND ($1::int IS NULL OR s.branch_id = $1)`, B),
      // last 7 days revenue
      pool.query(
        `SELECT COALESCE(SUM(total),0)::float v FROM sales
         WHERE created_at >= CURRENT_DATE - INTERVAL '6 days' AND ($1::int IS NULL OR branch_id = $1)`, B),
      // stock valuation
      pool.query(
        `SELECT COALESCE(SUM(quantity*cost_price),0)::float cost,
                COALESCE(SUM(quantity*selling_price),0)::float retail,
                COALESCE(SUM(quantity),0)::int units
         FROM product_batches WHERE ($1::int IS NULL OR branch_id = $1)`, B),
      pool.query("SELECT COUNT(*)::int n FROM products WHERE is_active = true"),
      pool.query("SELECT COUNT(*)::int n FROM customers WHERE is_active = true"),
      // low stock count
      pool.query(
        `SELECT COUNT(*)::int n FROM (
           SELECT p.id FROM products p
           LEFT JOIN product_batches b ON b.product_id = p.id AND ($1::int IS NULL OR b.branch_id = $1)
           WHERE p.is_active = true GROUP BY p.id, p.reorder_level
           HAVING COALESCE(SUM(b.quantity),0) <= p.reorder_level) x`, B),
      // near expiry count
      pool.query(
        `SELECT COUNT(*)::int n FROM product_batches
         WHERE quantity > 0 AND expiry_date IS NOT NULL
           AND expiry_date <= CURRENT_DATE + make_interval(months => $2)
           AND ($1::int IS NULL OR branch_id = $1)`, [branchId, nearMonths]),
      // 14-day trend
      pool.query(
        `SELECT d::date AS day,
                COALESCE(s.v,0)::float AS revenue, COALESCE(s.n,0)::int AS count
         FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day') d
         LEFT JOIN (
           SELECT created_at::date dd, SUM(total) v, COUNT(*) n FROM sales
           WHERE created_at >= CURRENT_DATE - INTERVAL '13 days' AND ($1::int IS NULL OR branch_id = $1)
           GROUP BY dd
         ) s ON s.dd = d::date
         ORDER BY day`, B),
      // payment mix (30d) — from tender lines (handles split payments)
      pool.query(
        `SELECT sp.method AS payment_method, COUNT(*)::int n, COALESCE(SUM(sp.amount),0)::float amount
         FROM sale_payments sp JOIN sales s ON sp.sale_id = s.id
         WHERE s.created_at >= CURRENT_DATE - INTERVAL '30 days' AND ($1::int IS NULL OR s.branch_id = $1)
         GROUP BY sp.method ORDER BY amount DESC`, B),
      // top products (30d)
      pool.query(
        `SELECT COALESCE(si.name, p.name) AS name, SUM(si.qty)::int qty,
                COALESCE(SUM(si.line_total),0)::float revenue
         FROM sale_items si JOIN sales s ON si.sale_id = s.id
         LEFT JOIN products p ON si.product_id = p.id
         WHERE s.created_at >= CURRENT_DATE - INTERVAL '30 days' AND ($1::int IS NULL OR s.branch_id = $1)
         GROUP BY COALESCE(si.name, p.name) ORDER BY revenue DESC LIMIT 5`, B),
      // recent sales
      pool.query(
        `SELECT s.receipt_no, s.total, s.payment_method, s.customer_name, s.created_at, u.full_name AS cashier
         FROM sales s LEFT JOIN users u ON s.user_id = u.id
         WHERE ($1::int IS NULL OR s.branch_id = $1)
         ORDER BY s.created_at DESC LIMIT 8`, B),
      // low stock items
      pool.query(
        `SELECT p.id, p.name, p.unit, p.reorder_level, COALESCE(SUM(b.quantity),0)::int stock
         FROM products p
         LEFT JOIN product_batches b ON b.product_id = p.id AND ($1::int IS NULL OR b.branch_id = $1)
         WHERE p.is_active = true GROUP BY p.id
         HAVING COALESCE(SUM(b.quantity),0) <= p.reorder_level
         ORDER BY (COALESCE(SUM(b.quantity),0) - p.reorder_level) ASC, p.name LIMIT 8`, B),
      // expiring batches
      pool.query(
        `SELECT p.name, b.batch_no, b.expiry_date, b.quantity,
                (b.expiry_date < CURRENT_DATE) AS expired
         FROM product_batches b JOIN products p ON b.product_id = p.id
         WHERE b.quantity > 0 AND b.expiry_date IS NOT NULL
           AND b.expiry_date <= CURRENT_DATE + make_interval(months => $2)
           AND ($1::int IS NULL OR b.branch_id = $1)
         ORDER BY b.expiry_date LIMIT 8`, [branchId, nearMonths]),
    ]);

    const todayRev = kToday.rows[0].v;
    const cogs = kCogs.rows[0].cogs;
    const grossToday = todayRev - cogs;

    res.json({
      kpis: {
        today_sales: todayRev,
        today_count: kToday.rows[0].n,
        today_discount: kToday.rows[0].disc,
        gross_profit_today: grossToday,
        margin_today: todayRev > 0 ? (grossToday / todayRev) * 100 : 0,
        week_sales: kWeek.rows[0].v,
        stock_cost: stockVal.rows[0].cost,
        stock_retail: stockVal.rows[0].retail,
        units: stockVal.rows[0].units,
        products: products.rows[0].n,
        customers: customers.rows[0].n,
        low_stock: lowCount.rows[0].n,
        near_expiry: nearCount.rows[0].n,
      },
      trend: trend.rows,
      payment_mix: byPayment.rows,
      top_products: top.rows,
      recent_sales: recent.rows,
      low_stock_items: lowItems.rows,
      expiring_items: expItems.rows,
      // legacy keys (back-compat)
      products: products.rows[0].n,
      stock_value: stockVal.rows[0].cost,
      low_stock: lowCount.rows[0].n,
      near_expiry: nearCount.rows[0].n,
      today_sales: todayRev,
      today_sales_count: kToday.rows[0].n,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
