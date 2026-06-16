import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { printLabels, baseWarnings } from "../lib/printing.js";
import ClinicalWarnings from "../components/ClinicalWarnings.jsx";
import {
  ClipboardList, Plus, Search, Loader2, X, Trash2, ArrowLeft,
  Stethoscope, User, CheckCircle2, Ban, Pill, RefreshCw, Tag,
} from "lucide-react";

const STATUS = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  dispensed: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
  cancelled: "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300",
};

export default function Prescriptions() {
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = () => api("/api/prescriptions", { params: { status: filter || undefined } }).then(setList).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [filter]);

  const filtered = useMemo(() => {
    if (!list) return [];
    const t = q.trim().toLowerCase();
    if (!t) return list;
    return list.filter((r) => [r.patient_name, r.prescriber_name, r.rx_number].filter(Boolean).some((v) => v.toLowerCase().includes(t)));
  }, [list, q]);

  if (selected) return <RxDetail id={selected} onBack={() => { setSelected(null); load(); }} />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">Prescriptions</h1>
          <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">{list ? `${list.length} on file` : "Loading…"}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)}><Plus className="h-4 w-4" /> New prescription</button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sage-400" />
          <input className="input pl-10" placeholder="Search patient, prescriber, Rx #…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex rounded-xl border border-sage-200 bg-white p-1 dark:border-sage-800 dark:bg-sage-900">
          {["", "pending", "dispensed"].map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${filter === s ? "bg-brand-600 text-white" : "text-sage-500 hover:bg-sage-100 dark:text-sage-300 dark:hover:bg-sage-800"}`}>
              {s || "All"}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="card border-rose-200 p-4 text-sm text-rose-600 dark:border-rose-900/50 dark:text-rose-300">{err}</div>}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sage-200 text-left text-xs uppercase tracking-wide text-sage-400 dark:border-sage-800">
                <th className="px-5 py-3 font-medium">Rx</th>
                <th className="px-5 py-3 font-medium">Patient</th>
                <th className="px-5 py-3 font-medium">Prescriber</th>
                <th className="px-5 py-3 font-medium text-center">Items</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {!list ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-sage-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-sage-400">No prescriptions found.</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="cursor-pointer border-b border-sage-100 last:border-0 hover:bg-sage-50 dark:border-sage-800/60 dark:hover:bg-sage-800/40" onClick={() => setSelected(r.id)}>
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-sage-900 dark:text-sage-50">{r.rx_number}</div>
                    <div className="text-xs text-sage-400">{new Date(r.created_at).toLocaleDateString()}</div>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-sage-800 dark:text-sage-100">{r.patient_name}</td>
                  <td className="px-5 py-3.5 text-sage-500 dark:text-sage-400">{r.prescriber_name || "—"}</td>
                  <td className="px-5 py-3.5 text-center text-sage-500">{r.item_count}</td>
                  <td className="px-5 py-3.5">
                    <span className={`chip capitalize ${STATUS[r.status]}`}>{r.status}</span>
                    {r.refills_allowed > 0 && <span className="ml-2 text-xs text-sage-400">{r.refills_used}/{r.refills_allowed} refills</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && <RxForm onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`card relative z-10 max-h-[88vh] w-full overflow-y-auto p-6 ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">{title}</h3>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RxForm({ onClose, onSaved }) {
  const blank = { drug_name: "", dosage: "", quantity: 1 };
  const [f, setF] = useState({ patient_name: "", prescriber_name: "", prescriber_facility: "", prescribed_date: "", refills_allowed: 0, notes: "" });
  const [lines, setLines] = useState([blank]);
  const [products, setProducts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { api("/api/catalog/lite").then(setProducts).catch(() => {}); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setLine = (i, k, v) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const addLine = () => setLines((p) => [...p, blank]);
  const rmLine = (i) => setLines((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)));

  const save = async (e) => {
    e.preventDefault();
    const items = lines.filter((l) => l.drug_name.trim()).map((l) => ({ drug_name: l.drug_name.trim(), dosage: l.dosage, quantity: Number(l.quantity) || 0 }));
    if (!items.length) return setErr("Add at least one drug.");
    setBusy(true); setErr("");
    try { await api("/api/prescriptions", { method: "POST", body: { ...f, refills_allowed: Number(f.refills_allowed) || 0, items } }); onSaved(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <Modal title="New prescription" onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Patient *</label><input className="input" value={f.patient_name} onChange={set("patient_name")} required autoFocus /></div>
          <div><label className="label">Prescribed date</label><input type="date" className="input" value={f.prescribed_date} onChange={set("prescribed_date")} /></div>
          <div><label className="label">Prescriber</label><input className="input" value={f.prescriber_name} onChange={set("prescriber_name")} placeholder="Dr. …" /></div>
          <div><label className="label">Facility</label><input className="input" value={f.prescriber_facility} onChange={set("prescriber_facility")} /></div>
        </div>

        <div className="space-y-2">
          <label className="label">Drugs</label>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 rounded-xl border border-sage-200 p-2 dark:border-sage-800 sm:grid-cols-[1fr_1fr_70px_36px] sm:border-0 sm:p-0">
              <input className="input" list="rx-drugs" placeholder="Drug" value={l.drug_name} onChange={(e) => setLine(i, "drug_name", e.target.value)} />
              <input className="input" placeholder="Dosage / sig (e.g. 1 tab TID)" value={l.dosage} onChange={(e) => setLine(i, "dosage", e.target.value)} />
              <input type="number" min="1" className="input text-right" placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, "quantity", e.target.value)} />
              <button type="button" onClick={() => rmLine(i)} className="btn-ghost !px-2 text-sage-400 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <datalist id="rx-drugs">{products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
          <button type="button" onClick={addLine} className="btn-outline w-full"><Plus className="h-4 w-4" /> Add drug</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Refills allowed</label><input type="number" min="0" className="input" value={f.refills_allowed} onChange={set("refills_allowed")} /></div>
          <div><label className="label">Notes</label><input className="input" value={f.notes} onChange={set("notes")} /></div>
        </div>

        {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save prescription</button>
        </div>
      </form>
    </Modal>
  );
}

function RxDetail({ id, onBack }) {
  const { settings, moduleEnabled } = useAuth();
  const [rx, setRx] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [clinical, setClinical] = useState(null);
  const load = () => api(`/api/prescriptions/${id}`).then(setRx).catch((e) => setErr(e.message));

  const printRxLabels = () => {
    const labels = (rx.items || []).map((it) => ({
      drug: it.drug_name,
      directions: it.dosage,
      qty: it.dispensed_qty || it.quantity,
      warnings: baseWarnings(),
    }));
    printLabels(labels, {
      patient_name: rx.patient_name,
      prescriber_name: rx.prescriber_name,
      rx_number: rx.rx_number,
      date: rx.dispensed_at,
    }, settings);
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (!moduleEnabled("clinical")) { setClinical(null); return; }
    const items = (rx?.items || []).filter((it) => it.product_id).map((it) => ({ product_id: it.product_id }));
    if (!items.length && !rx?.customer_id) { setClinical(null); return; }
    api("/api/clinical/check", { method: "POST", body: { items, customer_id: rx?.customer_id || null } })
      .then(setClinical).catch(() => setClinical(null));
  }, [rx]);

  const act = async (path) => {
    setBusy(true); setErr("");
    try { await api(`/api/prescriptions/${id}/${path}`, { method: "POST" }); load(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (err) return <div className="card border-rose-200 p-4 text-sm text-rose-600">{err}</div>;
  if (!rx) return <div className="flex h-40 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  const canRefill = rx.status === "dispensed" && rx.refills_used < rx.refills_allowed;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button onClick={onBack} className="btn-ghost !px-2"><ArrowLeft className="h-4 w-4" /> All prescriptions</button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">{rx.rx_number}</h1>
            <span className={`chip capitalize ${STATUS[rx.status]}`}>{rx.status}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-sage-500 dark:text-sage-400">
            <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> {rx.patient_name}</span>
            {rx.prescriber_name && <span className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> {rx.prescriber_name}{rx.prescriber_facility ? ` · ${rx.prescriber_facility}` : ""}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {rx.items?.length > 0 && <button className="btn-outline" onClick={printRxLabels}><Tag className="h-4 w-4" /> Print labels</button>}
          {rx.status === "pending" && <button className="btn-primary" disabled={busy} onClick={() => act("dispense")}><CheckCircle2 className="h-4 w-4" /> Dispense</button>}
          {canRefill && <button className="btn-primary" disabled={busy} onClick={() => act("dispense")}><RefreshCw className="h-4 w-4" /> Dispense refill</button>}
          {rx.status !== "dispensed" && rx.status !== "cancelled" && <button className="btn-outline text-rose-500" disabled={busy} onClick={() => act("cancel")}><Ban className="h-4 w-4" /> Cancel</button>}
        </div>
      </div>

      <ClinicalWarnings data={clinical} />

      <div className="card p-6">
        <h2 className="mb-3 font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Medications</h2>
        <div className="space-y-2">
          {rx.items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 rounded-xl bg-sage-50 px-4 py-3 dark:bg-sage-950">
              <Pill className="h-4 w-4 shrink-0 text-brand-600" />
              <div className="flex-1">
                <div className="font-medium text-sage-900 dark:text-sage-50">{it.drug_name} {it.product_id && <span className="text-xs text-brand-600">· in catalogue</span>}</div>
                {it.dosage && <div className="text-xs text-sage-500 dark:text-sage-400">{it.dosage}</div>}
              </div>
              <div className="text-right text-sm">
                <span className="font-semibold text-sage-900 dark:text-sage-50">{it.quantity}</span>
                <span className="text-sage-400"> qty</span>
              </div>
            </div>
          ))}
        </div>
        {rx.notes && <p className="mt-4 text-sm text-sage-500 dark:text-sage-400">Note: {rx.notes}</p>}
        {rx.refills_allowed > 0 && <p className="mt-2 text-sm text-sage-500 dark:text-sage-400">Refills: {rx.refills_used} of {rx.refills_allowed} used</p>}
        {rx.dispensed_by_name && <p className="mt-2 text-xs text-sage-400">Last dispensed by {rx.dispensed_by_name} · {new Date(rx.dispensed_at).toLocaleString()}</p>}
      </div>
    </div>
  );
}
