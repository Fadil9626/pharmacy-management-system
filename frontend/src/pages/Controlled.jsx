import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { num } from "../lib/money.js";
import {
  ShieldAlert, Loader2, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal,
  Scale, Printer,
} from "lucide-react";

const TYPE = {
  received: { label: "Received", icon: ArrowDownToLine, tone: "text-brand-600", chip: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300" },
  dispensed: { label: "Dispensed", icon: ArrowUpFromLine, tone: "text-rose-600", chip: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
};
const adjChip = "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";

export default function Controlled() {
  const [products, setProducts] = useState(null);
  const [sel, setSel] = useState(null);
  const [reg, setReg] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/api/controlled/products").then((p) => {
      setProducts(p);
      if (p.length) setSel(p[0].id);
    }).catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!sel) return;
    setReg(null);
    api(`/api/controlled/${sel}/register`).then(setReg).catch((e) => setErr(e.message));
  }, [sel]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-rose-500" />
          <div>
            <h1 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">Controlled drugs register</h1>
            <p className="mt-0.5 text-sm text-sage-500 dark:text-sage-400">Immutable movement log for scheduled medicines.</p>
          </div>
        </div>
        {reg && <button onClick={() => window.print()} className="btn-outline"><Printer className="h-4 w-4" /> Print</button>}
      </div>

      {err && <div className="card border-rose-200 p-4 text-sm text-rose-600 dark:border-rose-900/50 dark:text-rose-300">{err}</div>}

      {!products ? (
        <div className="flex h-32 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : products.length === 0 ? (
        <div className="card p-10 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-sage-300" />
          <p className="text-sage-500 dark:text-sage-400">No products are flagged as controlled. Mark a product “Controlled drug” in Inventory to track it here.</p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          {/* Product list */}
          <div className="card h-fit overflow-hidden">
            {products.map((p) => (
              <button key={p.id} onClick={() => setSel(p.id)}
                className={`flex w-full items-center justify-between border-b border-sage-100 px-4 py-3 text-left text-sm last:border-0 transition dark:border-sage-800/60 ${sel === p.id ? "bg-brand-50 dark:bg-brand-900/20" : "hover:bg-sage-50 dark:hover:bg-sage-800/40"}`}>
                <span>
                  <span className="font-medium text-sage-900 dark:text-sage-50">{p.name}</span>
                  {p.strength && <span className="block text-xs text-sage-400">{p.strength}</span>}
                </span>
                <span className="text-xs font-semibold text-sage-500">{p.stock}</span>
              </button>
            ))}
          </div>

          {/* Register */}
          <div id="receipt" className="space-y-4">
            {!reg ? (
              <div className="card flex h-40 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Mini icon={ArrowDownToLine} tone="brand" label="Total in" value={num(reg.total_in)} />
                  <Mini icon={ArrowUpFromLine} tone="rose" label="Total out" value={num(reg.total_out)} />
                  <Mini icon={Scale} tone="sky" label="Balance" value={num(reg.balance)} />
                </div>

                <div className="card overflow-hidden">
                  <div className="border-b border-sage-200 px-5 py-3 font-display text-lg font-semibold text-sage-900 dark:border-sage-800 dark:text-sage-50">
                    {reg.product}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-sage-200 text-left text-xs uppercase tracking-wide text-sage-400 dark:border-sage-800">
                          <th className="px-5 py-2.5 font-medium">Date</th>
                          <th className="px-5 py-2.5 font-medium">Movement</th>
                          <th className="px-5 py-2.5 font-medium">Reference</th>
                          <th className="px-5 py-2.5 font-medium">Party / by</th>
                          <th className="px-5 py-2.5 text-right font-medium">In</th>
                          <th className="px-5 py-2.5 text-right font-medium">Out</th>
                          <th className="px-5 py-2.5 text-right font-medium">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reg.ledger.length === 0 ? (
                          <tr><td colSpan={7} className="px-5 py-10 text-center text-sage-400">No movements recorded.</td></tr>
                        ) : reg.ledger.map((m, i) => {
                          const t = TYPE[m.type];
                          return (
                            <tr key={i} className="border-b border-sage-100 last:border-0 dark:border-sage-800/60">
                              <td className="px-5 py-2.5 text-sage-500">{new Date(m.at).toLocaleDateString()}</td>
                              <td className="px-5 py-2.5">
                                <span className={`chip capitalize ${t ? t.chip : adjChip}`}>{t ? t.label : m.type}</span>
                              </td>
                              <td className="px-5 py-2.5 text-sage-500">{m.ref || "—"}</td>
                              <td className="px-5 py-2.5 text-sage-600 dark:text-sage-300">{m.party || m.actor || "—"}</td>
                              <td className="px-5 py-2.5 text-right font-medium text-brand-600 dark:text-brand-400">{m.delta > 0 ? num(m.delta) : ""}</td>
                              <td className="px-5 py-2.5 text-right font-medium text-rose-600 dark:text-rose-400">{m.delta < 0 ? num(-m.delta) : ""}</td>
                              <td className="px-5 py-2.5 text-right font-semibold text-sage-900 dark:text-sage-50">{num(m.balance)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ icon: Icon, label, value, tone }) {
  const tones = {
    brand: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  };
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-4 w-4" /></span>
      <div>
        <div className="text-lg font-semibold tracking-tight text-sage-900 dark:text-sage-50">{value}</div>
        <div className="text-xs text-sage-500 dark:text-sage-400">{label}</div>
      </div>
    </div>
  );
}
