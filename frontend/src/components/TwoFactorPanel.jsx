import { useState } from "react";
import QRCode from "qrcode";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { ShieldCheck, ShieldOff, Loader2, Copy, Check } from "lucide-react";

// Inline two-factor management (used on the Profile page).
export default function TwoFactorPanel() {
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
      setBackup(r.backup_codes || []); setCode(""); setMode("backup");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const confirmDisable = async () => {
    setBusy(true); setErr("");
    try {
      await api("/api/auth/2fa/disable", { method: "POST", body: { code: code.trim() } });
      await reload(); setMode("view"); setCode("");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const finishBackup = async () => { await reload(); setMode("view"); };
  const copyBackup = () => navigator.clipboard?.writeText(backup.join("\n")).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});

  return (
    <div className="space-y-4">
      {mode === "view" && (
        <>
          <div className={`flex items-center gap-2 text-sm font-medium ${enabled ? "text-brand-600 dark:text-brand-400" : "text-sage-500 dark:text-sage-400"}`}>
            {enabled ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
            {enabled ? "Two-factor is on — a code is required at sign-in." : "Two-factor is off."}
          </div>
          {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
          {enabled
            ? <button className="btn-outline text-rose-600" onClick={() => { setMode("disable"); setErr(""); }}><ShieldOff className="h-4 w-4" /> Turn off two-factor</button>
            : <button className="btn-primary" onClick={beginSetup} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Enable two-factor</button>}
        </>
      )}

      {mode === "setup" && (
        <div className="space-y-3">
          <p className="text-sm text-sage-500 dark:text-sage-400">Scan with Google Authenticator / Authy, then enter the 6-digit code.</p>
          {qr && <img src={qr} alt="QR" className="rounded-lg border border-sage-200 bg-white p-2 dark:border-sage-800" />}
          <div className="rounded-lg bg-sage-50 px-3 py-2 text-xs text-sage-500 dark:bg-sage-900 dark:text-sage-400">Manual key: <b className="text-sage-700 dark:text-sage-200">{secret}</b></div>
          <input className="input max-w-[220px] text-center text-lg tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" autoFocus />
          {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => setMode("view")}>Cancel</button>
            <button className="btn-primary" onClick={confirmEnable} disabled={busy || code.trim().length < 6}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Verify & enable</button>
          </div>
        </div>
      )}

      {mode === "backup" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-brand-600 dark:text-brand-400"><Check className="h-4 w-4" /> Two-factor is on. Save these backup codes.</div>
          <div className="grid max-w-sm grid-cols-2 gap-2 rounded-xl bg-sage-50 p-3 font-mono text-sm text-sage-700 dark:bg-sage-900 dark:text-sage-200">
            {backup.map((c) => <div key={c} className="text-center">{c}</div>)}
          </div>
          <div className="flex gap-2">
            <button className="btn-outline" onClick={copyBackup}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}</button>
            <button className="btn-primary" onClick={finishBackup}>Done</button>
          </div>
        </div>
      )}

      {mode === "disable" && (
        <div className="space-y-3">
          <p className="text-sm text-sage-500 dark:text-sage-400">Enter a current or backup code to turn two-factor off.</p>
          <input className="input max-w-[220px] text-center text-lg tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoFocus />
          {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => setMode("view")}>Cancel</button>
            <button className="btn-primary !bg-rose-600 hover:!bg-rose-700" onClick={confirmDisable} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />} Turn off</button>
          </div>
        </div>
      )}
    </div>
  );
}
