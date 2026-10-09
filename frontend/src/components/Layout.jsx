import { Fragment, Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../lib/theme.js";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { Loader2 } from "lucide-react";
import { api, getActiveBranch, setActiveBranch } from "../lib/api.js";
import ApprovalHost from "./ApprovalHost.jsx";
import {
  Pill, Plus, LayoutDashboard, Boxes, ShoppingCart, Receipt, Truck, FileText,
  Users, ClipboardList, ShieldAlert, Wallet, GitBranch, Moon, Sun,
  LogOut, Menu, X, Settings as SettingsIcon, UserCog, TrendingUp, PanelLeft,
  ShieldCheck, ChevronDown, Tag, Bell, PackageX, CalendarClock, RefreshCw,
} from "lucide-react";

// nav item → required module key (null = always visible). "soon" items render disabled.
// `roles` limits visibility to certain roles (admin sections).
const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, module: null, end: true },
  { to: "/inventory", label: "Inventory", icon: Boxes, module: "inventory", roles: ["owner", "manager", "pharmacist"] },
  { to: "/pos", label: "Point of Sale", icon: ShoppingCart, module: "pos" },
  { to: "/sales", label: "Sales", icon: Receipt, module: "pos" },
  { to: "/promotions", label: "Promotions", icon: Tag, module: "pos", roles: ["owner", "manager"] },
  { to: "/purchasing", label: "Purchasing", icon: Truck, module: "purchasing", roles: ["owner", "manager", "pharmacist"] },
  { to: "/pricing", label: "Market Pricing", icon: TrendingUp, module: "market_pricing", roles: ["owner", "manager"] },
  { to: "/prescriptions", label: "Prescriptions", icon: ClipboardList, module: "prescriptions", roles: ["owner", "manager", "pharmacist"] },
  { to: "/customers", label: "Customers", icon: Users, module: "customers", roles: ["owner", "manager", "pharmacist"] },
  { to: "/controlled", label: "Controlled Drugs", icon: ShieldAlert, module: "controlled_drugs", roles: ["owner", "manager", "pharmacist"] },
  { to: "/finance", label: "Finance", icon: Wallet, module: "finance", roles: ["owner", "manager"] },
  { to: "/reports", label: "Reports", icon: FileText, module: "reports", roles: ["owner", "manager"] },
  { to: "/branches", label: "Branches", icon: GitBranch, module: "branches", roles: ["owner", "manager"] },
  { to: "/staff", label: "Staff", icon: UserCog, module: null, roles: ["owner", "manager"], divider: true },
  { to: "/settings", label: "Settings", icon: SettingsIcon, module: null, roles: ["owner", "manager"] },
];

function BranchSwitcher() {
  const [branches, setBranches] = useState([]);
  const [val, setVal] = useState(getActiveBranch() || "");
  useEffect(() => { api("/api/branches").then((b) => setBranches(b.filter((x) => x.is_active))).catch(() => {}); }, []);
  const onChange = (e) => {
    setVal(e.target.value);
    setActiveBranch(e.target.value || null);
    window.location.reload(); // refresh all views under the new branch lens
  };
  if (branches.length <= 1) return null;
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-sage-200 bg-white px-2 py-1.5 dark:border-sage-800 dark:bg-sage-900">
      <GitBranch className="h-4 w-4 text-brand-600" />
      <select
        value={val}
        onChange={onChange}
        className="cursor-pointer bg-white text-sm font-medium text-sage-800 focus:outline-none dark:bg-sage-900 dark:text-sage-100 [color-scheme:light] dark:[color-scheme:dark]"
      >
        <option value="" className="bg-white text-sage-800 dark:bg-sage-900 dark:text-sage-100">My branch</option>
        <option value="all" className="bg-white text-sage-800 dark:bg-sage-900 dark:text-sage-100">All branches</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id} className="bg-white text-sage-800 dark:bg-sage-900 dark:text-sage-100">{b.name}</option>
        ))}
      </select>
    </div>
  );
}

