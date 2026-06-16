import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { money } from "../lib/money.js";
import ConfirmModal from "../components/Confirm.jsx";
import {
  Truck, Plus, X, Loader2, PackageCheck, Trash2, ClipboardList,
  AlertTriangle, Building2, ChevronRight, Ban, Wallet, HandCoins, Undo2, CalendarClock,
} from "lucide-react";

const STATUS = {
  draft: "bg-sage-100 text-sage-600 dark:bg-sage-800 dark:text-sage-300",
  ordered: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  received: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
  cancelled: "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300",
};

const TABS = [
  { key: "orders", label: "Orders", icon: ClipboardList },
  { key: "reorder", label: "Reorder", icon: AlertTriangle },
  { key: "payables", label: "Payables", icon: Wallet },
  { key: "returns", label: "Returns", icon: Undo2 },
  { key: "suppliers", label: "Suppliers", icon: Building2 },
];

export default function Purchasing() {
  const [tab, setTab] = useState("orders");
  const [pos, setPOs] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [reorder, setReorder] = useState(null);
  const [builder, setBuilder] = useState(null); // {prefill?}
  const [receiveId, setReceiveId] = useState(null);
  const [err, setErr] = useState("");

  const loadPOs = () => api("/api/purchase-orders").then(setPOs).catch((e) => setErr(e.message));
  const loadReorder = () => api("/api/purchasing/reorder").then((r) => setReorder(r?.items ? r : { items: r || [] })).catch(() => {});
  const loadRefs = () =>
    Promise.all([api("/api/suppliers"), api("/api/catalog/lite")]).then(([s, p]) => {
      setSuppliers(s);
      setProducts(p);
    });

  useEffect(() => {
    loadPOs();
    loadReorder();
    loadRefs();
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">
            Purchasing
          </h1>
          <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">
            Order from suppliers and receive stock into inventory.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setBuilder({})}>
          <Plus className="h-4 w-4" /> New order
        </button>
      </div>

      <div className="flex gap-1 rounded-xl border border-sage-200 bg-white p-1 dark:border-sage-800 dark:bg-sage-900 sm:inline-flex">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition sm:flex-none ${
              tab === t.key
                ? "bg-brand-600 text-white shadow-soft"
                : "text-sage-500 hover:bg-sage-100 dark:text-sage-300 dark:hover:bg-sage-800"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.key === "reorder" && reorder?.items?.length > 0 && (
              <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                {reorder.items.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {err && (
        <div className="card border-rose-200 p-4 text-sm text-rose-600 dark:border-rose-900/50 dark:text-rose-300">
          {err}
        </div>
      )}

      {tab === "orders" && (
        <OrdersTab pos={pos} onReceive={setReceiveId} onReload={loadPOs} />
      )}
      {tab === "reorder" && (
        <ReorderTab
          data={reorder}
          onOrder={(picks) => setBuilder({ prefill: picks })}
        />
      )}
      {tab === "payables" && <PayablesTab />}
      {tab === "returns" && <ReturnsTab suppliers={suppliers} />}
      {tab === "suppliers" && (
        <SuppliersTab suppliers={suppliers} onReload={loadRefs} />
      )}

      {builder && (
        <POBuilder
          suppliers={suppliers}
          products={products}
          prefill={builder.prefill}
          onClose={() => setBuilder(null)}
          onSaved={() => {
            setBuilder(null);
            loadPOs();
            setTab("orders");
          }}
        />
      )}
      {receiveId && (
        <ReceiveModal
          poId={receiveId}
          onClose={() => setReceiveId(null)}
          onReceived={() => {
            setReceiveId(null);
            loadPOs();
            loadReorder();
          }}
        />
      )}
    </div>
  );
}

function OrdersTab({ pos, onReceive, onReload }) {
  const [cancelId, setCancelId] = useState(null);
  const [err, setErr] = useState("");
  const cancel = async () => {
    try {
      await api(`/api/purchase-orders/${cancelId}/cancel`, { method: "POST" });
      setCancelId(null); onReload();
    } catch (e) { setErr(e.message); setCancelId(null); }
  };
  return (
    <>
    {err && <div className="card mb-3 border-rose-200 p-3 text-sm text-rose-600 dark:border-rose-900/50 dark:text-rose-300">{err}</div>}
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sage-200 text-left text-xs uppercase tracking-wide text-sage-400 dark:border-sage-800">
              <th className="px-5 py-3 font-medium">Order</th>
              <th className="px-5 py-3 font-medium">Supplier</th>
              <th className="px-5 py-3 font-medium text-center">Lines</th>
              <th className="px-5 py-3 font-medium text-right">Cost</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!pos ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-sage-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : pos.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-sage-400">No purchase orders yet. Create your first order.</td></tr>
            ) : (
              pos.map((po) => (
                <tr key={po.id} className="border-b border-sage-100 last:border-0 hover:bg-sage-50 dark:border-sage-800/60 dark:hover:bg-sage-800/40">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-sage-900 dark:text-sage-50">{po.po_number}</div>
                    <div className="text-xs text-sage-400">{new Date(po.created_at).toLocaleDateString()}</div>
                  </td>
                  <td className="px-5 py-3.5 text-sage-600 dark:text-sage-300">{po.supplier_name || "—"}</td>
                  <td className="px-5 py-3.5 text-center text-sage-600 dark:text-sage-300">{po.line_count}</td>
                  <td className="px-5 py-3.5 text-right font-medium text-sage-900 dark:text-sage-50">{money(po.total_cost)}</td>
                  <td className="px-5 py-3.5"><span className={`chip capitalize ${STATUS[po.status]}`}>{po.status}</span></td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-2">
                      {po.status !== "received" && po.status !== "cancelled" && (
                        <>
                          <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => onReceive(po.id)}>
                            <PackageCheck className="h-3.5 w-3.5" /> Receive
                          </button>
                          <button className="btn-ghost !px-2 !py-1.5 text-xs text-sage-400 hover:text-rose-500" onClick={() => setCancelId(po.id)}>
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      {po.status === "received" && (
                        <span className="text-xs text-sage-400">{new Date(po.received_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
    {cancelId && (
      <ConfirmModal danger title="Cancel order" confirmLabel="Cancel order"
        message="This purchase order will be marked cancelled." onConfirm={cancel} onClose={() => setCancelId(null)} />
    )}
    </>
  );
}

function ReorderTab({ data, onOrder }) {
  if (!data) return <div className="flex h-32 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  const rows = data.items || [];
  if (rows.length === 0)
    return (
      <div className="card p-10 text-center">
        <PackageCheck className="mx-auto mb-3 h-10 w-10 text-brand-400" />
        <p className="text-sage-500 dark:text-sage-400">Nothing to restock — stock levels cover demand for now.</p>
      </div>
    );
  const daysChip = (d) => {
    if (d == null) return <span className="text-sage-300">—</span>;
    const tone = d <= 3 ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
      : d <= 7 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
      : "bg-sage-100 text-sage-600 dark:bg-sage-800 dark:text-sage-300";
    return <span className={`chip ${tone}`}>{d}d</span>;
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-sage-500 dark:text-sage-400">
          Forecast from the last <b>{data.window_days || 30} days</b> of sales · ordering to cover <b>{(data.lead_days ?? 7) + (data.buffer_days ?? 7)} days</b> (lead + buffer).
        </p>
        <button className="btn-primary" onClick={() => onOrder(rows.map((r) => ({ product_id: r.id, name: r.name, unit: r.unit, qty_ordered: r.suggested_qty })))}>
          <Truck className="h-4 w-4" /> Order all ({rows.length})
        </button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sage-200 text-left text-xs uppercase tracking-wide text-sage-400 dark:border-sage-800">
              <th className="px-5 py-3 font-medium">Product</th>
              <th className="px-5 py-3 font-medium text-right">In stock</th>
              <th className="px-5 py-3 font-medium text-right">Sells/day</th>
              <th className="px-5 py-3 font-medium text-right">Runs out</th>
              <th className="px-5 py-3 font-medium text-right">Suggested</th>
              <th className="px-5 py-3 font-medium text-right"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-sage-100 last:border-0 dark:border-sage-800/60">
                <td className="px-5 py-3.5 font-medium text-sage-900 dark:text-sage-50">{r.name}</td>
                <td className="px-5 py-3.5 text-right">
                  <span className={`font-semibold ${r.stock <= r.reorder_level ? "text-amber-600 dark:text-amber-400" : "text-sage-700 dark:text-sage-200"}`}>{r.stock}</span>
                  <span className="ml-1 text-xs text-sage-400">{r.unit}</span>
                </td>
                <td className="px-5 py-3.5 text-right tabular-nums text-sage-600 dark:text-sage-300">{r.daily_rate || 0}</td>
                <td className="px-5 py-3.5 text-right">{daysChip(r.days_left)}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-brand-700 dark:text-brand-400">{r.suggested_qty}</td>
                <td className="px-5 py-3.5 text-right">
                  <button className="btn-outline !px-3 !py-1.5 text-xs" onClick={() => onOrder([{ product_id: r.id, name: r.name, unit: r.unit, qty_ordered: r.suggested_qty }])}>
                    Order <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SuppliersTab({ suppliers, onReload }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await api("/api/suppliers", { method: "POST", body: f });
      setF({ name: "", phone: "", email: "", address: "" });
      onReload();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sage-200 text-left text-xs uppercase tracking-wide text-sage-400 dark:border-sage-800">
              <th className="px-5 py-3 font-medium">Supplier</th>
              <th className="px-5 py-3 font-medium">Phone</th>
              <th className="px-5 py-3 font-medium">Email</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 ? (
              <tr><td colSpan={3} className="px-5 py-10 text-center text-sage-400">No suppliers yet.</td></tr>
            ) : suppliers.map((s) => (
              <tr key={s.id} className="border-b border-sage-100 last:border-0 dark:border-sage-800/60">
                <td className="px-5 py-3.5 font-medium text-sage-900 dark:text-sage-50">{s.name}</td>
                <td className="px-5 py-3.5 text-sage-500">{s.phone || "—"}</td>
                <td className="px-5 py-3.5 text-sage-500">{s.email || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={save} className="card h-fit space-y-3 p-5">
        <h3 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Add supplier</h3>
        <input className="input" placeholder="Name *" value={f.name} onChange={set("name")} required />
        <input className="input" placeholder="Phone" value={f.phone} onChange={set("phone")} />
        <input className="input" placeholder="Email" value={f.email} onChange={set("email")} />
        <input className="input" placeholder="Address" value={f.address} onChange={set("address")} />
        {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add supplier
        </button>
      </form>
    </div>
  );
}

function PayablesTab() {
  const [data, setData] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [err, setErr] = useState("");
  const load = () => api("/api/purchasing/payables").then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  if (err) return <div className="card border-rose-200 p-4 text-sm text-rose-600 dark:border-rose-900/50 dark:text-rose-300">{err}</div>;
  if (!data) return <div className="flex h-32 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"><Wallet className="h-5 w-5" /></span>
          <div className="mt-3 text-2xl font-semibold text-sage-900 dark:text-sage-50">{money(data.total_owed)}</div>
          <div className="text-sm text-sage-500 dark:text-sage-400">owed to suppliers</div>
        </div>
        <div className="card p-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-sage-400">By supplier</div>
          {data.by_supplier.length === 0 ? <p className="text-sm text-sage-400">All settled 🎉</p> : (
            <div className="space-y-1.5">
              {data.by_supplier.slice(0, 5).map((s, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-sage-700 dark:text-sage-200">{s.name}</span>
                  <span className="font-medium text-sage-900 dark:text-sage-50">{money(s.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sage-200 text-left text-xs uppercase tracking-wide text-sage-400 dark:border-sage-800">
                <th className="px-5 py-3 font-medium">Order</th>
                <th className="px-5 py-3 font-medium">Supplier</th>
                <th className="px-5 py-3 font-medium text-right">Total</th>
                <th className="px-5 py-3 font-medium text-right">Paid</th>
                <th className="px-5 py-3 font-medium text-right">Outstanding</th>
                <th className="px-5 py-3 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody>
              {data.payables.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-sage-400">No outstanding bills — everything's paid.</td></tr>
              ) : data.payables.map((p) => (
                <tr key={p.id} className="border-b border-sage-100 last:border-0 dark:border-sage-800/60">
                  <td className="px-5 py-3.5 font-semibold text-sage-900 dark:text-sage-50">{p.po_number}</td>
                  <td className="px-5 py-3.5 text-sage-600 dark:text-sage-300">{p.supplier_name || "—"}</td>
                  <td className="px-5 py-3.5 text-right text-sage-500">{money(p.total_cost)}</td>
                  <td className="px-5 py-3.5 text-right text-sage-500">{money(p.amount_paid)}</td>
                  <td className="px-5 py-3.5 text-right font-semibold text-amber-600 dark:text-amber-400">{money(p.outstanding)}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => setPayFor(p)}><HandCoins className="h-3.5 w-3.5" /> Pay</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {payFor && <PayModal po={payFor} onClose={() => setPayFor(null)} onPaid={() => { setPayFor(null); load(); }} />}
    </div>
  );
}

function PayModal({ po, onClose, onPaid }) {
  const [amount, setAmount] = useState(po.outstanding);
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await api(`/api/purchase-orders/${po.id}/pay`, { method: "POST", body: { amount: Number(amount), method, note } }); onPaid(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title={`Pay ${po.po_number} · ${po.supplier_name || ""}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-sage-500 dark:text-sage-400">Outstanding: <b>{money(po.outstanding)}</b></p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Amount</label><input type="number" min="0" step="0.01" max={po.outstanding} className="input" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
          <div><label className="label">Method</label>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="cheque">Cheque</option><option value="mobile">Mobile</option>
            </select>
          </div>
        </div>
        <div><label className="label">Note</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional reference" /></div>
        {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />} Record payment</button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`card relative z-10 max-h-[88vh] w-full overflow-y-auto p-6 ${wide ? "max-w-3xl" : "max-w-lg"}`}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">{title}</h3>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function POBuilder({ suppliers, products, prefill, onClose, onSaved }) {
  const blank = { product_id: "", qty_ordered: 1, cost_price: "", selling_price: "", batch_no: "", expiry_date: "" };
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState(() =>
    prefill && prefill.length
      ? prefill.map((p) => {
          const prod = products.find((x) => x.id === p.product_id);
          return { ...blank, product_id: p.product_id, qty_ordered: p.qty_ordered,
                   cost_price: prod?.last_cost || "", selling_price: prod?.last_price || "" };
        })
      : [blank]
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const setLine = (i, k, v) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const onPickProduct = (i, id) => {
    const prod = products.find((x) => x.id === Number(id));
    setLines((p) => p.map((l, idx) => (idx === i ? {
      ...l, product_id: id,
      cost_price: l.cost_price || prod?.last_cost || "",
      selling_price: l.selling_price || prod?.last_price || "",
    } : l)));
  };
  const addLine = () => setLines((p) => [...p, blank]);
  const removeLine = (i) => setLines((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)));

  const total = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.qty_ordered) || 0) * (Number(l.cost_price) || 0), 0),
    [lines]
  );

  const save = async (e) => {
    e.preventDefault();
    const items = lines
      .filter((l) => l.product_id && Number(l.qty_ordered) > 0)
      .map((l) => ({
        product_id: Number(l.product_id),
        qty_ordered: Number(l.qty_ordered),
        cost_price: Number(l.cost_price) || 0,
        selling_price: Number(l.selling_price) || 0,
        batch_no: l.batch_no || null,
        expiry_date: l.expiry_date || null,
      }));
    if (items.length === 0) return setErr("Add at least one product line.");
    setBusy(true); setErr("");
    try {
      await api("/api/purchase-orders", { method: "POST", body: { supplier_id: supplierId || null, notes, status: "ordered", items } });
      onSaved();
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <Modal title="New purchase order" onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Supplier</label>
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— Select supplier —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="hidden gap-2 px-1 text-xs font-medium uppercase tracking-wide text-sage-400 sm:grid sm:grid-cols-[1fr_70px_90px_90px_36px]">
            <span>Product</span><span className="text-right">Qty</span><span className="text-right">Cost</span><span className="text-right">Sell</span><span></span>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-sage-200 p-2 dark:border-sage-800 sm:grid-cols-[1fr_70px_90px_90px_36px] sm:border-0 sm:p-0">
              <select className="input col-span-2 sm:col-span-1" value={l.product_id} onChange={(e) => onPickProduct(i, e.target.value)}>
                <option value="">— Product —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" min="1" className="input text-right" placeholder="Qty" value={l.qty_ordered} onChange={(e) => setLine(i, "qty_ordered", e.target.value)} />
              <input type="number" min="0" step="0.01" className="input text-right" placeholder="Cost" value={l.cost_price} onChange={(e) => setLine(i, "cost_price", e.target.value)} />
              <input type="number" min="0" step="0.01" className="input text-right" placeholder="Sell" value={l.selling_price} onChange={(e) => setLine(i, "selling_price", e.target.value)} />
              <button type="button" onClick={() => removeLine(i)} className="btn-ghost !px-2 text-sage-400 hover:text-rose-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addLine} className="btn-outline w-full">
            <Plus className="h-4 w-4" /> Add line
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-sage-200 pt-4 dark:border-sage-800">
          <span className="text-sm text-sage-500">Estimated cost</span>
          <span className="text-xl font-semibold text-sage-900 dark:text-sage-50">{money(total)}</span>
        </div>

        {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Place order
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReceiveModal({ poId, onClose, onReceived }) {
  const [po, setPO] = useState(null);
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api(`/api/purchase-orders/${poId}`).then((data) => {
      setPO(data);
      setLines(
        data.items.map((it) => ({
          id: it.id, product_name: it.product_name, unit: it.unit,
          qty_received: it.qty_ordered,
          cost_price: it.cost_price, selling_price: it.selling_price,
          batch_no: it.batch_no || "", expiry_date: it.expiry_date ? it.expiry_date.slice(0, 10) : "",
        }))
      );
    }).catch((e) => setErr(e.message));
  }, [poId]);

  const setLine = (i, k, v) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));

  const receive = async () => {
    setBusy(true); setErr("");
    try {
      await api(`/api/purchase-orders/${poId}/receive`, {
        method: "POST",
        body: {
          lines: lines.map((l) => ({
            id: l.id,
            qty_received: Number(l.qty_received) || 0,
            cost_price: Number(l.cost_price) || 0,
            selling_price: Number(l.selling_price) || 0,
            batch_no: l.batch_no || null,
            expiry_date: l.expiry_date || null,
          })),
        },
      });
      onReceived();
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <Modal title={po ? `Receive ${po.po_number}` : "Receive order"} onClose={onClose} wide>
      {!po ? (
        <div className="flex h-32 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-sage-500 dark:text-sage-400">
            Confirm what arrived — quantities, prices, batch numbers and expiry. Receiving adds these to stock (FEFO).
          </p>
          <div className="space-y-2">
            <div className="hidden gap-2 px-1 text-xs font-medium uppercase tracking-wide text-sage-400 sm:grid sm:grid-cols-[1fr_70px_80px_80px_100px_120px]">
              <span>Product</span><span className="text-right">Recv</span><span className="text-right">Cost</span><span className="text-right">Sell</span><span>Batch</span><span>Expiry</span>
            </div>
            {lines.map((l, i) => (
              <div key={l.id} className="grid grid-cols-2 gap-2 rounded-xl border border-sage-200 p-2 dark:border-sage-800 sm:grid-cols-[1fr_70px_80px_80px_100px_120px] sm:items-center sm:border-0 sm:p-0">
                <div className="col-span-2 text-sm font-medium text-sage-900 dark:text-sage-50 sm:col-span-1">
                  {l.product_name} <span className="text-xs text-sage-400">{l.unit}</span>
                </div>
                <input type="number" min="0" className="input text-right" value={l.qty_received} onChange={(e) => setLine(i, "qty_received", e.target.value)} />
                <input type="number" min="0" step="0.01" className="input text-right" value={l.cost_price} onChange={(e) => setLine(i, "cost_price", e.target.value)} />
                <input type="number" min="0" step="0.01" className="input text-right" value={l.selling_price} onChange={(e) => setLine(i, "selling_price", e.target.value)} />
                <input className="input" placeholder="Batch" value={l.batch_no} onChange={(e) => setLine(i, "batch_no", e.target.value)} />
                <input type="date" className="input" value={l.expiry_date} onChange={(e) => setLine(i, "expiry_date", e.target.value)} />
              </div>
            ))}
          </div>
          {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" onClick={receive} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />} Receive into stock
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const REASONS = [["expired", "Expired"], ["recalled", "Recalled"], ["damaged", "Damaged"], ["overstock", "Overstock"]];

function ReturnsTab({ suppliers }) {
  const [supplierId, setSupplierId] = useState("");
  const [batches, setBatches] = useState(null);
  const [qty, setQty] = useState({});
  const [reason, setReason] = useState("expired");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [history, setHistory] = useState([]);

  const loadReturnable = () => { if (supplierId) api(`/api/rtv/returnable?supplier_id=${supplierId}`).then(setBatches).catch((e) => setErr(e.message)); };
  const loadHistory = () => api("/api/rtv").then(setHistory).catch(() => {});
  useEffect(() => { loadHistory(); }, []);
  useEffect(() => { setBatches(null); setQty({}); setMsg(""); if (supplierId) loadReturnable(); }, [supplierId]);

  const totalCredit = (batches || []).reduce((s, b) => s + (Number(qty[b.batch_id]) || 0) * Number(b.cost_price), 0);
  const count = Object.values(qty).filter((v) => Number(v) > 0).length;

  const submit = async () => {
    setErr(""); setMsg("");
    const items = Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([batch_id, q]) => ({ batch_id: Number(batch_id), qty: Number(q) }));
    if (!items.length) { setErr("Enter a quantity to return."); return; }
    setBusy(true);
    try {
      const r = await api("/api/rtv", { method: "POST", body: { supplier_id: Number(supplierId), reason, note, items } });
      setMsg(`${r.reference} created — credit ${money(r.total_credit)}.`);
      setQty({}); setNote(""); loadReturnable(); loadHistory();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Supplier</label>
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— Choose a supplier —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Reason</label>
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Note (optional)</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. recall #1234" />
          </div>
        </div>

        {supplierId && (
          batches === null ? (
            <div className="flex h-24 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : batches.length === 0 ? (
            <p className="mt-4 text-sm text-sage-400">No on-hand stock from this supplier to return.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sage-200 text-left text-xs uppercase tracking-wide text-sage-400 dark:border-sage-800">
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium">Batch</th>
                    <th className="px-3 py-2 font-medium text-right">On hand</th>
                    <th className="px-3 py-2 font-medium text-right">Unit cost</th>
                    <th className="px-3 py-2 font-medium text-right">Return qty</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.batch_id} className="border-b border-sage-100 last:border-0 dark:border-sage-800/60">
                      <td className="px-3 py-2 font-medium text-sage-900 dark:text-sage-50">{b.name}</td>
                      <td className="px-3 py-2 text-sage-500">
                        {b.batch_no || "—"}
                        {b.expiry_date && <span className={`ml-2 chip ${b.expired ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}><CalendarClock className="h-3 w-3" /> {b.expired ? "Expired" : new Date(b.expiry_date).toLocaleDateString()}</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-sage-600 dark:text-sage-300">{b.quantity}</td>
                      <td className="px-3 py-2 text-right text-sage-500">{money(b.cost_price)}</td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" min="0" max={b.quantity} className="input !w-20 !py-1 text-right"
                          value={qty[b.batch_id] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [b.batch_id]: e.target.value }))} placeholder="0" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {err && <div className="mt-3 text-sm text-rose-600 dark:text-rose-400">{err}</div>}
        {msg && <div className="mt-3 flex items-center gap-1.5 text-sm font-medium text-brand-600 dark:text-brand-400"><PackageCheck className="h-4 w-4" /> {msg}</div>}

        {batches?.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-sage-500 dark:text-sage-400">{count} line(s) · credit note <b className="text-sage-800 dark:text-sage-100">{money(totalCredit)}</b></div>
            <button className="btn-primary" onClick={submit} disabled={busy || !count}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Return to vendor
            </button>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h3 className="mb-3 font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Recent returns</h3>
        {history.length === 0 ? <p className="text-sm text-sage-400">No returns yet.</p> : (
          <div className="space-y-2 text-sm">
            {history.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-sage-100 pb-2 last:border-0 dark:border-sage-800/60">
                <div>
                  <span className="font-medium text-sage-800 dark:text-sage-100">{r.reference}</span>
                  <span className="ml-2 text-sage-400">{r.supplier_name || "—"} · {r.units} units · <span className="capitalize">{r.reason}</span></span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-brand-700 dark:text-brand-400">{money(r.total_credit)}</span>
                  <span className="text-xs text-sage-400">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
