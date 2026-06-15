import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { money } from "../lib/money.js";
import {
  THEME_PRESETS, CUSTOM_FIELDS, applyThemeConfig, legacyConfig, presetByKey, fileToLogo,
} from "../lib/branding.js";
import {
  Loader2, Save, Store, Coins, Percent, ReceiptText, CheckCircle2,
  Boxes, Star, Blocks, Lock, Globe, Mail, Phone, MapPin,
  Palette, ImagePlus, Trash2, Check,
} from "lucide-react";

const FIELD_FALLBACK = {
  primary: "#059669", secondary: "#14b8a6", sidebar_bg: "#ffffff",
  sidebar_text: "#2d352a", topbar_bg: "#ffffff", topbar_text: "#111827",
};

const CURRENCIES = [
  { code: "USD", symbol: "$" }, { code: "SLE", symbol: "Le" }, { code: "NGN", symbol: "₦" },
  { code: "GHS", symbol: "₵" }, { code: "KES", symbol: "KSh" }, { code: "GBP", symbol: "£" },
  { code: "EUR", symbol: "€" },
];

const TABS = [
  { key: "business", label: "Business", icon: Store },
  { key: "appearance", label: "Appearance", icon: Palette },
  { key: "currency", label: "Currency", icon: Coins },
  { key: "sales", label: "Sales & Tax", icon: Percent },
  { key: "inventory", label: "Inventory", icon: Boxes },
  { key: "receipt", label: "Receipt", icon: ReceiptText },
  { key: "modules", label: "Modules", icon: Blocks },
];

