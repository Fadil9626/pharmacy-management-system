import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { num } from "../lib/money.js";
import StockLedger from "../components/StockLedger.jsx";
import { ArrowLeft, Loader2, Printer } from "lucide-react";

/**
 * A product's stock card: every receipt, sale, return, transfer, count,
 * adjustment and disposal, with the running balance. For the branch being
 * looked at (owners and managers: the branch picked, or all).
 */
export default function StockCard() {
  const { id } = useParams();
  const [card, setCard] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setCard(null); setErr("");
    api(`/api/products/${id}/stock-card`).then(setCard).catch((e) => setErr(e.message));
  }, [id]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/inventory" className="inline-flex items-center gap-1 text-sm text-sage-500 hover:text-brand-600">
            <ArrowLeft className="h-4 w-4" /> Inventory
          </Link>
          <h1 className="mt-1 font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">
            Stock card{card ? ` — ${card.product.name}` : ""}
          </h1>
          {card && (
            <p className="text-sm text-sage-500 dark:text-sage-400">
              {[card.product.strength, card.product.unit].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {card && (
          <button className="btn-outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </button>
        )}
      </div>

      {err && <div className="card px-5 py-4 text-sm text-rose-600">{err}</div>}
      {!card && !err && (
        <div className="card flex h-40 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
      )}
      {card && (
        <>
          <dl className="grid grid-cols-3 gap-3">
            {[["In", card.total_in], ["Out", card.total_out], ["Balance", card.balance]].map(([k, v]) => (
              <div key={k} className="card px-4 py-3">
                <dt className="text-xs uppercase tracking-wide text-sage-400">{k}</dt>
                <dd className="font-display text-xl font-semibold tabular-nums text-sage-900 dark:text-sage-50">{num(v)}</dd>
              </div>
            ))}
          </dl>
          <div className="card overflow-hidden">
            <StockLedger card={card} showBranch />
          </div>
          <p className="text-xs text-sage-400">
            The history starts with an opening balance on the day it was switched on; every change since is recorded as it happens.
          </p>
        </>
      )}
    </div>
  );
}
