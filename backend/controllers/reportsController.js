const pool = require("../config/db");

const { effectiveBranch } = require("../lib/context");
const branchOf = effectiveBranch;

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

// ── VAT / tax return for a period ───────────────────────────
// Output VAT = tax collected on sales, less tax refunded on returns.
exports.vatReturn = async (req, res) => {
  const branchId = branchOf(req);
  const { from, to } = range(req);
  try {
    const [byDay, totals, refunds] = await Promise.all([
      pool.query(
        `SELECT to_char(created_at::date,'YYYY-MM-DD') AS day, COUNT(*)::int AS txns,
                COALESCE(SUM(subtotal - discount),0)::float AS net, COALESCE(SUM(tax),0)::float AS vat,
                COALESCE(SUM(total),0)::float AS gross
         FROM sales WHERE created_at::date BETWEEN $1 AND $2 AND ($3::int IS NULL OR branch_id=$3)
         GROUP BY day ORDER BY day`, [from, to, branchId]),
      pool.query(
        `SELECT COUNT(*)::int AS txns, COALESCE(SUM(subtotal-discount),0)::float AS net,
                COALESCE(SUM(tax),0)::float AS vat, COALESCE(SUM(total),0)::float AS gross
         FROM sales WHERE created_at::date BETWEEN $1 AND $2 AND ($3::int IS NULL OR branch_id=$3)`, [from, to, branchId]),
      pool.query(
        `SELECT COALESCE(SUM(tax),0)::float AS vat, COALESCE(SUM(total),0)::float AS gross
         FROM sale_returns WHERE created_at::date BETWEEN $1 AND $2 AND ($3::int IS NULL OR branch_id=$3)`, [from, to, branchId]),
    ]);
    const t = totals.rows[0], r = refunds.rows[0];
    const taxPct = Number((await pool.query("SELECT tax_percent FROM settings WHERE id=1")).rows[0]?.tax_percent || 0);
    res.json({
      from, to, tax_percent: taxPct,
      by_day: byDay.rows,
      gross_sales: t.gross, net_sales: t.net, output_vat: t.vat, txns: t.txns,
      refunds_gross: r.gross, refunds_vat: r.vat,
      net_vat_due: Math.round((t.vat - r.vat) * 100) / 100,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Email a sales summary (manual "send now"; cron the same endpoint for a
// scheduled daily/weekly report). Recipients default to the configured alert
// emails, else the pharmacy email.
exports.emailSummary = async (req, res) => {
  const { notify, getConfig } = require("../lib/notify");
  const period = req.body?.period === "week" ? "week" : "today";
  const days = period === "week" ? 7 : 1;
  try {
    const branchId = branchOf(req);
    const s = (await pool.query("SELECT pharmacy_name, currency_symbol, email FROM settings WHERE id=1")).rows[0] || {};
    const sym = s.currency_symbol || "";
    const m = (n) => `${sym}${Number(n || 0).toFixed(2)}`;
    const sum = (await pool.query(
      `SELECT COUNT(*)::int txns, COALESCE(SUM(total),0)::float revenue, COALESCE(SUM(tax),0)::float vat,
              COALESCE(SUM(discount),0)::float discounts
       FROM sales WHERE created_at >= NOW() - ($1||' days')::interval AND ($2::int IS NULL OR branch_id=$2)`,
      [String(days), branchId])).rows[0];
    const top = (await pool.query(
      `SELECT si.name, SUM(si.qty)::int qty, SUM(si.line_total)::float total
       FROM sale_items si JOIN sales s ON si.sale_id=s.id
       WHERE s.created_at >= NOW() - ($1||' days')::interval AND ($2::int IS NULL OR s.branch_id=$2)
       GROUP BY si.name ORDER BY total DESC LIMIT 5`, [String(days), branchId])).rows;

    const cfg = await getConfig();
    const recipients = req.body?.recipients?.length ? req.body.recipients
      : (cfg.recipients?.emails?.length ? cfg.recipients.emails : [s.email].filter(Boolean));
    if (!recipients.length) return res.status(400).json({ message: "No recipient — set an alert email in Notifications first." });

    const body =
      `${s.pharmacy_name || "Remedy"} — ${period === "week" ? "Weekly" : "Daily"} sales summary\n\n` +
      `Sales: ${sum.txns} · Revenue: ${m(sum.revenue)} · VAT: ${m(sum.vat)} · Discounts: ${m(sum.discounts)}\n\n` +
      `Top products:\n` + (top.length ? top.map((t) => `  • ${t.name}: ${t.qty} sold, ${m(t.total)}`).join("\n") : "  (none)");
    let sent = 0;
    for (const to of recipients) { await notify({ channel: "email", to, type: "report", subject: `${s.pharmacy_name || "Remedy"} — ${period} sales summary`, body }); sent++; }
    res.json({ ok: true, recipients: sent, revenue: sum.revenue });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ── Sales analytics for a date range ────────────────────────
exports.sales = async (req, res) => {
  const branchId = branchOf(req);
  const { from, to } = range(req);
  try {
    const [summary, refunds, cogs, byDay, byPayment, top, byCategory, byStaff, byHour, byBranch] = await Promise.all([
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
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(total),0)::float AS amount,
                COALESCE((SELECT SUM(ri.qty * b.cost_price) FROM sale_return_items ri
                          JOIN sale_returns r2 ON ri.return_id = r2.id
                          LEFT JOIN product_batches b ON ri.batch_id = b.id
                          WHERE r2.created_at::date BETWEEN $1 AND $2 AND ($3::int IS NULL OR r2.branch_id = $3)),0)::float AS cost
         FROM sale_returns r
         WHERE r.created_at::date BETWEEN $1 AND $2 AND ($3::int IS NULL OR r.branch_id = $3)`,
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
        `SELECT sp.method AS payment_method, COUNT(*)::int AS txns,
                COALESCE(SUM(sp.amount), 0)::float AS revenue
         FROM sale_payments sp JOIN sales s ON sp.sale_id = s.id
         WHERE s.created_at::date BETWEEN $1 AND $2 AND ($3::int IS NULL OR s.branch_id = $3)
         GROUP BY sp.method ORDER BY revenue DESC`,
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
      // by category
      pool.query(
        `SELECT COALESCE(c.name, 'Uncategorised') AS category,
                SUM(si.qty)::int AS qty, COALESCE(SUM(si.line_total),0)::float AS revenue
         FROM sale_items si JOIN sales s ON si.sale_id = s.id
         LEFT JOIN products p ON si.product_id = p.id
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE s.created_at::date BETWEEN $1 AND $2 AND ($3::int IS NULL OR s.branch_id = $3)
         GROUP BY COALESCE(c.name, 'Uncategorised') ORDER BY revenue DESC`,
        [from, to, branchId]
      ),
      // by staff (cashier)
      pool.query(
        `SELECT COALESCE(u.full_name, '—') AS staff, COUNT(*)::int AS txns,
                COALESCE(SUM(s.total),0)::float AS revenue
         FROM sales s LEFT JOIN users u ON s.user_id = u.id
         WHERE s.created_at::date BETWEEN $1 AND $2 AND ($3::int IS NULL OR s.branch_id = $3)
         GROUP BY COALESCE(u.full_name, '—') ORDER BY revenue DESC`,
        [from, to, branchId]
      ),
      // by hour of day
      pool.query(
        `SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS txns,
                COALESCE(SUM(total),0)::float AS revenue
         FROM sales
         WHERE created_at::date BETWEEN $1 AND $2 AND ($3::int IS NULL OR branch_id = $3)
         GROUP BY hour ORDER BY hour`,
        [from, to, branchId]
      ),
      // by branch (for the all-branches view)
      pool.query(
        `SELECT COALESCE(b.name,'—') AS branch, COUNT(*)::int AS txns,
                COALESCE(SUM(s.total),0)::float AS revenue
         FROM sales s LEFT JOIN branches b ON s.branch_id = b.id
         WHERE s.created_at::date BETWEEN $1 AND $2 AND ($3::int IS NULL OR s.branch_id = $3)
         GROUP BY COALESCE(b.name,'—') ORDER BY revenue DESC`,
        [from, to, branchId]
      ),
    ]);

    const s = summary.rows[0];
    const ref = refunds.rows[0];
    const grossRevenue = s.revenue;            // before refunds
    const revenue = grossRevenue - ref.amount; // net of refunds
    const cogsVal = cogs.rows[0].cogs - ref.cost; // net of returned cost
    const grossProfit = revenue - cogsVal;
    const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    res.json({
      from, to,
      summary: {
        ...s,
        revenue,                  // net
        gross_revenue: grossRevenue,
        refunds: ref.amount,
        refund_count: ref.n,
        cogs: cogsVal,
        gross_profit: grossProfit,
        margin_pct: margin,
        avg_sale: s.txns > 0 ? grossRevenue / s.txns : 0,
      },
      by_day: byDay.rows,
      by_payment: byPayment.rows,
      top_products: top.rows,
      by_category: byCategory.rows,
      by_staff: byStaff.rows,
      by_hour: byHour.rows,
      by_branch: byBranch.rows,
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
