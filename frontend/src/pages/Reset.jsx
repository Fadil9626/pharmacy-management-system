import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { Pill, Plus, Loader2, CheckCircle2, KeyRound } from "lucide-react";

export default function Reset() {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (pw !== confirm) { setErr("Passwords don't match."); return; }
    setBusy(true);
    try {
      await api("/api/auth/reset", { method: "POST", body: { token, new_password: pw } });
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 2200);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-sage-50 p-4 dark:bg-sage-950">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-brand-50">
            <Pill className="h-5 w-5" />
            <Plus className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-brand-400 p-0.5 text-brand-900" />
          </span>
          <span className="font-display text-xl font-semibold text-sage-900 dark:text-sage-50">Remedy</span>
        </div>

        {!token ? (
          <p className="text-sm text-rose-600 dark:text-rose-400">This reset link is missing its token. Ask your manager to send a new one.</p>
        ) : done ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-brand-500" />
            <p className="font-medium text-sage-800 dark:text-sage-100">Password set. Taking you to sign in…</p>
          </div>
        ) : (
          <>
            <h1 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Set a new password</h1>
            <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">Choose a password you'll remember.</p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="label">New password</label>
                <input type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} placeholder="Min 8 chars, letters & numbers" autoFocus autoComplete="new-password" required />
              </div>
              <div>
                <label className="label">Confirm password</label>
                <input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
              </div>
              {err && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">{err}</div>}
              <button type="submit" className="btn-primary w-full" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Set password
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
