import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { money, num } from "../lib/money.js";
import {
  Users, Plus, Search, Loader2, X, Phone, Mail, Wallet, Star,
  ArrowLeft, HandCoins, Receipt, CreditCard,
} from "lucide-react";

export default function Customers() {
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState(null); // customer id for detail
  const [showAdd, setShowAdd] = useState(false);

  const load = () => api("/api/customers").then(setList).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!list) return [];
    const t = q.trim().toLowerCase();
    if (!t) return list;
    return list.filter((c) => [c.name, c.phone, c.email].filter(Boolean).some((v) => v.toLowerCase().includes(t)));
  }, [list, q]);

  if (selected) {
    return <CustomerDetail id={selected} onBack={() => { setSelected(null); load(); }} />;
  }

  const owed = (list || []).reduce((a, c) => a + Number(c.balance), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">Customers</h1>
          <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">
            {list ? `${list.length} customers · ${money(owed)} owed on account` : "Loading…"}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> New customer</button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sage-400" />
        <input className="input pl-10" placeholder="Search by name, phone or email…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {err && <div className="card border-rose-200 p-4 text-sm text-rose-600 dark:border-rose-900/50 dark:text-rose-300">{err}</div>}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sage-200 text-left text-xs uppercase tracking-wide text-sage-400 dark:border-sage-800">
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Phone</th>
                <th className="px-5 py-3 font-medium text-right">Points</th>
                <th className="px-5 py-3 font-medium text-right">Spent</th>
                <th className="px-5 py-3 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {!list ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-sage-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-sage-400">No customers found.</td></tr>
              ) : filtered.map((c) => (
                <tr key={c.id} className="cursor-pointer border-b border-sage-100 last:border-0 hover:bg-sage-50 dark:border-sage-800/60 dark:hover:bg-sage-800/40" onClick={() => setSelected(c.id)}>
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-sage-900 dark:text-sage-50">{c.name}</div>
                    {c.email && <div className="text-xs text-sage-400">{c.email}</div>}
                  </td>
                  <td className="px-5 py-3.5 text-sage-500 dark:text-sage-400">{c.phone || "—"}</td>
                  <td className="px-5 py-3.5 text-right text-sage-500">{num(c.loyalty_points)}</td>
                  <td className="px-5 py-3.5 text-right text-sage-600 dark:text-sage-300">{money(c.total_spent)}</td>
                  <td className="px-5 py-3.5 text-right">
                    {Number(c.balance) > 0
                      ? <span className="font-semibold text-amber-600 dark:text-amber-400">{money(c.balance)}</span>
                      : <span className="text-sage-300 dark:text-sage-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && <CustomerForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-md p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">{title}</h3>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CustomerForm({ customer, onClose, onSaved }) {
  const editing = !!customer;
  const [f, setF] = useState({
    name: customer?.name || "", phone: customer?.phone || "", email: customer?.email || "",
    address: customer?.address || "", credit_limit: customer?.credit_limit ?? "", notes: customer?.notes || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await api(editing ? `/api/customers/${customer.id}` : "/api/customers", { method: editing ? "PATCH" : "POST", body: f });
      onSaved();
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title={editing ? "Edit customer" : "New customer"} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div><label className="label">Name *</label><input className="input" value={f.name} onChange={set("name")} required autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Phone</label><input className="input" value={f.phone} onChange={set("phone")} /></div>
          <div><label className="label">Email</label><input className="input" value={f.email} onChange={set("email")} /></div>
        </div>
        <div><label className="label">Address</label><input className="input" value={f.address} onChange={set("address")} /></div>
        <div>
          <label className="label">Credit limit <span className="font-normal text-sage-400">(0 = no account credit)</span></label>
          <input type="number" min="0" step="0.01" className="input" value={f.credit_limit} onChange={set("credit_limit")} />
        </div>
        <div><label className="label">Notes</label><input className="input" value={f.notes} onChange={set("notes")} /></div>
        {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {editing ? "Save" : "Create"}</button>
        </div>
      </form>
    </Modal>
  );
}

function CustomerDetail({ id, onBack }) {
  const [c, setC] = useState(null);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState(false);

  const load = () => api(`/api/customers/${id}`).then(setC).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]);

  if (err) return <div className="card border-rose-200 p-4 text-sm text-rose-600">{err}</div>;
  if (!c) return <div className="flex h-40 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <button onClick={onBack} className="btn-ghost !px-2"><ArrowLeft className="h-4 w-4" /> All customers</button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">{c.name}</h1>
          <div className="mt-1 flex flex-wrap gap-4 text-sm text-sage-500 dark:text-sage-400">
            {c.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {c.phone}</span>}
            {c.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {c.email}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={() => setEdit(true)}>Edit</button>
          {Number(c.balance) > 0 && <button className="btn-primary" onClick={() => setPay(true)}><HandCoins className="h-4 w-4" /> Take payment</button>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat icon={Wallet} tone="amber" label="Balance owed" value={money(c.balance)} />
        <Stat icon={CreditCard} tone="sky" label="Credit limit" value={money(c.credit_limit)} />
        <Stat icon={Receipt} tone="brand" label="Total spent" value={money(c.total_spent)} />
        <Stat icon={Star} tone="brand" label="Points" value={num(c.loyalty_points)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-3 font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Recent sales</h2>
          {c.sales.length === 0 ? <p className="text-sm text-sage-400">No sales yet.</p> : (
            <div className="space-y-2 text-sm">
              {c.sales.map((s) => (
                <div key={s.id} className="flex justify-between border-b border-sage-100 pb-2 last:border-0 dark:border-sage-800/60">
                  <span className="text-sage-600 dark:text-sage-300">{s.receipt_no} <span className="text-xs text-sage-400">{new Date(s.created_at).toLocaleDateString()}</span></span>
                  <span className="font-medium text-sage-900 dark:text-sage-50">{money(s.total)} <span className="text-xs font-normal text-sage-400">{s.payment_method}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card p-6">
          <h2 className="mb-3 font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Account payments</h2>
          {c.payments.length === 0 ? <p className="text-sm text-sage-400">No payments recorded.</p> : (
            <div className="space-y-2 text-sm">
              {c.payments.map((p) => (
                <div key={p.id} className="flex justify-between border-b border-sage-100 pb-2 last:border-0 dark:border-sage-800/60">
                  <span className="text-sage-600 dark:text-sage-300">{new Date(p.created_at).toLocaleDateString()} <span className="text-xs text-sage-400">{p.method}</span></span>
                  <span className="font-medium text-brand-600 dark:text-brand-400">{money(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {edit && <CustomerForm customer={c} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); load(); }} />}
      {pay && <PaymentModal customer={c} onClose={() => setPay(false)} onSaved={() => { setPay(false); load(); }} />}
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }) {
  const tones = {
    brand: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  };
  return (
    <div className="card p-5">
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
      <div className="mt-3 text-xl font-semibold tracking-tight text-sage-900 dark:text-sage-50">{value}</div>
      <div className="text-xs font-medium text-sage-500 dark:text-sage-400">{label}</div>
    </div>
  );
}

function PaymentModal({ customer, onClose, onSaved }) {
  const [amount, setAmount] = useState(customer.balance);
  const [method, setMethod] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await api(`/api/customers/${customer.id}/payment`, { method: "POST", body: { amount: Number(amount), method } }); onSaved(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title={`Take payment · ${customer.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-sage-500 dark:text-sage-400">Outstanding balance: <b>{money(customer.balance)}</b></p>
        <div><label className="label">Amount</label><input type="number" min="0" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
        <div>
          <label className="label">Method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option><option value="card">Card</option><option value="mobile">Mobile</option>
          </select>
        </div>
        {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />} Record payment</button>
        </div>
      </form>
    </Modal>
  );
}
