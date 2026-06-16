import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { money } from "../lib/money.js";
import ConfirmModal from "../components/Confirm.jsx";
import {
  Tag, Plus, X, Loader2, Pencil, Trash2, Percent, Gift, BadgeDollarSign, Search,
} from "lucide-react";

const TYPE_META = {
  percent: { label: "% off", icon: Percent },
  amount: { label: "Amount off", icon: BadgeDollarSign },
  bxgy: { label: "Buy X get Y", icon: Gift },
};

function summary(p) {
  if (p.type === "percent") return `${p.value}% off`;
  if (p.type === "amount") return `${money(p.value)} off${p.min_subtotal > 0 ? ` over ${money(p.min_subtotal)}` : ""}`;
  if (p.type === "bxgy") return `Buy ${p.buy_qty}, get ${p.get_qty} free`;
  return "";
}
const scopeLabel = (p) => p.scope === "all" ? "Everything" : p.scope === "category" ? (p.category_name || "Category") : `${(p.product_ids || []).length} product(s)`;

export default function Promotions() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null); // promo or {} for new
  const [del, setDel] = useState(null);

  const load = () => api("/api/promotions").then(setList).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const toggle = async (p) => {
    try { await api(`/api/promotions/${p.id}`, { method: "PATCH", body: { ...p, is_active: !p.is_active } }); load(); }
    catch (e) { setErr(e.message); }
  };
  const doDelete = async () => { try { await api(`/api/promotions/${del.id}`, { method: "DELETE" }); setDel(null); load(); } catch (e) { setErr(e.message); } };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">Promotions</h1>
          <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">Discounts auto-applied at the till — % off, amount off, or buy-X-get-Y.</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({})}><Plus className="h-4 w-4" /> New promotion</button>
      </div>

      {err && <div className="card border-rose-200 p-3 text-sm text-rose-600 dark:border-rose-900/50 dark:text-rose-300">{err}</div>}

      {!list ? (
        <div className="flex h-40 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : list.length === 0 ? (
        <div className="card p-10 text-center text-sage-400">No promotions yet. Create one to start running specials.</div>
      ) : (
        <div className="space-y-2">
          {list.map((p) => {
            const Icon = TYPE_META[p.type]?.icon || Tag;
            return (
              <div key={p.id} className="card flex flex-wrap items-center gap-3 p-4">
                <span className={`grid h-10 w-10 place-items-center rounded-xl ${p.live ? "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300" : "bg-sage-100 text-sage-400 dark:bg-sage-800"}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium text-sage-900 dark:text-sage-50">
                    {p.name}
                    {p.live ? <span className="chip bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">Live</span>
                      : <span className="chip bg-sage-100 text-sage-500 dark:bg-sage-800 dark:text-sage-400">{p.is_active ? "Scheduled" : "Off"}</span>}
                  </div>
                  <div className="text-xs text-sage-500 dark:text-sage-400">
                    {summary(p)} · {scopeLabel(p)}
                    {(p.starts_at || p.ends_at) && ` · ${p.starts_at ? new Date(p.starts_at).toLocaleDateString() : "…"} – ${p.ends_at ? new Date(p.ends_at).toLocaleDateString() : "…"}`}
                  </div>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-sage-500">
                  <input type="checkbox" checked={p.is_active} onChange={() => toggle(p)} className="h-4 w-4 rounded border-sage-300 text-brand-600 focus:ring-brand-500" />
                  Active
                </label>
                <button className="btn-ghost !px-2 !py-1.5" onClick={() => setEditing(p)} title="Edit"><Pencil className="h-4 w-4" /></button>
                <button className="btn-ghost !px-2 !py-1.5 text-sage-400 hover:text-rose-500" onClick={() => setDel(p)} title="Delete"><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          })}
        </div>
      )}

      {editing && <PromoModal promo={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {del && <ConfirmModal danger title="Delete promotion" confirmLabel="Delete" message={`Delete "${del.name}"? This can't be undone.`} onConfirm={doDelete} onClose={() => setDel(null)} />}
    </div>
  );
}

function PromoModal({ promo, onClose, onSaved }) {
  const editing = !!promo;
  const [f, setF] = useState({
    name: promo?.name || "", type: promo?.type || "percent", scope: promo?.scope || "all",
    category_id: promo?.category_id || "", product_ids: promo?.product_ids || [],
    value: promo?.value ?? "", min_subtotal: promo?.min_subtotal ?? "",
    buy_qty: promo?.buy_qty ?? 2, get_qty: promo?.get_qty ?? 1,
    starts_at: promo?.starts_at ? String(promo.starts_at).slice(0, 10) : "",
    ends_at: promo?.ends_at ? String(promo.ends_at).slice(0, 10) : "",
    is_active: promo?.is_active ?? true,
  });
  const [cats, setCats] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  useEffect(() => {
    api("/api/categories").then(setCats).catch(() => {});
    api("/api/catalog/lite").then(setCatalog).catch(() => {});
  }, []);

  const picked = catalog.filter((p) => f.product_ids.map(Number).includes(p.id));
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return catalog.filter((p) => p.name.toLowerCase().includes(t) && !f.product_ids.includes(p.id)).slice(0, 6);
  }, [q, catalog, f.product_ids]);
  const addProduct = (p) => { setF((s) => ({ ...s, product_ids: [...s.product_ids, p.id] })); setQ(""); };
  const removeProduct = (id) => setF((s) => ({ ...s, product_ids: s.product_ids.filter((x) => x !== id) }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await api(editing ? `/api/promotions/${promo.id}` : "/api/promotions", {
        method: editing ? "PATCH" : "POST",
        body: { ...f, value: Number(f.value) || 0, min_subtotal: Number(f.min_subtotal) || 0, buy_qty: Number(f.buy_qty) || 0, get_qty: Number(f.get_qty) || 0 },
      });
      onSaved();
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col p-6">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">{editing ? "Edit promotion" : "New promotion"}</h3>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={save} className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div><label className="label">Name</label><input className="input" value={f.name} onChange={set("name")} required autoFocus placeholder="e.g. Weekend 10% off" /></div>

          <div>
            <label className="label">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(TYPE_META).map(([k, m]) => (
                <button type="button" key={k} onClick={() => setF({ ...f, type: k })}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs font-medium transition ${f.type === k ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300" : "border-sage-200 text-sage-600 hover:bg-sage-50 dark:border-sage-700 dark:text-sage-300"}`}>
                  <m.icon className="h-4 w-4" /> {m.label}
                </button>
              ))}
            </div>
          </div>

          {f.type === "percent" && (
            <div><label className="label">Percent off (%)</label><input type="number" min="0" max="100" step="0.1" className="input sm:w-40" value={f.value} onChange={set("value")} required /></div>
          )}
          {f.type === "amount" && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Amount off</label><input type="number" min="0" step="0.01" className="input" value={f.value} onChange={set("value")} required /></div>
              <div><label className="label">Minimum spend</label><input type="number" min="0" step="0.01" className="input" value={f.min_subtotal} onChange={set("min_subtotal")} placeholder="0 = none" /></div>
            </div>
          )}
          {f.type === "bxgy" && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Buy quantity</label><input type="number" min="1" className="input" value={f.buy_qty} onChange={set("buy_qty")} required /></div>
              <div><label className="label">Get free</label><input type="number" min="1" className="input" value={f.get_qty} onChange={set("get_qty")} required /></div>
            </div>
          )}

          <div>
            <label className="label">Applies to</label>
            <select className="input" value={f.scope} onChange={set("scope")}>
              <option value="all">Everything in the cart</option>
              <option value="category">A category</option>
              <option value="products">Specific products</option>
            </select>
          </div>
          {f.scope === "category" && (
            <div><label className="label">Category</label>
              <select className="input" value={f.category_id} onChange={set("category_id")} required>
                <option value="">— Choose —</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {f.scope === "products" && (
            <div>
              <label className="label">Products</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sage-400" />
                <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search to add…" />
                {results.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-xl border border-sage-200 bg-white p-1 shadow-lg dark:border-sage-800 dark:bg-sage-900">
                    {results.map((p) => <button type="button" key={p.id} onClick={() => addProduct(p)} className="block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-sage-100 dark:hover:bg-sage-800">{p.name}</button>)}
                  </div>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {picked.map((p) => (
                  <span key={p.id} className="chip bg-sage-100 dark:bg-sage-800">{p.name}<button type="button" onClick={() => removeProduct(p.id)} className="ml-1 text-sage-400 hover:text-rose-500"><X className="h-3 w-3" /></button></span>
                ))}
                {!picked.length && <span className="text-xs text-sage-400">No products chosen yet.</span>}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Starts (optional)</label><input type="date" className="input" value={f.starts_at} onChange={set("starts_at")} /></div>
            <div><label className="label">Ends (optional)</label><input type="date" className="input" value={f.ends_at} onChange={set("ends_at")} /></div>
          </div>
          <label className="flex items-center gap-2.5 text-sm text-sage-700 dark:text-sage-300">
            <input type="checkbox" checked={f.is_active} onChange={set("is_active")} className="h-4 w-4 rounded border-sage-300 text-brand-600 focus:ring-brand-500" /> Active
          </label>

          {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {editing ? "Save" : "Create"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
