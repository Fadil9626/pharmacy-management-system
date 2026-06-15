import { Fragment, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  Users, Plus, X, Loader2, KeyRound, ShieldCheck, UserCog, CheckCircle2, Ban,
  Shield, Save, Lock, ScrollText, Search,
} from "lucide-react";

const ROLES = ["owner", "manager", "pharmacist", "cashier"];
const ROLE_TONE = {
  owner: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
  manager: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  pharmacist: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  cashier: "bg-sage-100 text-sage-600 dark:bg-sage-800 dark:text-sage-300",
};

export default function Staff() {
  const { user } = useAuth();
  const [tab, setTab] = useState("people");
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [pwUser, setPwUser] = useState(null);

  const load = () => api("/api/users").then(setList).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const toggleActive = async (u) => {
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: { is_active: !u.is_active } });
      load();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">Staff</h1>
          <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">Manage who can sign in and what they can do.</p>
        </div>
        {tab === "people" && <button className="btn-primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add staff</button>}
      </div>

      <div className="flex gap-1 rounded-xl border border-sage-200 bg-white p-1 dark:border-sage-800 dark:bg-sage-900 sm:inline-flex">
        {[["people", "People", Users], ["permissions", "Roles & Permissions", Shield], ["activity", "Activity", ScrollText]].map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition sm:flex-none ${
              tab === key ? "bg-brand-600 text-white shadow-soft" : "text-sage-500 hover:bg-sage-100 dark:text-sage-300 dark:hover:bg-sage-800"}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {err && <div className="card border-rose-200 p-4 text-sm text-rose-600 dark:border-rose-900/50 dark:text-rose-300">{err}</div>}

      {tab === "permissions" && <PermissionsMatrix canEdit={user?.role === "owner"} />}
      {tab === "activity" && <AuditLog />}

      {tab === "people" && (
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sage-200 text-left text-xs uppercase tracking-wide text-sage-400 dark:border-sage-800">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!list ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-sage-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : list.map((u) => (
                <tr key={u.id} className="border-b border-sage-100 last:border-0 hover:bg-sage-50 dark:border-sage-800/60 dark:hover:bg-sage-800/40">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                        {(u.full_name || "?").charAt(0).toUpperCase()}
                      </span>
                      <span className="font-medium text-sage-900 dark:text-sage-50">
                        {u.full_name}{u.id === user?.id && <span className="ml-1 text-xs text-sage-400">(you)</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sage-500 dark:text-sage-400">{u.email}</td>
                  <td className="px-5 py-3.5"><span className={`chip capitalize ${ROLE_TONE[u.role]}`}>{u.role}</span></td>
                  <td className="px-5 py-3.5">
                    {u.is_active
                      ? <span className="chip bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">Active</span>
                      : <span className="chip bg-sage-100 text-sage-400 dark:bg-sage-800 dark:text-sage-500">Disabled</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-1.5">
                      <button className="btn-ghost !px-2 !py-1.5 text-xs" onClick={() => setEditUser(u)} title="Edit"><UserCog className="h-4 w-4" /></button>
                      <button className="btn-ghost !px-2 !py-1.5 text-xs" onClick={() => setPwUser(u)} title="Reset password"><KeyRound className="h-4 w-4" /></button>
                      {u.id !== user?.id && (
                        <button className="btn-ghost !px-2 !py-1.5 text-xs text-sage-400 hover:text-rose-500" onClick={() => toggleActive(u)} title={u.is_active ? "Disable" : "Enable"}>
                          {u.is_active ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} canMintOwner={user?.role === "owner"} />}
      {editUser && <EditModal u={editUser} onClose={() => setEditUser(null)} onSaved={() => { setEditUser(null); load(); }} canMintOwner={user?.role === "owner"} />}
      {pwUser && <PasswordModal u={pwUser} onClose={() => setPwUser(null)} onSaved={() => setPwUser(null)} />}
    </div>
  );
}

const ACTION_LABEL = {
  refund: "Refund", stock_adjust: "Stock adjust", product_update: "Product edit",
  product_deactivate: "Product removed", settings_update: "Settings change",
  permissions_update: "Permissions change", user_create: "Staff added",
  user_update: "Staff edit", user_password_reset: "Password reset", po_cancel: "PO cancelled",
};
const ACTION_TONE = {
  refund: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  stock_adjust: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  permissions_update: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  settings_update: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
};

function AuditLog() {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState("");

  const fetchPage = (off, append) => {
    api("/api/audit", { params: { limit: 50, offset: off, action, q } })
      .then((d) => { setData(d); setRows(append ? (r) => [...r, ...d.rows] : d.rows); setMore(d.rows.length === 50); })
      .catch((e) => setErr(e.message));
  };
  useEffect(() => { setOffset(0); fetchPage(0, false); }, [action]);

  const search = (e) => { e.preventDefault(); setOffset(0); fetchPage(0, false); };

  if (err) return <div className="card border-rose-200 p-4 text-sm text-rose-600 dark:border-rose-900/50 dark:text-rose-300">{err}</div>;
  if (!data) return <div className="flex h-40 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={search} className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sage-400" />
          <input className="input pl-10" placeholder="Search by user or action…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <select className="input !w-auto" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {data.actions.map((a) => <option key={a} value={a}>{ACTION_LABEL[a] || a}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sage-200 text-left text-xs uppercase tracking-wide text-sage-400 dark:border-sage-800">
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Who</th>
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-sage-400">No activity recorded yet.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-b border-sage-100 last:border-0 dark:border-sage-800/60">
                  <td className="px-5 py-3 whitespace-nowrap text-sage-500 dark:text-sage-400">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-5 py-3 font-medium text-sage-800 dark:text-sage-100">{r.user_name || "—"}</td>
                  <td className="px-5 py-3"><span className={`chip ${ACTION_TONE[r.action] || "bg-sage-100 text-sage-600 dark:bg-sage-800 dark:text-sage-300"}`}>{ACTION_LABEL[r.action] || r.action}</span></td>
                  <td className="px-5 py-3 text-xs text-sage-500 dark:text-sage-400">
                    {r.entity}{r.entity_id ? ` #${r.entity_id}` : ""}{r.details ? " · " + Object.entries(r.details).map(([k, v]) => `${k}: ${v}`).join(", ") : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {more && (
        <div className="flex justify-center">
          <button className="btn-outline" onClick={() => { const n = offset + 50; setOffset(n); fetchPage(n, true); }}>Load more</button>
        </div>
      )}
    </div>
  );
}

function PermissionsMatrix({ canEdit }) {
  const [data, setData] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api("/api/permissions").then((d) => { setData(d); setMatrix(structuredClone(d.matrix)); }).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="card border-rose-200 p-4 text-sm text-rose-600 dark:border-rose-900/50 dark:text-rose-300">{err}</div>;
  if (!data || !matrix) return <div className="flex h-40 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const editable = data.roles.filter((r) => r !== "owner");
  const groups = [...new Set(data.permissions.map((p) => p.group))];

  const toggle = (role, key) => {
    if (!canEdit || role === "owner") return;
    setMatrix((m) => {
      const set = new Set(m[role]);
      set.has(key) ? set.delete(key) : set.add(key);
      return { ...m, [role]: [...set] };
    });
  };
  const has = (role, key) => role === "owner" || matrix[role].includes(key);

  const save = async () => {
    setBusy(true); setErr(""); setSaved(false);
    try {
      for (const role of editable) {
        await api(`/api/permissions/${role}`, { method: "PUT", body: { permissions: matrix[role] } });
      }
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start gap-2 text-sm text-sage-500 dark:text-sage-400">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Choose what each role can do. <b className="text-sage-700 dark:text-sage-200">Owner</b> always has full access. {canEdit ? "Changes apply on Save." : "Only an owner can change these."}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sage-200 dark:border-sage-800">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-sage-400">Permission</th>
                {data.roles.map((r) => (
                  <th key={r} className="px-3 py-3 text-center text-xs font-medium uppercase tracking-wide text-sage-500 dark:text-sage-300">{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g}>
                  <tr className="bg-sage-50 dark:bg-sage-950/50">
                    <td colSpan={data.roles.length + 1} className="px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-sage-400">{g}</td>
                  </tr>
                  {data.permissions.filter((p) => p.group === g).map((p) => (
                    <tr key={p.key} className="border-b border-sage-100 last:border-0 dark:border-sage-800/60">
                      <td className="px-5 py-2.5 text-sage-700 dark:text-sage-200">{p.label}</td>
                      {data.roles.map((r) => (
                        <td key={r} className="px-3 py-2.5 text-center">
                          <input type="checkbox" checked={has(r, p.key)}
                            disabled={!canEdit || r === "owner"}
                            onChange={() => toggle(r, p.key)}
                            className="h-4 w-4 rounded border-sage-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit && (
        <div className="flex items-center gap-3">
          <button onClick={save} className="btn-primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save permissions
          </button>
          {saved && <span className="flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400"><CheckCircle2 className="h-4 w-4" /> Saved · users see changes on next sign-in</span>}
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-md p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">{title}</h3>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RoleSelect({ value, onChange, canMintOwner, disabled }) {
  return (
    <select className="input" value={value} onChange={onChange} disabled={disabled}>
      {ROLES.filter((r) => r !== "owner" || canMintOwner || value === "owner").map((r) => (
        <option key={r} value={r} className="capitalize">{r[0].toUpperCase() + r.slice(1)}</option>
      ))}
    </select>
  );
}

function AddModal({ onClose, onSaved, canMintOwner }) {
  const [f, setF] = useState({ full_name: "", email: "", password: "", role: "cashier" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await api("/api/users", { method: "POST", body: f }); onSaved(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title="Add staff" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div><label className="label">Full name</label><input className="input" value={f.full_name} onChange={set("full_name")} required autoFocus /></div>
        <div><label className="label">Email</label><input type="email" className="input" value={f.email} onChange={set("email")} required /></div>
        <div><label className="label">Temporary password</label><input className="input" value={f.password} onChange={set("password")} required minLength={6} placeholder="Min 6 characters" /></div>
        <div><label className="label">Role</label><RoleSelect value={f.role} onChange={set("role")} canMintOwner={canMintOwner} /></div>
        {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create</button></div>
      </form>
    </Modal>
  );
}

function EditModal({ u, onClose, onSaved, canMintOwner }) {
  const [f, setF] = useState({ full_name: u.full_name, role: u.role });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await api(`/api/users/${u.id}`, { method: "PATCH", body: f }); onSaved(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title={`Edit ${u.full_name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div><label className="label">Full name</label><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required /></div>
        <div><label className="label">Role</label><RoleSelect value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} canMintOwner={canMintOwner} /></div>
        {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Save</button></div>
      </form>
    </Modal>
  );
}

function PasswordModal({ u, onClose, onSaved }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await api(`/api/users/${u.id}/reset-password`, { method: "POST", body: { password: pw } }); setDone(true); setTimeout(onSaved, 1200); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title={`Reset password · ${u.full_name}`} onClose={onClose}>
      {done ? (
        <div className="flex items-center gap-2 py-4 text-brand-600 dark:text-brand-400"><CheckCircle2 className="h-5 w-5" /> Password updated.</div>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <div><label className="label">New password</label><input className="input" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} placeholder="Min 6 characters" autoFocus /></div>
          {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
          <div className="flex justify-end gap-2"><button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Set password</button></div>
        </form>
      )}
    </Modal>
  );
}
