import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { money, money0, num } from "../lib/money.js";
import {
  Wallet, TrendingUp, Receipt, Boxes, AlertTriangle, CalendarClock, Users,
  ShoppingCart, ArrowRight, ArrowUpRight, Loader2, Banknote, CreditCard,
  Smartphone, HandCoins, Trophy, Package, Clock,
} from "lucide-react";

const PAY_ICON = { cash: Banknote, card: CreditCard, mobile: Smartphone, account: HandCoins };

export default function Dashboard() {
  const { user, settings } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/api/dashboard").then(setD).catch((e) => setErr(e.message));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = (user?.full_name || "").split(" ")[0];

  if (err) return <div className="card border-rose-200 p-4 text-sm text-rose-600 dark:border-rose-900/50 dark:text-rose-300">{err}</div>;
  if (!d) return <div className="flex h-64 items-center justify-center text-sage-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const k = d.kpis;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">
            {greeting}, {first}
          </h1>
          <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            {settings?.pharmacy_name ? ` · ${settings.pharmacy_name}` : ""}
          </p>
        </div>
        <Link to="/pos" className="btn-primary"><ShoppingCart className="h-4 w-4" /> New sale</Link>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi tone="brand" icon={Wallet} label="Sales today" value={money(k.today_sales)}
          foot={`${k.today_count} ${k.today_count === 1 ? "sale" : "sales"}`} />
        <Kpi tone="sky" icon={TrendingUp} label="Gross profit today" value={money(k.gross_profit_today)}
          foot={`${k.margin_today.toFixed(0)}% margin`} />
        <Kpi tone="violet" icon={Receipt} label="This week" value={money0(k.week_sales)} foot="last 7 days" />
        <Kpi tone="amber" icon={Boxes} label="Stock value" value={money0(k.stock_cost)}
          foot={`${num(k.units)} units · ${k.products} products`} />
      </div>

      {/* Trend + payment mix */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Sales · last 14 days</h2>
            <Link to="/reports" className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">Reports →</Link>
          </div>
          <TrendChart data={d.trend} />
        </div>

        <div className="card p-6">
          <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Payment mix</h2>
          <p className="text-xs text-sage-400">last 30 days</p>
          {d.payment_mix.length === 0 ? <Empty label="No sales yet." /> : (
            <div className="mt-4 space-y-3">
              {(() => {
                const total = d.payment_mix.reduce((s, p) => s + p.amount, 0) || 1;
                return d.payment_mix.map((p) => {
                  const Icon = PAY_ICON[p.payment_method] || Banknote;
                  const pct = (p.amount / total) * 100;
                  return (
                    <div key={p.payment_method}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 capitalize text-sage-700 dark:text-sage-200"><Icon className="h-4 w-4 text-brand-600" /> {p.payment_method}</span>
                        <span className="font-medium text-sage-900 dark:text-sage-50">{money0(p.amount)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-sage-100 dark:bg-sage-800">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Alerts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <StatPill tone="amber" icon={AlertTriangle} value={k.low_stock} label="Low on stock" to="/inventory" />
        <StatPill tone="rose" icon={CalendarClock} value={k.near_expiry} label="Expiring soon" to="/inventory" />
        <StatPill tone="brand" icon={Users} value={num(k.customers)} label="Customers" to="/customers" />
      </div>

      {/* Top products + recent sales */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Top products</h2>
            <span className="text-xs text-sage-400">30 days</span>
          </div>
          {d.top_products.length === 0 ? <Empty label="No sales yet." /> : (
            <div className="space-y-3">
              {(() => {
                const max = Math.max(...d.top_products.map((p) => p.revenue), 1);
                return d.top_products.map((p, i) => (
                  <div key={i}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="truncate font-medium text-sage-800 dark:text-sage-100">{p.name}</span>
                      <span className="shrink-0 pl-2 text-sage-500 dark:text-sage-400">{money0(p.revenue)} <span className="text-xs text-sage-400">· {p.qty}</span></span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-sage-100 dark:bg-sage-800">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${(p.revenue / max) * 100}%` }} />
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-brand-600" />
              <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Recent sales</h2>
            </div>
            <Link to="/sales" className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">All →</Link>
          </div>
          {d.recent_sales.length === 0 ? <Empty label="No sales yet." /> : (
            <div className="space-y-1">
              {d.recent_sales.map((s, i) => {
                const Icon = PAY_ICON[s.payment_method] || Banknote;
                return (
                  <div key={i} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-sage-50 dark:hover:bg-sage-800/50">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-sage-100 text-sage-500 dark:bg-sage-800 dark:text-sage-400"><Icon className="h-4 w-4" /></span>
                      <div>
                        <div className="text-sm font-medium text-sage-800 dark:text-sage-100">{s.receipt_no}</div>
                        <div className="text-xs text-sage-400">{s.customer_name || "Walk-in"} · {timeAgo(s.created_at)}</div>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-sage-900 dark:text-sage-50">{money(s.total)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Stock alerts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AlertList title="Reorder soon" icon={Package} tone="amber" empty="Everything's well stocked."
          rows={d.low_stock_items} render={(r) => (
            <>
              <span className="truncate font-medium text-sage-800 dark:text-sage-100">{r.name}</span>
              <span className="shrink-0 pl-2 text-sm">
                <span className="font-semibold text-amber-600 dark:text-amber-400">{r.stock}</span>
                <span className="text-sage-400"> / {r.reorder_level} {r.unit}</span>
              </span>
            </>
          )} action={<Link to="/purchasing" className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">Purchasing →</Link>} />

        <AlertList title="Expiring soon" icon={CalendarClock} tone="rose" empty="No stock expiring soon."
          rows={d.expiring_items} render={(r) => (
            <>
              <span className="truncate font-medium text-sage-800 dark:text-sage-100">{r.name} <span className="text-xs text-sage-400">{r.batch_no || ""}</span></span>
              <span className={`chip shrink-0 ${r.expired ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                {r.expired ? "Expired" : new Date(r.expiry_date).toLocaleDateString()} · {r.quantity}
              </span>
            </>
          )} />
      </div>
    </div>
  );
}

const TONES = {
  brand: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

function Kpi({ icon: Icon, label, value, foot, tone }) {
  return (
    <div className="card p-5">
      <span className={`grid h-11 w-11 place-items-center rounded-xl ${TONES[tone]}`}><Icon className="h-5 w-5" /></span>
      <div className="mt-4 text-2xl font-semibold tracking-tight text-sage-900 dark:text-sage-50">{value}</div>
      <div className="mt-0.5 text-sm font-medium text-sage-500 dark:text-sage-400">{label}</div>
      {foot && <div className="mt-0.5 text-xs text-sage-400">{foot}</div>}
    </div>
  );
}

function StatPill({ icon: Icon, value, label, tone, to }) {
  return (
    <Link to={to} className="card flex items-center gap-4 p-5 transition hover:shadow-md">
      <span className={`grid h-12 w-12 place-items-center rounded-xl ${TONES[tone]}`}><Icon className="h-6 w-6" /></span>
      <div className="flex-1">
        <div className="text-2xl font-semibold text-sage-900 dark:text-sage-50">{value}</div>
        <div className="text-sm text-sage-500 dark:text-sage-400">{label}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-sage-300 dark:text-sage-600" />
    </Link>
  );
}

function AlertList({ title, icon: Icon, tone, rows, render, empty, action }) {
  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${tone === "rose" ? "text-rose-500" : "text-amber-500"}`} />
          <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">{title}</h2>
        </div>
        {action}
      </div>
      {rows.length === 0 ? <Empty label={empty} /> : (
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between border-b border-sage-100 py-2 last:border-0 dark:border-sage-800/60">
              {render(r)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Dependency-free SVG area chart
function TrendChart({ data }) {
  const { path, area, max, points } = useMemo(() => {
    const W = 600, H = 140, pad = 6;
    const vals = data.map((d) => d.revenue);
    const max = Math.max(...vals, 1);
    const n = data.length;
    const x = (i) => pad + (i * (W - 2 * pad)) / Math.max(n - 1, 1);
    const y = (v) => H - pad - (v / max) * (H - 2 * pad);
    const points = data.map((d, i) => ({ x: x(i), y: y(d.revenue), d }));
    const line = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = `${line} L${x(n - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;
    return { path: line, area, max, points };
  }, [data]);

  const total = data.reduce((s, d) => s + d.revenue, 0);
  if (total === 0) return <Empty label="No sales in the last 14 days." />;

  return (
    <div className="mt-4">
      <svg viewBox="0 0 600 140" className="h-40 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--brand-500))" stopOpacity="0.28" />
            <stop offset="100%" stopColor="rgb(var(--brand-500))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#trendFill)" />
        <path d={path} fill="none" stroke="rgb(var(--brand-600))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="rgb(var(--brand-600))" vectorEffect="non-scaling-stroke">
            <title>{new Date(p.d.day).toLocaleDateString()} · {money(p.d.revenue)} ({p.d.count})</title>
          </circle>
        ))}
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-sage-400">
        <span>{new Date(data[0].day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        <span>Peak {money0(max)}</span>
        <span>{new Date(data[data.length - 1].day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
      </div>
    </div>
  );
}

function Empty({ label }) {
  return <div className="flex h-28 items-center justify-center text-sm text-sage-400">{label}</div>;
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}
