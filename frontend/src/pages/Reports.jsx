import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import {
  TrendingUp, Wallet, Receipt, Percent, Loader2, CalendarClock,
  Boxes, Banknote, CreditCard, Smartphone, Trophy, AlertTriangle,
  Download, Tag, UserRound, Clock, Undo2, GitBranch, Activity,
} from "lucide-react";
import { money, money0, num } from "../lib/money.js";
import { downloadCSV } from "../lib/csv.js";

function ExportBtn({ rows, name }) {
  if (!rows || !rows.length) return null;
  return (
    <button onClick={() => downloadCSV(name, rows)} className="btn-ghost !px-2 !py-1 text-xs text-sage-400 hover:text-brand-600" title="Export CSV">
      <Download className="h-3.5 w-3.5" /> CSV
    </button>
  );
}

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};

const PRESETS = [
  { key: "today", label: "Today", from: () => iso(new Date()) },
  { key: "7d", label: "7 days", from: () => daysAgo(6) },
  { key: "30d", label: "30 days", from: () => daysAgo(29) },
  { key: "90d", label: "90 days", from: () => daysAgo(89) },
];

const PAY_ICON = { cash: Banknote, card: CreditCard, mobile: Smartphone };

export default function Reports() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(iso(new Date()));
  const [preset, setPreset] = useState("30d");
  const [sales, setSales] = useState(null);
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState("");
  const [ph, setPh] = useState(null);
  const [phPeriod, setPhPeriod] = useState("week");

  useEffect(() => {
    setSales(null);
    api("/api/reports/sales", { params: { from, to } }).then(setSales).catch((e) => setErr(e.message));
  }, [from, to]);
  useEffect(() => {
    api("/api/reports/inventory", { params: { days: 90 } }).then(setInv).catch(() => {});
  }, []);
  useEffect(() => {
    setPh(null);
    api("/api/public-health/surveillance", { params: { from, to, period: phPeriod } }).then(setPh).catch(() => setPh({ rows: [], total_cases: 0 }));
  }, [from, to, phPeriod]);

  const applyPreset = (p) => {
    setPreset(p.key);
    setFrom(p.from());
    setTo(iso(new Date()));
  };

  const maxRev = useMemo(
    () => Math.max(1, ...(sales?.by_day || []).map((d) => d.revenue)),
    [sales]
  );
  const payTotal = useMemo(
    () => (sales?.by_payment || []).reduce((s, p) => s + p.revenue, 0) || 1,
    [sales]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">Reports &amp; Analytics</h1>
          <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">
            Sales, margins, breakdowns and stock health — export any table to CSV.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-sage-200 bg-white p-1 dark:border-sage-800 dark:bg-sage-900">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  preset === p.key
                    ? "bg-brand-600 text-white"
                    : "text-sage-500 hover:bg-sage-100 dark:text-sage-300 dark:hover:bg-sage-800"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input type="date" className="input !w-auto !py-2" value={from} max={to}
                 onChange={(e) => { setFrom(e.target.value); setPreset(""); }} />
          <span className="text-sage-400">→</span>
          <input type="date" className="input !w-auto !py-2" value={to} min={from} max={iso(new Date())}
                 onChange={(e) => { setTo(e.target.value); setPreset(""); }} />
        </div>
      </div>

      {err && (
        <div className="card border-rose-200 p-4 text-sm text-rose-600 dark:border-rose-900/50 dark:text-rose-300">{err}</div>
      )}

      {/* KPI cards */}
      {!sales ? (
        <div className="flex h-32 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={Wallet} tone="brand" label="Net revenue" value={money(sales.summary.revenue)}
                 sub={sales.summary.refunds > 0 ? `${money0(sales.summary.gross_revenue)} − ${money0(sales.summary.refunds)} refunds` : `${sales.summary.txns} sales`} />
            <Kpi icon={TrendingUp} tone="sky" label="Gross profit" value={money(sales.summary.gross_profit)}
                 sub={`COGS ${money0(sales.summary.cogs)} · ${sales.summary.margin_pct.toFixed(1)}% margin`} />
            <Kpi icon={Undo2} tone="rose" label="Refunds" value={money(sales.summary.refunds)}
                 sub={`${sales.summary.refund_count} return${sales.summary.refund_count === 1 ? "" : "s"}`} />
            <Kpi icon={Receipt} tone="amber" label="Avg sale" value={money(sales.summary.avg_sale)}
                 sub={`${sales.summary.txns} transactions`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Trend */}
            <div className="card p-6 lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Sales trend</h2>
                <ExportBtn rows={sales.by_day} name={`daily-sales_${from}_${to}`} />
              </div>
              {sales.by_day.length === 0 ? (
                <Empty label="No sales in this period." />
              ) : (
                <div className="mt-6 flex h-48 items-end gap-1.5">
                  {sales.by_day.map((d) => (
                    <div key={d.day} className="group flex flex-1 flex-col items-center justify-end gap-2">
                      <div className="relative w-full">
                        <div
                          className="w-full rounded-t-md bg-brand-500 transition-all group-hover:bg-brand-600"
                          style={{ height: `${Math.max(4, (d.revenue / maxRev) * 168)}px` }}
                        />
                        <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-sage-900 px-2 py-1 text-xs text-white group-hover:block dark:bg-sage-700">
                          {money0(d.revenue)} · {d.txns}
                        </div>
                      </div>
                      <span className="text-[10px] text-sage-400">
                        {new Date(d.day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payment mix */}
            <div className="card p-6">
              <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Payment mix</h2>
              {sales.by_payment.length === 0 ? (
                <Empty label="—" />
              ) : (
                <div className="mt-5 space-y-4">
                  {sales.by_payment.map((p) => {
                    const Icon = PAY_ICON[p.payment_method] || Banknote;
                    const pct = (p.revenue / payTotal) * 100;
                    return (
                      <div key={p.payment_method}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 capitalize text-sage-700 dark:text-sage-200">
                            <Icon className="h-4 w-4 text-brand-600" /> {p.payment_method}
                          </span>
                          <span className="font-medium text-sage-900 dark:text-sage-50">{money0(p.revenue)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-sage-100 dark:bg-sage-800">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Top products */}
          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Top products</h2>
              </div>
              <ExportBtn rows={sales.top_products} name={`top-products_${from}_${to}`} />
            </div>
            {sales.top_products.length === 0 ? (
              <Empty label="No sales in this period." />
            ) : (
              <div className="space-y-2">
                {sales.top_products.map((p, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sage-100 text-xs font-semibold text-sage-500 dark:bg-sage-800 dark:text-sage-300">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-sage-800 dark:text-sage-100">{p.name}</span>
                    <span className="text-sm text-sage-400">{p.qty} sold</span>
                    <span className="w-24 text-right font-semibold text-sage-900 dark:text-sage-50">{money(p.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Category + staff breakdowns */}
          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownBars title="Sales by category" icon={Tag} rows={sales.by_category}
              labelKey="category" exportName={`by-category_${from}_${to}`} />
            <div className="card p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2"><UserRound className="h-5 w-5 text-brand-600" />
                  <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Sales by staff</h2></div>
                <ExportBtn rows={sales.by_staff} name={`by-staff_${from}_${to}`} />
              </div>
              {sales.by_staff.length === 0 ? <Empty label="No sales." /> : (
                <table className="w-full text-sm">
                  <tbody>
                    {sales.by_staff.map((r, i) => (
                      <tr key={i} className="border-b border-sage-100 last:border-0 dark:border-sage-800/60">
                        <td className="py-2 font-medium text-sage-800 dark:text-sage-100">{r.staff}</td>
                        <td className="py-2 text-right text-sage-400">{r.txns} sales</td>
                        <td className="py-2 text-right font-semibold text-sage-900 dark:text-sage-50">{money0(r.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Hour of day */}
          <div className="card p-6">
            <div className="mb-2 flex items-center gap-2"><Clock className="h-5 w-5 text-brand-600" />
              <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Busiest hours</h2></div>
            <HourChart rows={sales.by_hour} />
          </div>

          {/* Branch comparison (all-branches view) */}
          {sales.by_branch && sales.by_branch.length > 1 && (
            <BreakdownBars title="Sales by branch" icon={GitBranch} rows={sales.by_branch.map((b) => ({ ...b, qty: b.txns }))}
              labelKey="branch" exportName={`by-branch_${from}_${to}`} />
          )}
        </>
      )}

      {/* Inventory health */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-6">
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-brand-600" />
            <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Stock valuation</h2>
          </div>
          {!inv ? <Empty label="…" /> : (
            <div className="mt-4 space-y-3">
              <ValRow label="At cost" value={money(inv.valuation.cost_value)} />
              <ValRow label="At retail" value={money(inv.valuation.retail_value)} />
              <ValRow label="Potential margin"
                      value={money(inv.valuation.retail_value - inv.valuation.cost_value)} accent />
              <div className="flex justify-between border-t border-sage-200 pt-3 text-sm text-sage-500 dark:border-sage-800">
                <span>{num(inv.valuation.units)} units</span>
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" /> {inv.low_stock_count} low
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-rose-500" />
              <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Expiry exposure</h2>
            </div>
            {inv && <span className="text-sm text-sage-400">≤ {inv.days} days · {money0(inv.expiry_value)} at risk</span>}
          </div>
          {!inv ? <Empty label="…" /> : inv.expiry.length === 0 ? (
            <Empty label="No stock expiring soon. 🎉" />
          ) : (
            <div className="mt-4 max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-sage-400">
                  <tr><th className="pb-2 font-medium">Product</th><th className="pb-2 font-medium">Batch</th>
                  <th className="pb-2 text-right font-medium">Qty</th><th className="pb-2 text-right font-medium">Expiry</th></tr>
                </thead>
                <tbody>
                  {inv.expiry.map((b, i) => (
                    <tr key={i} className="border-t border-sage-100 dark:border-sage-800/60">
                      <td className="py-2 font-medium text-sage-800 dark:text-sage-100">{b.name}</td>
                      <td className="py-2 text-sage-400">{b.batch_no || "—"}</td>
                      <td className="py-2 text-right text-sage-600 dark:text-sage-300">{b.quantity}</td>
                      <td className="py-2 text-right">
                        <span className={`chip ${b.expired ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                          {b.expired ? "Expired" : new Date(b.expiry_date).toLocaleDateString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Public-health surveillance — case signals from tagged dispensing */}
      <div className="card p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-rose-500" />
            <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Public-health surveillance</h2>
          </div>
          <div className="flex items-center gap-2">
            {ph && ph.rows.length > 0 && (
              <span className="text-sm text-sage-400">{num(ph.total_cases)} case signals</span>
            )}
            <div className="flex rounded-lg border border-sage-200 p-0.5 text-xs dark:border-sage-800">
              {["week", "month"].map((p) => (
                <button key={p} onClick={() => setPhPeriod(p)}
                  className={"rounded-md px-2.5 py-1 font-medium capitalize transition " + (phPeriod === p ? "bg-brand-600 text-white" : "text-sage-500 dark:text-sage-400")}>
                  {p}ly
                </button>
              ))}
            </div>
            {ph && ph.rows.length > 0 && (
              <button onClick={() => downloadCSV(`surveillance_${phPeriod}_${from}_${to}`,
                ph.rows.map((r) => ({ period: r.period, branch: r.branch, indicator: r.indicator, cases: r.cases, units: r.units })),
                ["period", "branch", "indicator", "cases", "units"])}
                className="btn-ghost !px-2 !py-1 text-xs text-sage-400 hover:text-brand-600" title="Export (DHIS2-style flat CSV)">
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
            )}
          </div>
        </div>
        <p className="mb-4 text-sm text-sage-500 dark:text-sage-400">
          Dispensing of products tagged with a surveillance indicator, aggregated into case signals by period and branch — exportable for Ministry-of-Health reporting.
        </p>
        {!ph ? <Empty label="…" /> : ph.rows.length === 0 ? (
          <Empty label="No surveillance-tagged dispensing in this period. Tag products in Inventory to begin tracking." />
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wide text-sage-400 dark:bg-sage-950">
                <tr>
                  <th className="pb-2 font-medium">Period</th>
                  <th className="pb-2 font-medium">Branch</th>
                  <th className="pb-2 font-medium">Indicator</th>
                  <th className="pb-2 text-right font-medium">Cases</th>
                  <th className="pb-2 text-right font-medium">Units</th>
                </tr>
              </thead>
              <tbody>
                {ph.rows.map((r, i) => (
                  <tr key={i} className="border-t border-sage-100 dark:border-sage-800/60">
                    <td className="py-2 font-medium tabular-nums text-sage-700 dark:text-sage-200">{r.period}</td>
                    <td className="py-2 text-sage-500 dark:text-sage-400">{r.branch}</td>
                    <td className="py-2"><span className="chip bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">{r.indicator}</span></td>
                    <td className="py-2 text-right font-semibold text-sage-900 dark:text-sage-50">{num(r.cases)}</td>
                    <td className="py-2 text-right text-sage-500 dark:text-sage-400">{num(r.units)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }) {
  const tones = {
    brand: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  };
  return (
    <div className="card p-5">
      <span className={`grid h-11 w-11 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
      <div className="mt-4 text-2xl font-semibold tracking-tight text-sage-900 dark:text-sage-50">{value}</div>
      <div className="mt-1 text-sm font-medium text-sage-500 dark:text-sage-400">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-sage-400 dark:text-sage-500">{sub}</div>}
    </div>
  );
}

function ValRow({ label, value, accent }) {
  return (
    <div className="flex justify-between">
      <span className="text-sage-500 dark:text-sage-400">{label}</span>
      <span className={`font-semibold ${accent ? "text-brand-600 dark:text-brand-400" : "text-sage-900 dark:text-sage-50"}`}>{value}</span>
    </div>
  );
}

function BreakdownBars({ title, icon: Icon, rows, labelKey, exportName }) {
  const max = Math.max(1, ...(rows || []).map((r) => r.revenue));
  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2"><Icon className="h-5 w-5 text-brand-600" />
          <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">{title}</h2></div>
        <ExportBtn rows={rows} name={exportName} />
      </div>
      {!rows || rows.length === 0 ? <Empty label="No sales." /> : (
        <div className="space-y-3">
          {rows.slice(0, 8).map((r, i) => (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="truncate font-medium text-sage-800 dark:text-sage-100">{r[labelKey]}</span>
                <span className="shrink-0 pl-2 text-sage-500 dark:text-sage-400">{money0(r.revenue)} <span className="text-xs text-sage-400">· {r.qty}</span></span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-sage-100 dark:bg-sage-800">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${(r.revenue / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HourChart({ rows }) {
  const byHour = {};
  (rows || []).forEach((r) => { byHour[r.hour] = r; });
  const hours = Array.from({ length: 24 }, (_, h) => byHour[h] || { hour: h, revenue: 0, txns: 0 });
  const max = Math.max(1, ...hours.map((h) => h.revenue));
  const total = hours.reduce((s, h) => s + h.revenue, 0);
  if (total === 0) return <Empty label="No sales in this period." />;
  return (
    <div className="mt-3 flex h-32 items-end gap-0.5">
      {hours.map((h) => (
        <div key={h.hour} className="group flex flex-1 flex-col items-center justify-end gap-1">
          <div className="relative w-full">
            <div className="w-full rounded-t bg-brand-500 transition-all group-hover:bg-brand-600"
                 style={{ height: `${Math.max(2, (h.revenue / max) * 104)}px` }} />
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-sage-900 px-1.5 py-0.5 text-[10px] text-white group-hover:block dark:bg-sage-700">
              {String(h.hour).padStart(2, "0")}:00 · {money0(h.revenue)}
            </div>
          </div>
          {h.hour % 3 === 0 && <span className="text-[9px] text-sage-400">{h.hour}</span>}
        </div>
      ))}
    </div>
  );
}

function Empty({ label }) {
  return <div className="flex h-32 items-center justify-center text-sm text-sage-400">{label}</div>;
}
