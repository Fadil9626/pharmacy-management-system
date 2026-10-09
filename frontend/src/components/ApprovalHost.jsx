import { useEffect, useRef, useState } from "react";
import { setApprovalPrompt } from "../lib/api.js";
import { ShieldCheck } from "lucide-react";

/**
 * The manager-approval dialog. Mounted once in the layout; lib/api.js opens it
 * when the server says an action needs a second person, and resends the request
 * with what is entered here. The approver's password goes with that one request
 * and is not kept.
 */
export default function ApprovalHost() {
  const [ask, setAsk] = useState(null);          // { message, retry }
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const resolver = useRef(null);

  useEffect(() => {
    setApprovalPrompt((req) => new Promise((resolve) => {
      resolver.current = resolve;
      setPassword("");
      setAsk(req);
    }));
    return () => setApprovalPrompt(null);
  }, []);

  if (!ask) return null;
  const finish = (value) => {
    const r = resolver.current;
    resolver.current = null;
    setAsk(null);
    r && r(value);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-sage-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="approval-title">
      <form
        className="card w-full max-w-sm space-y-4 p-5"
        onSubmit={(e) => { e.preventDefault(); if (email && password) finish({ email, password }); }}
      >
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <h2 id="approval-title" className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Manager approval</h2>
            <p className={`text-sm ${ask.retry ? "text-rose-600 dark:text-rose-400" : "text-sage-500 dark:text-sage-400"}`}>{ask.message}</p>
          </div>
        </div>
        <p className="text-xs text-sage-400">A manager or owner signs in here to approve. It isn't the person asking, and it doesn't sign you out.</p>
        <div>
          <label className="label" htmlFor="approver-email">Approver's email</label>
          <input id="approver-email" type="email" className="input" autoFocus autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="approver-password">Approver's password</label>
          <input id="approver-password" type="password" className="input" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={() => finish(null)}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!email || !password}>
            <ShieldCheck className="h-4 w-4" /> Approve
          </button>
        </div>
      </form>
    </div>
  );
}