function Brand({ name, logo, collapsed }) {
  return (
    <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center px-0" : "px-2"}`}>
      {logo ? (
        <img src={logo} alt="" className="h-9 w-9 rounded-xl object-contain" />
      ) : (
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-brand-50">
          <Pill className="h-5 w-5" />
          <Plus className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-brand-400 p-0.5 text-brand-900" />
        </span>
      )}
      {!collapsed && (
        <span className="truncate font-display text-xl font-semibold tracking-tight text-[rgb(var(--sidebar-text))]">
          {name || "Remedy"}
        </span>
      )}
    </div>
  );
}


// ── Header bell ─────────────────────────────────────────────────────────────
//
// Reads /api/alerts/summary, which counts what is true right now rather than
// what has already been emailed. The notifications table is an outbox and is
// only written when a delivery channel is configured, so a bell over it would
// read zero on exactly the pharmacy that never set up SMTP and has forty
// expiring batches.
//
// Polled every five minutes and on window focus. Stock does not change fast
// enough to justify more, and a counter machine is left open all day.
// Which alerts this person has already looked at, and at what size.
//
// Deliberately "seen", not "cleared". These are live conditions, not messages:
// stock is still expired after you have read about it, and a badge that dropped
// to zero on click would report a clean shelf while three batches sit on it.
// Acknowledging silences the badge and changes nothing in the list.
//
// The count is stored WITH the acknowledgement, which is what makes it safe: the
// moment a category gets worse it stops matching and the badge returns. Seeing
// "3 expiring" does not buy silence for the fourth.
//
// Per device, in localStorage. This is one person saying "I have looked" at the
// screen in front of them, not a fact about the pharmacy.
const SEEN_KEY = "remedy-alerts-seen";
const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch { return {}; } };
const writeSeen = (v) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(v)); } catch { /* private mode */ } };
const ALERT_KEYS = ["expired", "out_of_stock", "near_expiry", "low_stock", "refill_due"];