// human label for a module key
const MOD_LABEL = (k) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function Settings() {
  const { settings, applySettings, hasRole, modules } = useAuth();
  const [tab, setTab] = useState("business");
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const canEdit = hasRole("owner", "manager");

  useEffect(() => {
    if (settings) setF({ ...settings });
    else api("/api/settings").then((s) => setF({ ...s })).catch((e) => setErr(e.message));
  }, [settings]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const pickCurrency = (c) => setF({ ...f, currency_code: c.code, currency_symbol: c.symbol });

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true); setErr(""); setSaved(false);
    try {
      const updated = await api("/api/settings", { method: "PUT", body: f });
      applySettings(updated);
      setF({ ...updated });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!f) return <div className="flex h-40 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">Settings</h1>
        <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">Configure and customise how Remedy runs your pharmacy.</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-sage-200 bg-white p-1 dark:border-sage-800 dark:bg-sage-900">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
              tab === t.key ? "bg-brand-600 text-white shadow-soft"
                : "text-sage-500 hover:bg-sage-100 dark:text-sage-300 dark:hover:bg-sage-800"}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {!canEdit && tab !== "modules" && (
        <div className="card flex items-center gap-2 p-3 text-sm text-sage-500 dark:text-sage-400">
          <Lock className="h-4 w-4" /> Only owners and managers can change settings.
        </div>
      )}

      <form onSubmit={save} className="space-y-5">
        {tab === "business" && (
          <Section icon={Store} title="Business profile" hint="Shown on receipts, the sidebar and reports.">
            <LogoUpload value={f.logo} name={f.pharmacy_name} disabled={!canEdit}
              onChange={(logo) => setF({ ...f, logo })} onError={setErr} />
            <Field label="Pharmacy name">
              <input className="input" value={f.pharmacy_name || ""} onChange={set("pharmacy_name")} disabled={!canEdit} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone" icon={Phone}><input className="input" value={f.phone || ""} onChange={set("phone")} disabled={!canEdit} /></Field>
              <Field label="Email" icon={Mail}><input className="input" value={f.email || ""} onChange={set("email")} disabled={!canEdit} /></Field>
              <Field label="Website" icon={Globe}><input className="input" value={f.website || ""} onChange={set("website")} disabled={!canEdit} /></Field>
              <Field label="Address" icon={MapPin}><input className="input" value={f.address || ""} onChange={set("address")} disabled={!canEdit} /></Field>
            </div>
          </Section>
        )}

        {tab === "appearance" && (
          <AppearanceTab f={f} setF={setF} canEdit={canEdit} />
        )}

        {tab === "currency" && (
          <Section icon={Coins} title="Currency" hint="The ledger currency for all amounts.">
            <div className="flex flex-wrap gap-2">
              {CURRENCIES.map((c) => (
                <button key={c.code} type="button" disabled={!canEdit} onClick={() => pickCurrency(c)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    f.currency_code === c.code ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                      : "border-sage-200 text-sage-600 hover:bg-sage-50 dark:border-sage-700 dark:text-sage-300 dark:hover:bg-sage-800"}`}>
                  {c.symbol} {c.code}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Code"><input className="input" value={f.currency_code || ""} onChange={set("currency_code")} disabled={!canEdit} /></Field>
              <Field label="Symbol"><input className="input" value={f.currency_symbol || ""} onChange={set("currency_symbol")} disabled={!canEdit} /></Field>
            </div>
            <p className="text-xs text-sage-400">Open-market FX pricing is managed under <b>Market Pricing</b> (when licensed).</p>
          </Section>
        )}

        {tab === "sales" && (
          <>
            <Section icon={Percent} title="Tax" hint="Applied to every sale after discount.">
              <Field label="Sales tax / VAT (%)">
                <input type="number" min="0" max="100" step="0.01" className="input sm:w-40" value={f.tax_percent ?? 0} onChange={set("tax_percent")} disabled={!canEdit} />
              </Field>
              <p className="text-xs text-sage-400">Set 0 to disable tax.</p>
            </Section>
            <Section icon={Star} title="Loyalty" hint="Points earned and redeemed by registered customers.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={`Points earned per ${f.currency_symbol || "$"}1`}>
                  <input type="number" min="0" step="0.01" className="input" value={f.loyalty_points_per_unit ?? 1} onChange={set("loyalty_points_per_unit")} disabled={!canEdit} />
                </Field>
                <Field label={`Value of 1 point when redeemed (${f.currency_symbol || "$"})`}>
                  <input type="number" min="0" step="0.0001" className="input" value={f.loyalty_redeem_value ?? 0} onChange={set("loyalty_redeem_value")} disabled={!canEdit} />
                </Field>
              </div>
              <p className="text-xs text-sage-400">Earn: 1 = a {money(100)} sale earns 100 points (0 = off). Redeem: e.g. 0.01 means 100 points = {money(1)} at the till (0 = redemption off).</p>
            </Section>
          </>
        )}

        {tab === "inventory" && (
          <Section icon={Boxes} title="Inventory rules" hint="Drives stock alerts across the system.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Near-expiry window (months)">
                <input type="number" min="1" max="36" className="input" value={f.near_expiry_months ?? 3} onChange={set("near_expiry_months")} disabled={!canEdit} />
              </Field>
              <Field label="Default reorder level">
                <input type="number" min="0" className="input" value={f.low_stock_default ?? 10} onChange={set("low_stock_default")} disabled={!canEdit} />
              </Field>
            </div>
            <p className="text-xs text-sage-400">
              Batches expiring within the window are flagged on the dashboard, inventory and reports. New products start at the default reorder level.
            </p>
          </Section>
        )}

        {tab === "receipt" && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Section icon={ReceiptText} title="Receipt">
              <Field label="Header (under the name)">
                <textarea className="input min-h-[64px]" value={f.receipt_header || ""} onChange={set("receipt_header")} disabled={!canEdit} placeholder="e.g. Reg. No. 12345 · NAFDAC licensed" />
              </Field>
              <Field label="Footer message">
                <textarea className="input min-h-[64px]" value={f.receipt_footer || ""} onChange={set("receipt_footer")} disabled={!canEdit} />
              </Field>
            </Section>
            <ReceiptPreview f={f} />
          </div>
        )}

        {tab === "modules" && <ModulesPanel modules={modules} />}

        {err && <div className="card border-rose-200 p-3 text-sm text-rose-600 dark:border-rose-900/50 dark:text-rose-300">{err}</div>}

        {canEdit && tab !== "modules" && (
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
            </button>
            {saved && <span className="flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400"><CheckCircle2 className="h-4 w-4" /> Saved</span>}
          </div>
        )}
      </form>
    </div>
  );
}

function ReceiptPreview({ f }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-sage-400">Preview</div>
      <div className="mx-auto max-w-[280px] rounded-xl border border-dashed border-sage-300 bg-white p-5 text-center text-sm shadow-soft dark:border-sage-700 dark:bg-sage-950">
        {f.logo && <img src={f.logo} alt="" className="mx-auto mb-2 h-12 w-12 object-contain" />}
        <div className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">{f.pharmacy_name || "Remedy Pharmacy"}</div>
        {f.address && <div className="text-xs text-sage-400">{f.address}</div>}
        {f.phone && <div className="text-xs text-sage-400">{f.phone}</div>}
        {f.receipt_header && <div className="mt-1 whitespace-pre-line text-xs text-sage-500 dark:text-sage-400">{f.receipt_header}</div>}
        <div className="my-3 border-t border-dashed border-sage-300 dark:border-sage-700" />
        <div className="flex justify-between text-xs text-sage-600 dark:text-sage-300"><span>Paracetamol ×2</span><span>{f.currency_symbol || "$"}20.00</span></div>
        <div className="my-3 border-t border-dashed border-sage-300 dark:border-sage-700" />
        <div className="flex justify-between font-semibold text-sage-900 dark:text-sage-50"><span>Total</span><span>{f.currency_symbol || "$"}20.00</span></div>
        <div className="mt-3 whitespace-pre-line text-xs text-sage-400">{f.receipt_footer || "Thank you — get well soon."}</div>
      </div>
    </div>
  );
}

function ModulesPanel({ modules }) {
  const sorted = useMemo(() => [...(modules || [])].sort((a, b) => a.sort_order - b.sort_order), [modules]);
  return (
    <Section icon={Blocks} title="Modules" hint="What's switched on for this pharmacy.">
      <p className="text-sm text-sage-500 dark:text-sage-400">
        Modules are licensed centrally from the Control Center. This is a read-only view of your current plan.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {sorted.map((m) => (
          <div key={m.module_key} className="flex items-center justify-between rounded-xl border border-sage-200 px-3.5 py-2.5 dark:border-sage-800">
            <span className="text-sm font-medium text-sage-800 dark:text-sage-100">{m.display_name || MOD_LABEL(m.module_key)}</span>
            {m.is_enabled
              ? <span className="chip bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">On</span>
              : <span className="chip bg-sage-100 text-sage-400 dark:bg-sage-800 dark:text-sage-500">Off</span>}
          </div>
        ))}
      </div>
    </Section>
  );
}

function AppearanceTab({ f, setF, canEdit }) {
  const cfg = f.theme_config || legacyConfig(f);
  const apply = (next) => { setF({ ...f, theme_config: next }); applyThemeConfig(next); };
  const pickPreset = (p) => apply({
    preset: p.key, primary: p.primary, secondary: p.secondary,
    sidebar_bg: p.sidebar_bg, sidebar_text: p.sidebar_text, topbar_bg: p.topbar_bg, topbar_text: p.topbar_text,
  });
  const setColor = (field, value) => apply({ ...cfg, preset: null, [field]: value });

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <Section icon={Palette} title="Quick themes" hint="Choose a preset or customise every colour below.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {THEME_PRESETS.map((p) => (
              <PresetCard key={p.key} preset={p} active={cfg.preset === p.key}
                disabled={!canEdit} onClick={() => pickPreset(p)} />
            ))}
          </div>
        </Section>

        <Section icon={Palette} title="Custom colors" hint="Fine-tune any colour — overrides the preset.">
          <div className="space-y-2">
            {CUSTOM_FIELDS.map((field) => {
              const val = cfg[field.key] || FIELD_FALLBACK[field.key];
              return (
                <div key={field.key} className="flex items-center justify-between gap-3 rounded-xl border border-sage-200 px-4 py-3 dark:border-sage-800">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-sage-900 dark:text-sage-50">{field.label}</div>
                    <div className="text-xs text-sage-400">{field.hint}</div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs uppercase text-sage-400">{val}</span>
                    <label className="relative h-9 w-9 cursor-pointer overflow-hidden rounded-lg border border-sage-300 dark:border-sage-600" style={{ background: val }}>
                      <input type="color" disabled={!canEdit} value={val}
                        onChange={(e) => setColor(field.key, e.target.value)}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-sage-400">Live preview</div>
        <LivePreview cfg={cfg} name={f.pharmacy_name} logo={f.logo} />
      </div>
    </div>
  );
}

// Mini app mock for a preset card
function PresetCard({ preset, active, disabled, onClick }) {
  const sb = preset.sidebar_bg || "#ffffff";
  const sbt = preset.sidebar_text || "#475569";
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`overflow-hidden rounded-xl border text-left transition ${
        active ? "border-brand-500 ring-2 ring-brand-500/40" : "border-sage-200 hover:border-sage-300 dark:border-sage-700"}`}>
      <div className="relative flex h-20 bg-white dark:bg-sage-950">
        <div className="flex w-9 flex-col gap-1 p-1.5" style={{ background: sb }}>
          <span className="h-2.5 w-2.5 rounded" style={{ background: preset.primary }} />
          <span className="h-1 w-full rounded" style={{ background: sbt, opacity: 0.5 }} />
          <span className="h-1 w-4/5 rounded" style={{ background: sbt, opacity: 0.35 }} />
        </div>
        <div className="flex-1 space-y-1 p-2">
          <span className="block h-1.5 w-1/2 rounded bg-sage-200 dark:bg-sage-700" />
          <span className="block h-1.5 w-3/4 rounded bg-sage-100 dark:bg-sage-800" />
          <div className="flex gap-1 pt-1.5">
            <span className="h-3 w-9 rounded" style={{ background: preset.primary }} />
            <span className="h-3 w-7 rounded" style={{ background: preset.secondary, opacity: 0.85 }} />
          </div>
        </div>
        {active && (
          <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full text-white" style={{ background: preset.primary }}>
            <Check className="h-3 w-3" />
          </span>
        )}
      </div>
      <div className="px-2.5 py-1.5 text-xs font-medium text-sage-700 dark:text-sage-200">{preset.name}</div>
    </button>
  );
}

function LivePreview({ cfg, name, logo }) {
  const c = (k) => cfg[k] || FIELD_FALLBACK[k];
  const sb = c("sidebar_bg"), sbt = c("sidebar_text"), tb = c("topbar_bg"), tbt = c("topbar_text"), pri = c("primary"), sec = c("secondary");
  const navItem = (label, on) => (
    <div className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium" style={on ? { background: pri, color: "#fff" } : { color: sbt, opacity: 0.7 }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "#fff" : sbt }} /> {label}
    </div>
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-sage-200 shadow-soft dark:border-sage-800">
      <div className="flex h-[300px] bg-sage-50 dark:bg-sage-950">
        {/* sidebar */}
        <div className="flex w-24 flex-col gap-1 p-2" style={{ background: sb }}>
          <div className="mb-1 flex items-center gap-1.5 px-1">
            {logo ? <img src={logo} alt="" className="h-4 w-4 rounded object-contain" />
              : <span className="h-4 w-4 rounded" style={{ background: pri }} />}
            <span className="truncate text-[10px] font-semibold" style={{ color: sbt }}>{name || "Remedy"}</span>
          </div>
          {navItem("Dashboard", true)}
          {navItem("Inventory")}
          {navItem("Point of Sale")}
          {navItem("Reports")}
        </div>
        {/* content */}
        <div className="flex flex-1 flex-col">
          <div className="flex h-9 items-center px-3 text-[11px] font-semibold" style={{ background: tb, color: tbt }}>Good morning, Admin</div>
          <div className="grid flex-1 grid-cols-2 gap-2 p-3">
            {[["Sales", "1,240"], ["Items", "318"], ["Low stock", "6"], ["Customers", "92"]].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-sage-200 bg-white p-2 dark:border-sage-700 dark:bg-sage-900">
                <div className="text-[9px] text-sage-400">{k}</div>
                <div className="text-sm font-semibold text-sage-900 dark:text-sage-50">{v}</div>
              </div>
            ))}
            <div className="col-span-2 flex gap-2">
              <span className="rounded-md px-3 py-1.5 text-[10px] font-semibold text-white" style={{ background: pri }}>Primary</span>
              <span className="rounded-md px-3 py-1.5 text-[10px] font-semibold text-white" style={{ background: sec }}>Secondary</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogoUpload({ value, name, disabled, onChange, onError }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try { onChange(await fileToLogo(file)); onError?.(""); }
    catch (err) { onError?.(err.message); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <label className="label">Logo</label>
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border border-sage-200 bg-sage-50 dark:border-sage-700 dark:bg-sage-950">
          {value
            ? <img src={value} alt="" className="h-full w-full object-contain" />
            : <span className="text-lg font-semibold text-brand-600">{(name || "R").charAt(0).toUpperCase()}</span>}
        </div>
        {!disabled && (
          <div className="flex gap-2">
            <button type="button" className="btn-outline" onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} {value ? "Replace" : "Upload"}
            </button>
            {value && (
              <button type="button" className="btn-ghost text-sage-400 hover:text-rose-500" onClick={() => onChange("")}>
                <Trash2 className="h-4 w-4" /> Remove
              </button>
            )}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={pick} />
          </div>
        )}
      </div>
      <p className="mt-1.5 text-xs text-sage-400">PNG or JPG. It's resized automatically and shown in the sidebar and on receipts.</p>
    </div>
  );
}

function Section({ icon: Icon, title, hint, children }) {
  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-brand-600" />
        <h2 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">{title}</h2>
      </div>
      {hint && <p className="-mt-2 text-sm text-sage-400">{hint}</p>}
      {children}
    </div>
  );
}

function Field({ label, icon: Icon, children }) {
  return (
    <div>
      <label className="label flex items-center gap-1.5">{Icon && <Icon className="h-3.5 w-3.5 text-sage-400" />}{label}</label>
      {children}
    </div>
  );
}
