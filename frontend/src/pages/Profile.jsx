import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../lib/theme.js";
import { api, setToken } from "../lib/api.js";
import TwoFactorPanel from "../components/TwoFactorPanel.jsx";
import {
  UserCircle, Mail, Shield, GitBranch, Clock, Loader2, Save, CheckCircle2,
  KeyRound, ShieldCheck, MonitorSmartphone, Power, Moon, Sun,
} from "lucide-react";

function Section({ icon: Icon, title, hint, children }) {
  return (
    <div className="card p-6">
      <div className="mb-1 flex items-center gap-2">
        <Icon className="h-5 w-5 text-brand-600" />
        <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">{title}</h2>
      </div>
      {hint && <p className="mb-4 text-sm text-sage-500 dark:text-sage-400">{hint}</p>}
      <div className={hint ? "" : "mt-4"}>{children}</div>
    </div>
  );
}

const fmtDate = (d) => (d ? new Date(d).toLocaleString() : "—");

export default function Profile() {
  const { user, reload, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.full_name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameErr, setNameErr] = useState("");

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  const saveName = async (e) => {
    e.preventDefault();
    setSavingName(true); setNameErr(""); setNameSaved(false);
    try {
      await api("/api/me", { method: "PATCH", body: { full_name: name.trim() } });
      await reload();
      setNameSaved(true); setTimeout(() => setNameSaved(false), 2500);
    } catch (e) { setNameErr(e.message); } finally { setSavingName(false); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwErr(""); setPwMsg("");
    if (pw.next !== pw.confirm) { setPwErr("New passwords don't match."); return; }
    setPwBusy(true);
    try {
      const r = await api("/api/me/password", { method: "POST", body: { current_password: pw.current, new_password: pw.next } });
      if (r.token) setToken(r.token); // keep this device signed in
      setPw({ current: "", next: "", confirm: "" });
      setPwMsg("Password updated. Other devices have been signed out.");
      setTimeout(() => setPwMsg(""), 4000);
    } catch (e) { setPwErr(e.message); } finally { setPwBusy(false); }
  };

  const logoutAll = async () => {
    try { await api("/api/auth/logout-all", { method: "POST" }); } catch (_) {}
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-100 text-2xl font-semibold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
          {(user?.full_name || "?").charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">{user?.full_name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-sage-500 dark:text-sage-400">
            <span className="chip bg-sage-100 capitalize dark:bg-sage-800">{user?.role}</span>
            <span className="flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" /> {user?.branch_name || "Main"}</span>
            {user?.totp_enabled && <span className="chip bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"><ShieldCheck className="h-3 w-3" /> 2FA on</span>}
          </div>
        </div>
      </div>

      {/* Account */}
      <Section icon={UserCircle} title="Account">
        <form onSubmit={saveName} className="space-y-4">
          <div>
            <label className="label">Full name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Email</label>
              <div className="input flex items-center gap-2 !bg-sage-50 text-sage-500 dark:!bg-sage-900"><Mail className="h-4 w-4" /> {user?.email}</div>
            </div>
            <div>
              <label className="label">Role</label>
              <div className="input flex items-center gap-2 !bg-sage-50 capitalize text-sage-500 dark:!bg-sage-900"><Shield className="h-4 w-4" /> {user?.role}</div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-sage-400">
            <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Last sign-in: {fmtDate(user?.last_login_at)}</span>
          </div>
          {nameErr && <div className="text-sm text-rose-600 dark:text-rose-400">{nameErr}</div>}
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={savingName}>
              {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </button>
            {nameSaved && <span className="flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400"><CheckCircle2 className="h-4 w-4" /> Saved</span>}
          </div>
        </form>
      </Section>

      {/* Password */}
      <Section icon={KeyRound} title="Password" hint="Changing your password signs you out on all other devices.">
        <form onSubmit={changePassword} className="space-y-4">
          <div>
            <label className="label">Current password</label>
            <input type="password" className="input max-w-sm" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">New password</label>
              <input type="password" className="input" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} minLength={8} placeholder="Min 8 chars, letters & numbers" autoComplete="new-password" required />
            </div>
            <div>
              <label className="label">Confirm new password</label>
              <input type="password" className="input" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" required />
            </div>
          </div>
          {pwErr && <div className="text-sm text-rose-600 dark:text-rose-400">{pwErr}</div>}
          {pwMsg && <div className="flex items-center gap-1.5 text-sm font-medium text-brand-600 dark:text-brand-400"><CheckCircle2 className="h-4 w-4" /> {pwMsg}</div>}
          <button type="submit" className="btn-primary" disabled={pwBusy}>
            {pwBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Update password
          </button>
        </form>
      </Section>

      {/* Two-factor */}
      <Section icon={ShieldCheck} title="Two-factor authentication" hint="Add a one-time code from an authenticator app at sign-in.">
        <TwoFactorPanel />
      </Section>

      {/* Sessions */}
      <Section icon={MonitorSmartphone} title="Sessions" hint="Sign out everywhere if you've used a shared or lost device.">
        <button className="btn-outline text-rose-600" onClick={logoutAll}>
          <Power className="h-4 w-4" /> Log out all devices
        </button>
      </Section>

      {/* Preferences */}
      <Section icon={theme === "dark" ? Moon : Sun} title="Preferences">
        <button className="btn-outline" onClick={toggle}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} Switch to {theme === "dark" ? "light" : "dark"} mode
        </button>
      </Section>
    </div>
  );
}
