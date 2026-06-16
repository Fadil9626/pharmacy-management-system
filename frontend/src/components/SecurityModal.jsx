import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { X, ShieldCheck, ShieldOff, Loader2, Copy, Check, KeyRound } from "lucide-react";

export default function SecurityModal({ onClose }) {
  const { user, reload } = useAuth();
  const enabled = !!user?.totp_enabled;
  const [mode, setMode] = useState("view"); // view | setup | backup | disable
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const beginSetup = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api("/api/auth/2fa/setup", { method: "POST" });
      setSecret(r.secret);
      setQr(await QRCode.toDataURL(r.otpauth_url, { margin: 1, width: 200 }));
      setMode("setup");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const confirmEnable = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api("/api/auth/2fa/enable", { method: "POST", body: { code: code.trim() } });
      setBackup(r.backup_codes || []);
      setCode("");
      setMode("backup");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const confirmDisable = async () => {
    setBusy(true); setErr("");
    try {
      await api("/api/auth/2fa/disable", { method: "POST", body: { code: code.trim() } });
      await reload();
      onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const finishBackup = async () => { await reload(); onClose(); };

  const copyBackup = () => {
    navigator.clipboard?.writeText(backup.join("\n")).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-md p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-sage-900 dark:text-sage-50">
            <ShieldCheck className="h-5 w-5 text-brand-600" /> Two-factor authentication
          </h3>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2"><X className="h-5 w-5" /></button>
        </div>

        {mode === "view" && (
          <div className="space-y-4">
            <div className={`rounded-xl border p-3 text-sm ${enabled ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900/50 dark:bg-brand-900/20 dark:text-brand-300" : "border-sage-200 text-sage-600 dark:border-sage-800 dark:text-sage-300"}`}>
              {enabled ? "Two-factor is ON — a code from your authenticator app is required at sign-in." : "Two-factor is OFF. Add a second step at sign-in with an authenticator app."}
            </div>
            {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
            {enabled ? (
              <button className="btn-outline w-full text-rose-600" onClick={() => { setMode("disable"); setErr(""); }}>
                <ShieldOff className="h-4 w-4" /> Turn off two-factor
              </button>
            ) : (
              <button className="btn-primary w-full" onClick={beginSetup} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Enable two-factor
              </button>
            )}
          </div>
        )}

        {mode === "setup" && (
          <div className="space-y-4">
            <p className="text-sm text-sage-500 dark:text-sage-400">Scan this with Google Authenticator, Authy, or any TOTP app — then enter the 6-digit code it shows.</p>
            {qr && <img src={qr} alt="QR code" className="mx-auto rounded-lg border border-sage-200 bg-white p-2 dark:border-sage-800" />}
            <div className="rounded-lg bg-sage-50 px-3 py-2 text-center text-xs tracking-wider text-sage-500 dark:bg-sage-900 dark:text-sage-400">
              Can't scan? Enter this key: <b className="text-sage-700 dark:text-sage-200">{secret}</b>
            </div>
            <input className="input text-center text-lg tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" autoFocus />
            {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
            <div className="flex gap-2">
              <button className="btn-outline flex-1" onClick={() => setMode("view")}>Cancel</button>
              <button className="btn-primary flex-1" onClick={confirmEnable} disabled={busy || code.trim().length < 6}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Verify & enable
              </button>
            </div>
          </div>
        )}

        {mode === "backup" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-brand-600 dark:text-brand-400"><Check className="h-4 w-4" /> Two-factor is now on.</div>
            <p className="text-sm text-sage-500 dark:text-sage-400">Save these <b>backup codes</b> somewhere safe — each works once if you lose your phone.</p>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-sage-50 p-3 font-mono text-sm text-sage-700 dark:bg-sage-900 dark:text-sage-200">
              {backup.map((c) => <div key={c} className="text-center">{c}</div>)}
            </div>
            <div className="flex gap-2">
              <button className="btn-outline flex-1" onClick={copyBackup}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy codes"}</button>
              <button className="btn-primary flex-1" onClick={finishBackup}>Done</button>
            </div>
          </div>
        )}

        {mode === "disable" && (
          <div className="space-y-4">
            <p className="text-sm text-sage-500 dark:text-sage-400">Enter a current code (or a backup code) to turn two-factor off.</p>
            <input className="input text-center text-lg tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoFocus />
            {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
            <div className="flex gap-2">
              <button className="btn-outline flex-1" onClick={() => setMode("view")}>Cancel</button>
              <button className="btn-primary flex-1 !bg-rose-600 hover:!bg-rose-700" onClick={confirmDisable} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />} Turn off
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
