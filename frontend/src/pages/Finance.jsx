import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { money } from "../lib/money.js";
import {
  Wallet, Loader2, X, LockOpen, Lock, ArrowDownToLine, HandCoins, Plus,
  Banknote, CreditCard, Smartphone, Receipt, TrendingDown, ScrollText, AlertTriangle, CheckCircle2,
} from "lucide-react";

const PAY_ICON = { cash: Banknote, card: CreditCard, mobile: Smartphone, account: HandCoins };
const TABS = [
  { key: "till", label: "Till", icon: Wallet },
  { key: "expenses", label: "Expenses", icon: TrendingDown },
  { key: "history", label: "History", icon: ScrollText },
];

export default function Finance() {
  const { hasRole } = useAuth();
  const [tab, setTab] = useState("till");
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">Finance</h1>
        <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">Cash drawer, expenses and end-of-day reconciliation.</p>
      </div>
      <div className="flex gap-1 rounded-xl border border-sage-200 bg-white p-1 dark:border-sage-800 dark:bg-sage-900 sm:inline-flex">
        {TABS.filter((t) => t.key !== "history" || hasRole("owner", "manager")).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition sm:flex-none ${tab === t.key ? "bg-brand-600 text-white shadow-soft" : "text-sage-500 hover:bg-sage-100 dark:text-sage-300 dark:hover:bg-sage-800"}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
      {tab === "till" && <Till />}
      {tab === "expenses" && <Expenses />}
      {tab === "history" && <History />}
    </div>
  );
}

function Till() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [modal, setModal] = useState(null); // 'open' | 'close' | 'cash'
  const [closed, setClosed] = useState(null);

  const load = () => api("/api/finance/shift/current").then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  if (!data) return <div className="flex h-32 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  if (!data.shift) {
    return (
      <>
        <div className="card p-10 text-center">
          <Wallet className="mx-auto mb-3 h-10 w-10 text-sage-300" />
          <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">No open till</h2>
          <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">Open the till with your starting cash float to begin a shift.</p>
          <button className="btn-primary mx-auto mt-5" onClick={() => setModal("open")}><LockOpen className="h-4 w-4" /> Open till</button>
        </div>
        {modal === "open" && <OpenModal onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      </>
    );
  }

  const s = data.shift;
  return (
    <div className="space-y-5">
      {closed && <ClosedBanner z={closed} onDismiss={() => { setClosed(null); load(); }} />}

      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-brand-600"><LockOpen className="h-5 w-5" /><span className="text-sm font-medium uppercase tracking-wide text-sage-400">Till open</span></div>
            <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">Since {new Date(s.opened_at).toLocaleString()} · float {money(s.opening_float)}</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => setModal("cash")}><ArrowDownToLine className="h-4 w-4" /> Cash drop</button>
            <button className="btn-primary" onClick={() => setModal("close")}><Lock className="h-4 w-4" /> Close till</button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          <Metric label="Sales" value={money(data.total_sales)} sub={`${data.sales_count} txns`} />
          <Metric label="Cash sales" value={money(data.cash_sales)} />
          <Metric label="Drops / pay-outs" value={money(data.drops + data.payouts)} />
          <Metric label="Expected in drawer" value={money(data.expected_cash)} accent />
        </div>

        {data.by_method.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {data.by_method.map((m) => {
              const Icon = PAY_ICON[m.payment_method] || Banknote;
              return (
                <span key={m.payment_method} className="chip bg-sage-100 capitalize text-sage-600 dark:bg-sage-800 dark:text-sage-300">
                  <Icon className="h-3.5 w-3.5" /> {m.payment_method}: {money(m.amount)} ({m.n})
                </span>
              );
            })}
          </div>
        )}
      </div>

      {err && <div className="text-sm text-rose-600">{err}</div>}

      {modal === "cash" && <CashModal onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal === "close" && <CloseModal expected={data.expected_cash} onClose={() => setModal(null)} onDone={(z) => { setModal(null); setClosed(z); }} />}
    </div>
  );
}

