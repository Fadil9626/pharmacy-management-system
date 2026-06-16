import { AlertTriangle, Ban } from "lucide-react";

const sevChip = {
  severe: "bg-rose-200 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200",
  moderate: "bg-amber-200 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
  minor: "bg-sage-200 text-sage-700 dark:bg-sage-700 dark:text-sage-200",
};

// Shows allergy + drug-interaction alerts for a cart / prescription. Returns null
// when there's nothing to flag.
export default function ClinicalWarnings({ data, className = "" }) {
  const allergies = data?.allergies || [];
  const interactions = data?.interactions || [];
  const conditions = data?.conditions || [];
  if (!allergies.length && !interactions.length && !conditions.length) return null;
  return (
    <div className={`rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm dark:border-rose-900/50 dark:bg-rose-950/30 ${className}`}>
      <div className="mb-1.5 flex items-center gap-2 font-semibold text-rose-700 dark:text-rose-300">
        <AlertTriangle className="h-4 w-4" /> Clinical alert — review before dispensing
      </div>
      <ul className="space-y-1 text-rose-700 dark:text-rose-200">
        {allergies.map((a, i) => (
          <li key={`a${i}`} className="flex items-start gap-1.5">
            <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span><b>{a.product}</b> — patient is allergic to <b>{a.allergen}</b></span>
          </li>
        ))}
        {interactions.map((x, i) => (
          <li key={`i${i}`} className="flex items-start gap-1.5">
            <span className={`chip mt-0.5 shrink-0 capitalize ${sevChip[x.severity] || sevChip.moderate}`}>{x.severity}</span>
            <span><b>{x.a}</b> + <b>{x.b}</b>{x.note ? ` — ${x.note}` : ""}</span>
          </li>
        ))}
        {conditions.map((x, i) => (
          <li key={`c${i}`} className="flex items-start gap-1.5">
            <span className={`chip mt-0.5 shrink-0 capitalize ${sevChip[x.severity] || sevChip.moderate}`}>{x.severity}</span>
            <span><b>{x.product}</b> — {x.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
