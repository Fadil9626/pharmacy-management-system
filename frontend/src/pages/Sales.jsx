import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import ReceiptModal from "../components/Receipt.jsx";
import { money } from "../lib/money.js";
import {
  Receipt, Search, Loader2, Eye, Banknote, CreditCard, Smartphone,
} from "lucide-react";

const PAY_ICON = { cash: Banknote, card: CreditCard, mobile: Smartphone };

export default function Sales() {
  const { settings } = useAuth();
  const [sales, setSales] = useState(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    api("/api/sales", { params: { limit: 200 } }).then(setSales).catch((e) => setErr(e.message));
  }, []);

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
                      <button className="btn-outline !px-3 !py-1.5 text-xs" onClick={() => openReceipt(s.id)} disabled={loadingDetail}>
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>
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
    </div>
  );
}
