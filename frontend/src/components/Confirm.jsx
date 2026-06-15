import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

// Reusable in-app confirmation dialog (replaces native window.confirm).
export default function ConfirmModal({ title = "Are you sure?", message, confirmLabel = "Confirm", danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true); setErr("");
    try { await onConfirm(); } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="card relative z-10 w-full max-w-sm p-6">
        <div className="mb-3 flex items-center gap-2.5">
          <span className={`grid h-9 w-9 place-items-center rounded-xl ${danger ? "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
            <AlertTriangle className="h-5 w-5" />
          </span>
          <h3 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">{title}</h3>
        </div>
        {message && <p className="mb-4 text-sm text-sage-500 dark:text-sage-400">{message}</p>}
        {err && <div className="mb-3 text-sm text-rose-600 dark:text-rose-400">{err}</div>}
        <div className="flex justify-end gap-2">
          <button className="btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button className={danger ? "btn bg-rose-600 text-white hover:bg-rose-700" : "btn-primary"} onClick={go} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}{confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