function AlertBell() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(readSeen);

  const load = () => api("/api/alerts/summary").then(setData).catch(() => {});

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, []);

  const c = data?.counts;

  // A category counts towards the badge unless it has been seen at this size or
  // larger. Fewer expiring batches than last time is progress, not news.
  const unseen = (key) => {
    const n = Number(c?.[key] || 0);
    return n > 0 && Number(seen[key] || 0) < n ? n : 0;
  };

  const ack = (keys) => {
    const next = { ...seen };
    for (const k of keys) next[k] = Number(c?.[k] || 0);
    setSeen(next);
    writeSeen(next);
  };

  // out_of_stock is a SUBSET of low_stock, so it is not added in — counting it
  // twice would inflate the badge and make the number mean nothing.
  const total = unseen("low_stock") + unseen("near_expiry") + unseen("expired") + unseen("refill_due");
  // Everything currently true, seen or not — the list always shows this.
  const anything = c ? c.low_stock + c.near_expiry + c.expired + c.refill_due : 0;
  // Expired stock must not be sold at all, and an empty shelf turns a customer
  // away. Those are the two the badge goes red for; the rest are amber.
  const urgent = unseen("expired") > 0 || unseen("out_of_stock") > 0;

  // Following a row counts as having seen that category, and only that one.
  const go = (path, keys) => { if (keys) ack(keys); setOpen(false); navigate(path); };

  // `preview` names the first couple of items so the bell says which, not just
  // how many. The endpoint already returns them and the first version of this
  // threw them away.
  const Row = ({ icon: Icon, tone, label, n, onClick, preview }) => {
    if (!n) return null;
    const names = (preview || []).map((x) => x.name).filter(Boolean).slice(0, 2);
    return (
      <button onClick={onClick}
        className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-sage-100 dark:hover:bg-sage-800">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-sage-700 dark:text-sage-200">{label}</span>
          {names.length > 0 && (
            <span className="block truncate text-xs text-sage-500 dark:text-sage-400">
              {names.join(", ")}{n > names.length ? ` and ${n - names.length} more` : ""}
            </span>
          )}
        </span>
        <span className="text-sm font-bold text-sage-900 dark:text-sage-50">{n}</span>
      </button>
    );
  };

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((o) => !o); load(); }}
        aria-label={total ? `${total} alerts` : "Alerts"}
        className="btn-ghost relative !px-2.5 !py-2 !text-[rgb(var(--topbar-text))]"
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span className={`absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold text-white ${urgent ? "bg-rose-600" : "bg-amber-500"}`}>
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-sage-200 bg-white p-1.5 shadow-lg dark:border-sage-800 dark:bg-sage-900">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <p className="text-sm font-semibold text-sage-900 dark:text-sage-50">Needs attention</p>
              {total > 0 && (
                <button
                  onClick={() => ack(ALERT_KEYS)}
                  className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                >
                  Mark all as seen
                </button>
              )}
            </div>

            {!data && (
              <p className="px-3 pb-3 text-sm text-sage-500">Checking&hellip;</p>
            )}

            {data && anything === 0 && (
              <p className="px-3 pb-3 text-sm text-sage-500">
                Nothing to flag &mdash; stock levels and expiry dates are all fine.
              </p>
            )}

            {/* Seen is not solved. The badge is quiet; the shelf is not. Saying
                "nothing to flag" here would be the exact lie this panel exists
                to avoid. */}
            {data && anything > 0 && total === 0 && (
              <p className="px-3 pb-2 text-xs text-sage-500">
                All seen. These are still outstanding, and will be flagged again if any of them grows.
              </p>
            )}

            {data && (
              <>
                {/* Each row lands on the products it is talking about, not on
                    the full list. "3 expired batches" with no way to find them
                    is a puzzle, not an alert. */}
                <Row icon={PackageX} tone="text-rose-600"
                     label="Expired stock on the shelf" n={c.expired}
                     preview={data.near_expiry?.filter((b) => new Date(b.expiry_date) < new Date())}
                     onClick={() => go("/inventory?status=expired", ["expired"])} />
                <Row icon={PackageX} tone="text-rose-600"
                     label="Out of stock" n={c.out_of_stock}
                     onClick={() => go("/inventory?status=out", ["out_of_stock", "low_stock"])} />
                <Row icon={CalendarClock} tone="text-amber-600"
                     label={`Expiring within ${data.near_expiry_months} months`} n={c.near_expiry}
                     preview={data.near_expiry}
                     onClick={() => go("/inventory?status=expiring", ["near_expiry"])} />
                <Row icon={Boxes} tone="text-amber-600"
                     label="At or below reorder level" n={c.low_stock}
                     preview={data.low_stock}
                     onClick={() => go("/inventory?status=low", ["low_stock"])} />
                <Row icon={RefreshCw} tone="text-brand-600"
                     label="Prescriptions due a refill" n={c.refill_due}
                     onClick={() => go("/prescriptions", ["refill_due"])} />
              </>
            )}

            {data && c.expired > 0 && (
              <p className="border-t border-sage-100 px-3 py-2 text-xs text-rose-600 dark:border-sage-800">
                Expired stock must not be sold. Remove it from the shelf before anything else here.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout, moduleEnabled, settings } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("remedy-sidebar") === "1");
  const toggleCollapsed = () =>
    setCollapsed((c) => { const v = !c; localStorage.setItem("remedy-sidebar", v ? "1" : "0"); return v; });
  const [userMenu, setUserMenu] = useState(false);

  const items = NAV.filter(
    (n) =>
      (n.module === null || moduleEnabled(n.module)) &&
      (!n.roles || n.roles.includes(user?.role))
  );

  const doLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  // `collapsed` only applies to the desktop rail; the mobile drawer is always full.
  const renderSidebar = (collapsed) => (
    <div className="flex h-full flex-col">
      <div className={`flex h-16 items-center px-3 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && <Brand name={settings?.pharmacy_name} logo={settings?.logo} collapsed={false} />}
        <div className="flex items-center">
          <button onClick={toggleCollapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label="Toggle sidebar" className="nav-item hidden !px-2 lg:flex">
            <PanelLeft className="h-[18px] w-[18px]" />
          </button>
          <button className="btn-ghost !px-2 !py-2 lg:hidden" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map((n) => (
          <Fragment key={n.to}>
          {n.divider && !collapsed && <div className="my-2 border-t sidebar-divider" />}
          <NavLink
            to={n.to}
            end={n.end}
            title={collapsed ? n.label : undefined}
            onClick={(e) => {
              if (n.soon) e.preventDefault();
              else setOpen(false);
            }}
            className={({ isActive }) =>
              ["nav-item", collapsed ? "justify-center !px-2" : "", n.soon ? "!cursor-default opacity-45" : "", isActive ? "nav-item-active shadow-soft" : ""].join(" ")
            }
          >
            <n.icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="flex-1">{n.label}</span>}
            {!collapsed && n.soon && (
              <span className="chip bg-black/10 text-current opacity-70 dark:bg-white/10">soon</span>
            )}
          </NavLink>
          </Fragment>
        ))}
      </nav>
      <div className="border-t p-3 sidebar-divider">
        <button onClick={doLogout} title={collapsed ? "Sign out" : undefined}
          className={`nav-item w-full ${collapsed ? "justify-center !px-2" : "justify-start"}`}>
          <LogOut className="h-[18px] w-[18px]" /> {!collapsed && "Sign out"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar — pinned full-height so it stays in view while content scrolls */}
      <aside className={`app-sidebar hidden shrink-0 border-r transition-[width] duration-200 lg:sticky lg:top-0 lg:block lg:h-screen ${collapsed ? "lg:w-[68px]" : "lg:w-64"}`}>
        {renderSidebar(collapsed)}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-sage-950/40" onClick={() => setOpen(false)} />
          <aside className="app-sidebar absolute left-0 top-0 h-full w-72 border-r">
            {renderSidebar(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="app-topbar sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur lg:px-8">
          <button className="btn-ghost !px-2 !py-2 !text-[rgb(var(--topbar-text))] lg:hidden" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          {moduleEnabled("branches") && (user?.role === "owner" || user?.role === "manager") && <BranchSwitcher />}
          <AlertBell />
          <button onClick={toggle} className="btn-ghost !px-2.5 !py-2 !text-[rgb(var(--topbar-text))]" aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <div className="relative">
            <button onClick={() => setUserMenu((o) => !o)}
              className="flex items-center gap-3 rounded-xl border border-sage-200 bg-white px-3 py-1.5 transition hover:bg-sage-50 dark:border-sage-800 dark:bg-sage-900 dark:hover:bg-sage-800">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                {(user?.full_name || "?").charAt(0).toUpperCase()}
              </div>
              <div className="hidden leading-tight sm:block">
                <div className="text-sm font-semibold text-sage-900 dark:text-sage-50">{user?.full_name}</div>
                <div className="text-xs capitalize text-sage-500 dark:text-sage-400">{user?.role} · {user?.branch_name || "Main"}</div>
              </div>
              <ChevronDown className="h-4 w-4 text-sage-400" />
            </button>
            {userMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-sage-200 bg-white p-1.5 shadow-lg dark:border-sage-800 dark:bg-sage-900">
                  <div className="px-3 py-2 sm:hidden">
                    <div className="text-sm font-semibold text-sage-900 dark:text-sage-50">{user?.full_name}</div>
                    <div className="text-xs capitalize text-sage-500 dark:text-sage-400">{user?.role}</div>
                  </div>
                  <button onClick={() => { setUserMenu(false); navigate("/profile"); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-sage-700 transition hover:bg-sage-100 dark:text-sage-200 dark:hover:bg-sage-800">
                    <ShieldCheck className="h-4 w-4 text-brand-600" /> My account &amp; security
                  </button>
                  <div className="my-1 border-t border-sage-100 dark:border-sage-800" />
                  <button onClick={() => { setUserMenu(false); doLogout(); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {/* Keyed by route so navigating elsewhere clears a page-level error
              without a reload — the sidebar/topbar stay alive throughout. */}
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={
              <div className="flex h-64 items-center justify-center text-sage-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            }>
              <Outlet />
              <ApprovalHost />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
