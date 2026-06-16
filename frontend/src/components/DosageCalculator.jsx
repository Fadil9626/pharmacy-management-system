import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { X, Calculator, Search, Syringe } from "lucide-react";

// Weight-based dosing aid. Pick a product (prefills its dosing) or enter values
// manually; enter the patient's weight to get the per-dose amount in mg + units.
export default function DosageCalculator({ onClose }) {
  const [catalog, setCatalog] = useState([]);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [mgPerKg, setMgPerKg] = useState("");
  const [strengthMg, setStrengthMg] = useState("");
  const [maxMg, setMaxMg] = useState("");
  const [freq, setFreq] = useState("");

  useEffect(() => { api("/api/catalog/lite").then((r) => setCatalog(r || [])).catch(() => {}); }, []);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return catalog.filter((p) => p.name.toLowerCase().includes(t)).slice(0, 6);
  }, [q, catalog]);
  const pick = (p) => {
    setName(p.name); setQ("");
    setMgPerKg(p.dose_mg_per_kg ?? ""); setStrengthMg(p.strength_mg ?? "");
    setMaxMg(p.dose_max_mg ?? ""); setFreq(p.default_frequency || "");
  };

  const w = Number(weight) || 0, perKg = Number(mgPerKg) || 0, strength = Number(strengthMg) || 0, max = Number(maxMg) || 0;
  let doseMg = w * perKg;
  const capped = max > 0 && doseMg > max;
  if (capped) doseMg = max;
  doseMg = Math.round(doseMg * 100) / 100;
  const units = strength > 0 ? Math.round((doseMg / strength) * 100) / 100 : null;
  const ready = w > 0 && perKg > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-sage-900 dark:text-sage-50">
            <Calculator className="h-5 w-5 text-brand-600" /> Dosage calculator
          </h3>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sage-400" />
            <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a drug (prefills its dosing)…" />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-sage-200 bg-white p-1 shadow-lg dark:border-sage-800 dark:bg-sage-900">
                {results.map((p) => <button key={p.id} type="button" onClick={() => pick(p)} className="block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-sage-100 dark:hover:bg-sage-800">{p.name}{p.dose_mg_per_kg ? <span className="ml-1 text-xs text-brand-600">· {p.dose_mg_per_kg} mg/kg</span> : null}</button>)}
              </div>
            )}
          </div>
          {name && <div className="text-sm font-medium text-sage-700 dark:text-sage-200">{name}</div>}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Patient weight (kg)"><input type="number" min="0" step="0.1" className="input" value={weight} onChange={(e) => setWeight(e.target.value)} autoFocus placeholder="e.g. 15" /></Field>
            <Field label="Dose (mg/kg)"><input type="number" min="0" step="0.001" className="input" value={mgPerKg} onChange={(e) => setMgPerKg(e.target.value)} placeholder="e.g. 25" /></Field>
            <Field label="Strength (mg/unit)"><input type="number" min="0" step="0.001" className="input" value={strengthMg} onChange={(e) => setStrengthMg(e.target.value)} placeholder="e.g. 250" /></Field>
            <Field label="Max single dose (mg)"><input type="number" min="0" step="0.001" className="input" value={maxMg} onChange={(e) => setMaxMg(e.target.value)} placeholder="optional" /></Field>
          </div>

          {ready && (
            <div className="rounded-xl bg-brand-50 p-4 text-center dark:bg-brand-900/20">
              <div className="flex items-center justify-center gap-2 text-2xl font-bold text-brand-700 dark:text-brand-300">
                <Syringe className="h-5 w-5" /> {doseMg} mg{freq ? <span className="text-base font-medium">/ dose</span> : null}
              </div>
              {units != null && <div className="mt-1 text-sm text-sage-600 dark:text-sage-300">≈ <b>{units}</b> unit{units === 1 ? "" : "s"} per dose{freq ? `, ${freq}` : ""}</div>}
              {capped && <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">Capped at the max single dose ({max} mg).</div>}
            </div>
          )}
          <p className="text-xs text-sage-400">A calculation aid only — always confirm against the prescription and reference dosing.</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <div><label className="label">{label}</label>{children}</div>;
}