function Metric({ label, value, sub, accent }) {
  return (
    <div className="rounded-xl bg-sage-50 p-4 dark:bg-sage-950">
      <div className={`text-xl font-semibold tracking-tight ${accent ? "text-brand-600 dark:text-brand-400" : "text-sage-900 dark:text-sage-50"}`}>{value}</div>
      <div className="text-xs text-sage-500 dark:text-sage-400">{label}</div>
      {sub && <div className="text-[11px] text-sage-400">{sub}</div>}
    </div>
  );
}

function ClosedBanner({ z, onDismiss }) {
  const over = z.variance > 0, under = z.variance < 0;
  return (
    <div className={`card border-2 p-5 ${z.variance === 0 ? "border-brand-300" : "border-amber-300"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {z.variance === 0 ? <CheckCircle2 className="h-5 w-5 text-brand-600" /> : <AlertTriangle className="h-5 w-5 text-amber-500" />}
          <h3 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Till closed</h3>
        </div>
        <button onClick={onDismiss} className="btn-ghost !px-2 !py-2"><X className="h-5 w-5" /></button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Metric label="Expected" value={money(z.expected_cash)} />
        <Metric label="Counted" value={money(z.closing_counted)} />
        <Metric label={over ? "Over" : under ? "Short" : "Balanced"} value={money(Math.abs(z.variance))} accent />
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-sm p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">{title}</h3>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function OpenModal({ onClose, onDone }) {
  const [float, setFloat] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await api("/api/finance/shift/open", { method: "POST", body: { opening_float: Number(float) || 0 } }); onDone(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title="Open till" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div><label className="label">Opening cash float</label><input type="number" min="0" step="0.01" className="input" value={float} onChange={(e) => setFloat(e.target.value)} autoFocus placeholder="0.00" /></div>
        {err && <div className="text-sm text-rose-600">{err}</div>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />} Open till</button>
      </form>
    </Modal>
  );
}

function CashModal({ onClose, onDone }) {
  const [type, setType] = useState("drop");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await api("/api/finance/cash", { method: "POST", body: { type, amount: Number(amount), note } }); onDone(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title="Cash movement" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {[["drop", "Drop"], ["payout", "Pay-out"], ["in", "Top-up"]].map(([k, l]) => (
            <button type="button" key={k} onClick={() => setType(k)} className={`rounded-xl border px-2 py-2 text-sm font-medium ${type === k ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300" : "border-sage-200 text-sage-500 dark:border-sage-700"}`}>{l}</button>
          ))}
        </div>
        <div><label className="label">Amount</label><input type="number" min="0" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
        <div><label className="label">Note</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. drop to safe" /></div>
        {err && <div className="text-sm text-rose-600">{err}</div>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />} Record</button>
      </form>
    </Modal>
  );
}

