import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { money, num } from "../lib/money.js";
import { GitBranch, Plus, Loader2, X, Star, Pencil, MapPin, Phone, ArrowLeftRight, Trash2 } from "lucide-react";

export default function Branches() {
  const [list, setList] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [err, setErr] = useState("");
  const [modal, setModal] = useState(null); // 'new' | branch
  const [showTransfer, setShowTransfer] = useState(false);

  const load = () => api("/api/branches").then(setList).catch((e) => setErr(e.message));
  const loadTransfers = () => api("/api/transfers").then(setTransfers).catch(() => {});
  useEffect(() => { load(); loadTransfers(); }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">Branches</h1>
          <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">Manage outlets. Use the branch switcher in the top bar to view any branch — or “All branches” for the whole business.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={() => setShowTransfer(true)}><ArrowLeftRight className="h-4 w-4" /> Transfer stock</button>
          <button className="btn-primary" onClick={() => setModal("new")}><Plus className="h-4 w-4" /> New branch</button>
        </div>
      </div>

      {err && <div className="card border-rose-200 p-4 text-sm text-rose-600 dark:border-rose-900/50 dark:text-rose-300">{err}</div>}

      {!list ? (
        <div className="flex h-32 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((b) => (
            <div key={b.id} className={`card p-5 ${!b.is_active ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"><GitBranch className="h-5 w-5" /></span>
                  <div>
                    <div className="flex items-center gap-1.5 font-semibold text-sage-900 dark:text-sage-50">
                      {b.name}
                      {b.is_main && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" title="Main branch" />}
                    </div>
                    {b.code && <div className="text-xs text-sage-400">{b.code}</div>}
                  </div>
                </div>
                <button className="btn-ghost !px-2 !py-1.5" onClick={() => setModal(b)}><Pencil className="h-4 w-4" /></button>
              </div>

              {(b.address || b.phone) && (
                <div className="mt-3 space-y-1 text-xs text-sage-500 dark:text-sage-400">
                  {b.address && <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {b.address}</div>}
                  {b.phone && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {b.phone}</div>}
                </div>
              )}

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-sage-100 pt-4 dark:border-sage-800">
                <Mini label="Stock value" value={money(b.stock_value)} />
                <Mini label="Units" value={num(b.units)} />
                <Mini label="Today" value={money(b.today_sales)} />
              </div>
              {!b.is_active && <div className="mt-3 text-xs font-medium text-rose-500">Inactive</div>}
            </div>
          ))}
        </div>
      )}

      {/* Recent transfers */}
      {transfers.length > 0 && (
        <div className="card p-6">
          <h2 className="mb-3 font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Recent transfers</h2>
          <div className="space-y-1 text-sm">
            {transfers.slice(0, 8).map((t) => (
              <div key={t.id} className="flex items-center justify-between border-b border-sage-100 py-2 last:border-0 dark:border-sage-800/60">
                <div className="flex items-center gap-2 text-sage-700 dark:text-sage-200">
                  <span className="font-medium">{t.reference}</span>
                  <span className="text-sage-400">{t.from_branch} <ArrowLeftRight className="inline h-3 w-3" /> {t.to_branch}</span>
                </div>
                <span className="text-xs text-sage-400">{t.units} units · {new Date(t.created_at).toLocaleDateString()} · {t.moved_by}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && <BranchModal branch={modal === "new" ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {showTransfer && <TransferModal branches={list || []} onClose={() => setShowTransfer(false)} onDone={() => { setShowTransfer(false); load(); loadTransfers(); }} />}
    </div>
  );
}

function TransferModal({ branches, onClose, onDone }) {
  const active = branches.filter((b) => b.is_active);
  const [from, setFrom] = useState(active[0]?.id || "");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState([{ product_id: "", qty: 1 }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { api("/api/catalog/lite").then(setProducts).catch(() => {}); }, []);

  const setLine = (i, k, v) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const addLine = () => setLines((p) => [...p, { product_id: "", qty: 1 }]);
  const removeLine = (i) => setLines((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)));

  const save = async (e) => {
    e.preventDefault();
    const items = lines.filter((l) => l.product_id && Number(l.qty) > 0).map((l) => ({ product_id: Number(l.product_id), qty: Number(l.qty) }));
    if (!from || !to) return setErr("Choose source and destination branches");
    if (from === to) return setErr("Source and destination must differ");
    if (!items.length) return setErr("Add at least one product");
    setBusy(true); setErr("");
    try { await api("/api/transfers", { method: "POST", body: { from_branch_id: Number(from), to_branch_id: Number(to), items, note } }); onDone(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 max-h-[88vh] w-full max-w-lg overflow-y-auto p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Transfer stock</h3>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">From</label>
              <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">—</option>{active.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div><label className="label">To</label>
              <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">—</option>{active.filter((b) => String(b.id) !== String(from)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-sage-400">Products</div>
            {lines.map((l, i) => (
              <div key={i} className="flex gap-2">
                <select className="input flex-1" value={l.product_id} onChange={(e) => setLine(i, "product_id", e.target.value)}>
                  <option value="">— Product —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock} {p.unit})</option>)}
                </select>
                <input type="number" min="1" className="input w-20 text-right" value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value)} />
                <button type="button" onClick={() => removeLine(i)} className="btn-ghost !px-2 text-sage-400 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={addLine} className="btn-outline w-full"><Plus className="h-4 w-4" /> Add product</button>
          </div>

          <div><label className="label">Note</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></div>
          {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />} Transfer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div>
      <div className="text-sm font-semibold text-sage-900 dark:text-sage-50">{value}</div>
      <div className="text-[11px] text-sage-400">{label}</div>
    </div>
  );
}

function BranchModal({ branch, onClose, onSaved }) {
  const editing = !!branch;
  const [f, setF] = useState({
    name: branch?.name || "", code: branch?.code || "", address: branch?.address || "",
    phone: branch?.phone || "", is_active: branch?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await api(editing ? `/api/branches/${branch.id}` : "/api/branches", { method: editing ? "PATCH" : "POST", body: f });
      onSaved();
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-md p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">{editing ? "Edit branch" : "New branch"}</h3>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Name *</label><input className="input" value={f.name} onChange={set("name")} required autoFocus /></div>
            <div><label className="label">Code</label><input className="input" value={f.code} onChange={set("code")} placeholder="e.g. BR2" /></div>
            <div><label className="label">Phone</label><input className="input" value={f.phone} onChange={set("phone")} /></div>
          </div>
          <div><label className="label">Address</label><input className="input" value={f.address} onChange={set("address")} /></div>
          {editing && !branch.is_main && (
            <label className="flex items-center gap-2.5 text-sm text-sage-700 dark:text-sage-300">
              <input type="checkbox" checked={f.is_active} onChange={set("is_active")} className="h-4 w-4 rounded border-sage-300 text-brand-600 focus:ring-brand-500" />
              Active
            </label>
          )}
          {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {editing ? "Save" : "Create"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
