import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import ReceiptModal from "../components/Receipt.jsx";
import { money } from "../lib/money.js";
import {
  Receipt, Search, Loader2, Eye, Banknote, CreditCard, Smartphone, Undo2, X, CheckCircle2,
} from "lucide-react";

const PAY_ICON = { cash: Banknote, card: CreditCard, mobile: Smartphone, account: Banknote };

export default function Sales() {
  const { settings, can } = useAuth();
  const [sales, setSales] = useState(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [returnFor, setReturnFor] = useState(null); // sale id to return
  const [refund, setRefund] = useState(null);        // completed refund receipt
  const canRefund = can("pos.refund");

  const load = () => api("/api/sales", { params: { limit: 200 } }).then(setSales).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!sales) return [];
    const t = q.trim().toLowerCase();
    if (!t) return sales;
    return sales.filter((s) =>
      [s.receipt_no, s.customer_name, s.cashier].filter(Boolean).some((v) => v.toLowerCase().includes(t))
    );
  }, [sales, q]);

  const totals = useMemo(() => {
    const list = filtered;
    return { count: list.length, sum: list.reduce((a, s) => a + Number(s.total), 0) };
  }, [filtered]);

  const openReceipt = async (id) => {
    setLoadingDetail(true);
    try { setDetail(await api(`/api/sales/${id}`)); }
    catch (e) { setErr(e.message); }
    finally { setLoadingDetail(false); }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">Sales history</h1>
        <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">
          {sales ? `${totals.count} sales · ${money(totals.sum)}` : "Loading…"}
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sage-400" />
        <input className="input pl-10" placeholder="Search by receipt #, customer or cashier…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {err && <div className="card border-rose-200 p-4 text-sm text-rose-600 dark:border-rose-900/50 dark:text-rose-300">{err}</div>}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sage-200 text-left text-xs uppercase tracking-wide text-sage-400 dark:border-sage-800">
                <th className="px-5 py-3 font-medium">Receipt</th>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Cashier</th>
                <th className="px-5 py-3 font-medium text-center">Items</th>
                <th className="px-5 py-3 font-medium">Pay</th>
                <th className="px-5 py-3 font-medium text-right">Total</th>
                <th className="px-5 py-3 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody>
              {!sales ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-sage-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-sage-400">No sales found.</td></tr>
              ) : filtered.map((s) => {
                const Icon = PAY_ICON[s.payment_method] || Banknote;
                return (
                  <tr key={s.id} className="border-b border-sage-100 last:border-0 hover:bg-sage-50 dark:border-sage-800/60 dark:hover:bg-sage-800/40">
                    <td className="px-5 py-3.5 font-semibold text-sage-900 dark:text-sage-50">{s.receipt_no}</td>
                    <td className="px-5 py-3.5 text-sage-500 dark:text-sage-400">{new Date(s.created_at).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-sage-600 dark:text-sage-300">{s.customer_name || "—"}</td>
                    <td className="px-5 py-3.5 text-sage-600 dark:text-sage-300">{s.cashier || "—"}</td>
                    <td className="px-5 py-3.5 text-center text-sage-500">{s.item_count}</td>
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-1.5 capitalize text-sage-500 dark:text-sage-400">
                        <Icon className="h-4 w-4" /> {s.payment_method}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-sage-900 dark:text-sage-50">{money(s.total)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button className="btn-outline !px-3 !py-1.5 text-xs" onClick={() => openReceipt(s.id)} disabled={loadingDetail}>
                          <Eye className="h-3.5 w-3.5" /> View
                        </button>
                        {canRefund && (
                          <button className="btn-ghost !px-2 !py-1.5 text-xs text-sage-400 hover:text-rose-500" onClick={() => setReturnFor(s.id)} title="Return / refund">
                            <Undo2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <ReceiptModal receipt={detail} settings={settings} title={`Receipt ${detail.receipt_no}`} onClose={() => setDetail(null)} />
      )}
      {returnFor && (
        <ReturnModal saleId={returnFor} onClose={() => setReturnFor(null)}
          onDone={(r) => { setReturnFor(null); setRefund(r); load(); }} />
      )}
      {refund && (
        <ReceiptModal receipt={{ ...refund, payment_method: refund.refund_method }} settings={settings}
          title={`Refund ${refund.receipt_no}`} onClose={() => setRefund(null)} />
      )}
    </div>
  );
}

function ReturnModal({ saleId, onClose, onDone }) {
  const [sale, setSale] = useState(null);
  const [qty, setQty] = useState({});      // sale_item_id -> qty to return
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("cash");
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api(`/api/sales/${saleId}`).then((s) => {
      setSale(s);
      setMethod(s.payment_method === "account" ? "account" : "cash");
    }).catch((e) => setErr(e.message));
  }, [saleId]);

  if (err && !sale) return (
    <Modal title="Return / refund" onClose={onClose}><div className="text-sm text-rose-600">{err}</div></Modal>
  );
  if (!sale) return <Modal title="Return / refund" onClose={onClose}><div className="flex h-24 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div></Modal>;

  const lines = sale.items.map((it) => ({ ...it, remaining: it.qty - (it.returned_qty || 0) }));
  const refundTotal = lines.reduce((s, l) => s + (Number(qty[l.id]) || 0) * Number(l.unit_price), 0);
  const anything = lines.some((l) => Number(qty[l.id]) > 0);

  const submit = async () => {
    const items = lines
      .filter((l) => Number(qty[l.id]) > 0)
      .map((l) => ({ sale_item_id: l.id, qty: Number(qty[l.id]) }));
    if (!items.length) return;
    setBusy(true); setErr("");
    try {
      const r = await api(`/api/sales/${saleId}/return`, { method: "POST", body: { items, reason, refund_method: method, restock } });
      onDone(r);
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <Modal title={`Return · ${sale.receipt_no}`} onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-sage-500 dark:text-sage-400">Choose how many of each item to return. Restocking returns them to inventory.</p>
        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 rounded-xl border border-sage-200 px-3 py-2 dark:border-sage-800">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-sage-900 dark:text-sage-50">{l.name}</div>
                <div className="text-xs text-sage-400">{money(l.unit_price)} · sold {l.qty}{l.returned_qty ? ` · ${l.returned_qty} returned` : ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-sage-400">of {l.remaining}</span>
                <input type="number" min="0" max={l.remaining} disabled={l.remaining <= 0}
                  className="input w-20 text-right !py-1.5 disabled:opacity-40"
                  value={qty[l.id] || ""} onChange={(e) => {
                    const v = Math.max(0, Math.min(l.remaining, parseInt(e.target.value, 10) || 0));
                    setQty({ ...qty, [l.id]: v });
                  }} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Reason</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. damaged, wrong item" />
          </div>
          <div>
            <label className="label">Refund via</label>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Cash</option><option value="card">Card</option>
              <option value="mobile">Mobile</option>
              {sale.customer_id && <option value="account">Customer account</option>}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-sm text-sage-700 dark:text-sage-300">
          <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="h-4 w-4 rounded border-sage-300 text-brand-600 focus:ring-brand-500" />
          Return items to stock
        </label>

        <div className="flex items-center justify-between rounded-xl bg-sage-50 px-4 py-3 dark:bg-sage-950">
          <span className="text-sm text-sage-500">Refund amount</span>
          <span className="text-xl font-semibold text-sage-900 dark:text-sage-50">{money(refundTotal)}</span>
        </div>

        {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
        <div className="flex justify-end gap-2">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={busy || !anything}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Process refund
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`card relative z-10 max-h-[88vh] w-full overflow-y-auto p-6 ${wide ? "max-w-lg" : "max-w-md"}`}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">{title}</h3>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