function CloseModal({ expected, onClose, onDone }) {
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { const z = await api("/api/finance/shift/close", { method: "POST", body: { closing_counted: Number(counted), note } }); onDone(z); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title="Close till (blind count)" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-sage-500 dark:text-sage-400">Count the cash in the drawer and enter the total. The expected figure stays hidden until you confirm — this keeps the count honest.</p>
        <div><label className="label">Counted cash</label><input type="number" min="0" step="0.01" className="input" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus required /></div>
        <div><label className="label">Note</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></div>
        {err && <div className="text-sm text-rose-600">{err}</div>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Close & reconcile</button>
      </form>
    </Modal>
  );
}

function Expenses() {
  const [data, setData] = useState(null);
  const [show, setShow] = useState(false);
  const load = () => api("/api/finance/expenses").then(setData).catch(() => {});
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-sage-500 dark:text-sage-400">{data ? `${money(data.total)} recorded` : "Loading…"}</p>
        <button className="btn-primary" onClick={() => setShow(true)}><Plus className="h-4 w-4" /> Add expense</button>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-sage-200 text-left text-xs uppercase tracking-wide text-sage-400 dark:border-sage-800">
            <th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">Category</th><th className="px-5 py-3 font-medium">Note</th><th className="px-5 py-3 font-medium">By</th><th className="px-5 py-3 text-right font-medium">Amount</th>
          </tr></thead>
          <tbody>
            {!data ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-sage-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : data.expenses.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-sage-400">No expenses recorded.</td></tr>
            ) : data.expenses.map((e) => (
              <tr key={e.id} className="border-b border-sage-100 last:border-0 dark:border-sage-800/60">
                <td className="px-5 py-3 text-sage-500">{new Date(e.created_at).toLocaleDateString()}</td>
                <td className="px-5 py-3 text-sage-800 dark:text-sage-100">{e.category || "—"}</td>
                <td className="px-5 py-3 text-sage-500">{e.note || "—"}</td>
                <td className="px-5 py-3 text-sage-500">{e.by_name || "—"}</td>
                <td className="px-5 py-3 text-right font-medium text-rose-600 dark:text-rose-400">{money(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {show && <ExpenseModal onClose={() => setShow(false)} onDone={() => { setShow(false); load(); }} />}
    </div>
  );
}

function ExpenseModal({ onClose, onDone }) {
  const [f, setF] = useState({ category: "", amount: "", note: "", paid_from_till: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await api("/api/finance/expenses", { method: "POST", body: { ...f, amount: Number(f.amount) } }); onDone(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title="Add expense" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div><label className="label">Category</label><input className="input" list="exp-cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Rent, Utilities, Transport…" />
          <datalist id="exp-cats"><option value="Rent" /><option value="Utilities" /><option value="Transport" /><option value="Salaries" /><option value="Supplies" /><option value="Maintenance" /></datalist>
        </div>
        <div><label className="label">Amount</label><input type="number" min="0" step="0.01" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required autoFocus /></div>
        <div><label className="label">Note</label><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
        <label className="flex items-center gap-2.5 text-sm text-sage-700 dark:text-sage-300">
          <input type="checkbox" checked={f.paid_from_till} onChange={(e) => setF({ ...f, paid_from_till: e.target.checked })} className="h-4 w-4 rounded border-sage-300 text-brand-600 focus:ring-brand-500" />
          Paid from till (affects drawer reconciliation)
        </label>
        {err && <div className="text-sm text-rose-600">{err}</div>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save expense</button>
      </form>
    </Modal>
  );
}

function History() {
  const [list, setList] = useState(null);
  useEffect(() => { api("/api/finance/shifts").then(setList).catch(() => setList([])); }, []);
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-sage-200 text-left text-xs uppercase tracking-wide text-sage-400 dark:border-sage-800">
          <th className="px-5 py-3 font-medium">Closed</th><th className="px-5 py-3 font-medium">Cashier</th><th className="px-5 py-3 text-right font-medium">Expected</th><th className="px-5 py-3 text-right font-medium">Counted</th><th className="px-5 py-3 text-right font-medium">Variance</th>
        </tr></thead>
        <tbody>
          {!list ? (
            <tr><td colSpan={5} className="px-5 py-10 text-center text-sage-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
          ) : list.length === 0 ? (
            <tr><td colSpan={5} className="px-5 py-12 text-center text-sage-400">No closed shifts yet.</td></tr>
          ) : list.map((s) => (
            <tr key={s.id} className="border-b border-sage-100 last:border-0 dark:border-sage-800/60">
              <td className="px-5 py-3 text-sage-500">{s.closed_at ? new Date(s.closed_at).toLocaleString() : "—"}</td>
              <td className="px-5 py-3 text-sage-800 dark:text-sage-100">{s.cashier || "—"}</td>
              <td className="px-5 py-3 text-right text-sage-600 dark:text-sage-300">{money(s.expected_cash)}</td>
              <td className="px-5 py-3 text-right text-sage-600 dark:text-sage-300">{money(s.closing_counted)}</td>
              <td className="px-5 py-3 text-right font-medium">
                <span className={Number(s.variance) === 0 ? "text-brand-600 dark:text-brand-400" : "text-amber-600 dark:text-amber-400"}>
                  {Number(s.variance) > 0 ? "+" : ""}{money(s.variance)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
