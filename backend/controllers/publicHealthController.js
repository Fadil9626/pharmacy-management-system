const pool = require("../config/db");
const { effectiveBranch } = require("../lib/context");

// Curated syndromic indicators offered in the UI. Free text is still accepted,
// but these align to common Ministry-of-Health surveillance categories.
const TAGS = [
  { key: "malaria", label: "Malaria" },
  { key: "diarrhoeal_disease", label: "Diarrhoeal disease" },
  { key: "respiratory_infection", label: "Acute respiratory infection" },
  { key: "fever_unknown", label: "Fever (unknown origin)" },
  { key: "hypertension", label: "Hypertension" },
  { key: "diabetes", label: "Diabetes" },
  { key: "std_sti", label: "STI" },
  { key: "tuberculosis", label: "Tuberculosis" },
  { key: "mental_health", label: "Mental health" },
  { key: "maternal_health", label: "Maternal health" },
];
const LABELS = Object.fromEntries(TAGS.map((t) => [t.key, t.label]));

exports.tags = (_req, res) => res.json(TAGS);

// Aggregate dispensing of surveillance-tagged products into case signals,
// bucketed by period (week or month) and catchment (branch). "cases" counts
// distinct sales touching the indicator; "units" sums quantity dispensed.
exports.surveillance = async (req, res) => {
  const branchId = effectiveBranch(req); // null = all branches
  const period = req.query.period === "month" ? "month" : "week";
  const from = req.query.from ? `${req.query.from} 00:00:00` : null;
  const to = req.query.to ? `${req.query.to} 23:59:59` : null;
  try {
    const { rows } = await pool.query(
      `SELECT to_char(date_trunc($1, s.created_at),
                CASE WHEN $1 = 'month' THEN 'YYYY-MM' ELSE 'IYYY-"W"IW' END) AS period,
              date_trunc($1, s.created_at) AS bucket_start,
              COALESCE(b.name, '—') AS branch,
              p.surveillance_tag AS tag,
              COUNT(DISTINCT s.id)::int AS cases,
              SUM(si.qty)::int AS units
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       LEFT JOIN branches b ON s.branch_id = b.id
       WHERE p.surveillance_tag IS NOT NULL
         AND ($2::int IS NULL OR s.branch_id = $2)
         AND ($3::timestamptz IS NULL OR s.created_at >= $3)
         AND ($4::timestamptz IS NULL OR s.created_at <= $4)
       GROUP BY period, bucket_start, branch, p.surveillance_tag
       ORDER BY bucket_start DESC, branch, p.surveillance_tag`,
      [period, branchId, from, to]
    );
    const data = rows.map((r) => ({
      period: r.period,
      period_start: r.bucket_start,
      branch: r.branch,
      tag: r.tag,
      indicator: LABELS[r.tag] || r.tag,
      cases: r.cases,
      units: r.units,
    }));
    res.json({
      period,
      from: req.query.from || null,
      to: req.query.to || null,
      total_cases: data.reduce((s, r) => s + r.cases, 0),
      rows: data,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
