import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../lib/theme.js";
import { Pill, Plus, Moon, Sun, Loader2, ShieldCheck, Leaf, Boxes } from "lucide-react";

export default function Login() {
  const { login, verify2fa } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@remedy.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState(null); // set once password ok but 2FA needed
  const [code, setCode] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (ticket) {
        await verify2fa(ticket, code.trim());
        navigate("/", { replace: true });
      } else {
        const r = await login(email.trim(), password);
        if (r && r.require_2fa) { setTicket(r.ticket); setCode(""); }
        else navigate("/", { replace: true });
      }
    } catch (err) {
      setError(err.message || "Unable to sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-brand-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(52,211,153,0.25),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(5,150,105,0.35),transparent_50%)]" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12 text-brand-50">
          <div className="flex items-center gap-2.5">
            <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <Pill className="h-5 w-5" />
              <Plus className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-brand-400 p-0.5 text-brand-900" />
            </span>
            <span className="font-display text-2xl font-semibold tracking-tight">Remedy</span>
          </div>

          <div className="max-w-md">
            <h1 className="font-display text-4xl font-semibold leading-tight">
              The calm, modern way to run your pharmacy.
            </h1>
            <p className="mt-4 text-brand-100/80">
              Inventory, point-of-sale, and reporting in one clean workspace — built for
              independent and community pharmacies.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-brand-100/90">
              <li className="flex items-center gap-3">
                <Boxes className="h-5 w-5 text-brand-300" /> FEFO batch & expiry tracking
              </li>
              <li className="flex items-center gap-3">
                <Leaf className="h-5 w-5 text-brand-300" /> Modular — turn on only what you need
              </li>
              <li className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-brand-300" /> Controlled-drug ready
              </li>
            </ul>
          </div>

          <p className="text-xs text-brand-200/60">
            © {new Date().getFullYear()} Banoyah Technologies · Remedy
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center bg-sage-50 p-6 dark:bg-sage-950">
        <button
          onClick={toggle}
          className="btn-ghost absolute right-5 top-5 !px-2.5 !py-2"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2.5 text-brand-700 dark:text-brand-400">
              <Pill className="h-7 w-7" />
              <span className="font-display text-2xl font-semibold">Remedy</span>
            </div>
          </div>

          <h2 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">
            Welcome back
          </h2>
          <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">
            Sign in to your pharmacy workspace.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {!ticket ? (
              <>
                <div>
                  <label className="label" htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    className="input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    className="input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="label" htmlFor="code">Authentication code</label>
                <input
                  id="code"
                  className="input text-center text-lg tracking-[0.3em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
                <p className="mt-1.5 text-xs text-sage-400">Enter the 6-digit code from your authenticator app, or a backup code.</p>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? (ticket ? "Verifying…" : "Signing in…") : (ticket ? "Verify" : "Sign in")}
            </button>
            {ticket && (
              <button type="button" className="btn-ghost w-full text-sm" onClick={() => { setTicket(null); setCode(""); setError(""); }}>
                Back to sign in
              </button>
            )}
          </form>

          <p className="mt-6 text-center text-xs text-sage-400 dark:text-sage-500">
            Demo · admin@remedy.local / admin123
          </p>
        </div>
      </div>
    </div>
  );
}
