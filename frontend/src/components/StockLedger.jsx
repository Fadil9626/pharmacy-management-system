import { num } from "../lib/money.js";

// One chip colour per kind of change: arrivals green, departures rose,
// corrections amber, the starting balance neutral.
const TONE = {
  opening: "bg-sage-100 text-sage-600 dark:bg-sage-800 dark:text-sage-300",
  received: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
  transfer_in: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
  return: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
  sale: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  transfer_out: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  return_to_supplier: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  disposal: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};
const AMBER = "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";

const when = (d) => new Date(d).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Every change to a product's stock with its running balance — the controlled
 * drug register and the stock card. `card` is what /register or /stock-card returns.
 * Newest first on screen; the balance column is the balance after each line.
 */
export default function StockLedger({ card, showBranch = false }) {
  const rows = [...card.ledger].reverse();
  const disagree = card.on_shelf != null && card.on_shelf !== card.balance;
  return (
    <div className="space-y-3">
      {disagree && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          The history adds up to {num(card.balance)} but {num(card.on_shelf)} are on the shelf. Count this product to find the difference.
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sage-200 text-left text-xs uppercase tracking-wide text-sage-400 dark:border-sage-800">
              <th className="px-5 py-2.5 font-medium">When</th>
              <th className="px-5 py-2.5 font-medium">Movement</th>
              <th className="px-5 py-2.5 font-medium">Reference</th>
              <th className="px-5 py-2.5 font-medium">Details</th>
              {showBranch && <th className="px-5 py-2.5 font-medium">Branch</th>}
              <th className="px-5 py-2.5 text-right font-medium">In</th>
              <th className="px-5 py-2.5 text-right font-medium">Out</th>
              <th className="px-5 py-2.5 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={showBranch ? 8 : 7} className="px-5 py-10 text-center text-sage-400">No movements recorded.</td></tr>
            ) : rows.map((m) => (
              <tr key={m.id} className="border-b border-sage-100 align-top last:border-0 dark:border-sage-800/60">
                <td className="whitespace-nowrap px-5 py-2.5 text-sage-500">{when(m.at)}</td>
                <td className="px-5 py-2.5"><span className={`chip ${TONE[m.type] || AMBER}`}>{m.label}</span></td>
                <td className="px-5 py-2.5 text-sage-500">
                  {m.ref || "—"}
                  {m.batch_no && <div className="text-xs text-sage-400">Batch {m.batch_no}</div>}
                </td>
                <td className="px-5 py-2.5 text-sage-600 dark:text-sage-300">
                  <div>{m.party || "—"}</div>
                  {m.license && <div className="text-xs text-sage-400">Prescriber {m.prescriber ? `${m.prescriber}, ` : ""}licence {m.license}</div>}
                  {m.reason && <div className="text-xs capitalize text-sage-400">Reason: {m.reason}</div>}
                  {m.witness && <div className="text-xs text-sage-400">Witness: {m.witness}</div>}
                  {m.note && <div className="text-xs text-sage-400">{m.note}</div>}
                  {m.actor && <div className="text-xs text-sage-400">By {m.actor}</div>}
                </td>
                {showBranch && <td className="px-5 py-2.5 text-sage-500">{m.branch || "—"}</td>}
                <td className="px-5 py-2.5 text-right font-medium tabular-nums text-brand-600 dark:text-brand-400">{m.delta > 0 ? num(m.delta) : ""}</td>
                <td className="px-5 py-2.5 text-right font-medium tabular-nums text-rose-600 dark:text-rose-400">{m.delta < 0 ? num(-m.delta) : ""}</td>
                <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-sage-900 dark:text-sage-50">{num(m.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
