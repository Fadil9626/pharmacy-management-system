import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  TrendingUp, Coins, Loader2, Plus, ArrowRight, History, Landmark, CheckCircle2,
} from "lucide-react";

export default function Pricing() {
  const { settings, reloadSettings, hasRole } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const canEdit = hasRole("owner", "manager");

  const load = () => api("/api/pricing").then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const base = settings?.base_currency || data?.base_currency || "USD";
  const quote = settings?.currency_code || data?.quote_currency || "—";
  const symbol = settings?.currency_symbol || "";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">Market pricing</h1>
        <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">
          Retail prices float on the open-market rate to protect margins. The ledger stays in {quote}.
        </p>
      </div>

      {err && <div className="card border-rose-200 p-4 text-sm text-rose-600 dark:border-rose-900/50 dark:text-rose-300">{err}</div>}

      {!data ? (
        <div className="flex h-32 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          {/* Current rate banner */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card p-6">
              <div className="flex items-center gap-2 text-brand-600">
                <TrendingUp className="h-5 w-5" />
                <span className="text-sm font-medium uppercase tracking-wide text-sage-400">Market rate</span>
              </div>
              {data.market_rate ? (
                <>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-semibold tracking-tight text-sage-900 dark:text-sage-50">
                      {Number(data.market_rate.rate).toLocaleString()}
                    </span>
                    <span className="text-sm text-sage-400">{quote} / {base}</span>
                  </div>
                  <div className="mt-1 text-xs text-sage-400">
                    1 {base} = {symbol}{Number(data.market_rate.rate).toLocaleString()} · set {new Date(data.market_rate.created_at).toLocaleString()}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">No market rate set yet — prices use their fixed amounts until you add one.</p>
              )}
            </div>

            <div className="card p-6">
              <div className="flex items-center gap-2 text-sage-500">
                <Landmark className="h-5 w-5" />
                <span className="text-sm font-medium uppercase tracking-wide text-sage-400">Official rate</span>
              </div>
              {data.official_rate ? (
                <>
                  <div className="mt-3 text-3xl font-semibold tracking-tight text-sage-900 dark:text-sage-50">
                    {Number(data.official_rate.rate).toLocaleString()}
                    <span className="ml-2 text-sm font-normal text-sage-400">{quote} / {base}</span>
                  </div>
                  <div className="mt-1 text-xs text-sage-400">for reference · set {new Date(data.official_rate.created_at).toLocaleString()}</div>
                </>
              ) : (
                <p className="mt-3 text-sm text-sage-400">Optional — track the bank rate for comparison.</p>
              )}
            </div>
          </div>

          {canEdit && <RateForm base={base} quote={quote} onSaved={load} />}
          {canEdit && <BaseCurrency base={base} onSaved={reloadSettings} />}

          {/* History */}
          <div className="card p-6">
            <div className="mb-4 flex items-center gap-2">
              <History className="h-5 w-5 text-sage-400" />
              <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Rate history</h2>
            </div>
            {data.history.length === 0 ? (
              <p className="text-sm text-sage-400">No rates recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sage-200 text-left text-xs uppercase tracking-wide text-sage-400 dark:border-sage-800">
                    <th className="pb-2 font-medium">When</th>
                    <th className="pb-2 font-medium">Source</th>
                    <th className="pb-2 text-right font-medium">Rate</th>
                    <th className="pb-2 font-medium">By</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((r) => (
                    <tr key={r.id} className="border-b border-sage-100 last:border-0 dark:border-sage-800/60">
                      <td className="py-2 text-sage-500">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="py-2">
                        <span className={`chip ${r.source === "market" ? "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300" : "bg-sage-100 text-sage-500 dark:bg-sage-800 dark:text-sage-300"}`}>{r.source}</span>
                      </td>
                      <td className="py-2 text-right font-medium text-sage-900 dark:text-sage-50">{Number(r.rate).toLocaleString()}</td>
                      <td className="py-2 text-sage-500">{r.set_by || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RateForm({ base, quote, onSaved }) {
  const [rate, setRate] = useState("");
  const [source, setSource] = useState("market");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await api("/api/pricing/rate", { method: "POST", body: { rate: Number(rate), source, note } });
      setRate(""); setNote("");
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="card space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Coins className="h-5 w-5 text-brand-600" />
        <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Update rate</h2>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-end gap-2">
          <span className="pb-3 text-sm text-sage-500">1 {base} =</span>
          <div>
            <label className="label">Rate ({quote})</label>
            <input type="number" min="0" step="0.0001" className="input w-36" value={rate} onChange={(e) => setRate(e.target.value)} required placeholder="0.00" />
          </div>
        </div>
        <div>
          <label className="label">Source</label>
          <select className="input w-36" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="market">Open market</option>
            <option value="official">Official / bank</option>
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="label">Note</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
        </div>
        <button className="btn-primary" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save rate
        </button>
      </div>
      {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
    </form>
  );
}

function BaseCurrency({ base, onSaved }) {
  const [val, setVal] = useState(base);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => setVal(base), [base]);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setDone(false);
    try { await api("/api/settings", { method: "PUT", body: { base_currency: val.trim().toUpperCase() } }); await onSaved(); setDone(true); setTimeout(() => setDone(false), 2000); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="card flex flex-wrap items-end gap-3 p-6">
      <div>
        <label className="label">Base (anchor) currency</label>
        <input className="input w-36" value={val} onChange={(e) => setVal(e.target.value)} />
        <p className="mt-1 text-xs text-sage-400">Currency your base prices are denominated in.</p>
      </div>
      <ArrowRight className="mb-7 h-4 w-4 text-sage-300" />
      <button className="btn-outline mb-1" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <CheckCircle2 className="h-4 w-4 text-brand-600" /> : null}
        {done ? "Saved" : "Update"}
      </button>
    </form>
  );
}
