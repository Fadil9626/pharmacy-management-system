import { Fragment, Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../lib/theme.js";
import { Loader2 } from "lucide-react";
import { api, getActiveBranch, setActiveBranch } from "../lib/api.js";
import {
  Pill, Plus, LayoutDashboard, Boxes, ShoppingCart, Receipt, Truck, FileText,
  Users, ClipboardList, ShieldAlert, Wallet, GitBranch, Moon, Sun,
  LogOut, Menu, X, Settings as SettingsIcon, UserCog, TrendingUp,
} from "lucide-react";

// nav item → required module key (null = always visible). "soon" items render disabled.
// `roles` limits visibility to certain roles (admin sections).
const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, module: null, end: true },
  { to: "/inventory", label: "Inventory", icon: Boxes, module: "inventory" },
  { to: "/pos", label: "Point of Sale", icon: ShoppingCart, module: "pos" },
  { to: "/sales", label: "Sales", icon: Receipt, module: "pos" },
  { to: "/purchasing", label: "Purchasing", icon: Truck, module: "purchasing", roles: ["owner", "manager", "pharmacist"] },
  { to: "/pricing", label: "Market Pricing", icon: TrendingUp, module: "market_pricing", roles: ["owner", "manager"] },
  { to: "/prescriptions", label: "Prescriptions", icon: ClipboardList, module: "prescriptions" },
  { to: "/customers", label: "Customers", icon: Users, module: "customers" },
  { to: "/controlled", label: "Controlled Drugs", icon: ShieldAlert, module: "controlled_drugs" },
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

function Brand({ name, logo }) {
  return (
    <div className="flex items-center gap-2.5 px-2">
      {logo ? (
        <img src={logo} alt="" className="h-9 w-9 rounded-xl object-contain" />
      ) : (
        <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-brand-50">
          <Pill className="h-5 w-5" />
          <Plus className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-brand-400 p-0.5 text-brand-900" />
        </span>
      )}
      <span className="truncate font-display text-xl font-semibold tracking-tight text-[rgb(var(--sidebar-text))]">
        {name || "Remedy"}
      </span>
    </div>
  );
}

export default function Layout() {
  const { user, logout, moduleEnabled, settings } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const items = NAV.filter(
    (n) =>
      (n.module === null || moduleEnabled(n.module)) &&
      (!n.roles || n.roles.includes(user?.role))
  );

  const doLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const SidebarBody = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-3">
        <Brand name={settings?.pharmacy_name} logo={settings?.logo} />
        <button className="btn-ghost !px-2 !py-2 lg:hidden" onClick={() => setOpen(false)}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map((n) => (
          <Fragment key={n.to}>
          {n.divider && <div className="my-2 border-t sidebar-divider" />}
          <NavLink
            to={n.to}
            end={n.end}
            onClick={(e) => {
              if (n.soon) e.preventDefault();
              else setOpen(false);
            }}
            className={({ isActive }) =>
              ["nav-item", n.soon ? "!cursor-default opacity-45" : "", isActive ? "nav-item-active shadow-soft" : ""].join(" ")
            }
          >
            <n.icon className="h-[18px] w-[18px] shrink-0" />
            <span className="flex-1">{n.label}</span>
            {n.soon && (
              <span className="chip bg-black/10 text-current opacity-70 dark:bg-white/10">soon</span>
            )}
          </NavLink>
          </Fragment>
        ))}
      </nav>
      <div className="border-t p-3 sidebar-divider">
        <button onClick={doLogout} className="nav-item w-full justify-start">
          <LogOut className="h-[18px] w-[18px]" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar — pinned full-height so it stays in view while content scrolls */}
      <aside className="app-sidebar hidden w-64 shrink-0 border-r lg:sticky lg:top-0 lg:block lg:h-screen">
        {SidebarBody}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-sage-950/40" onClick={() => setOpen(false)} />
          <aside className="app-sidebar absolute left-0 top-0 h-full w-72 border-r">
            {SidebarBody}
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
          <button onClick={toggle} className="btn-ghost !px-2.5 !py-2 !text-[rgb(var(--topbar-text))]" aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-3 rounded-xl border border-sage-200 bg-white px-3 py-1.5 dark:border-sage-800 dark:bg-sage-900">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
              {(user?.full_name || "?").charAt(0).toUpperCase()}
            </div>
            <div className="hidden leading-tight sm:block">
              <div className="text-sm font-semibold text-sage-900 dark:text-sage-50">
                {user?.full_name}
              </div>
              <div className="text-xs capitalize text-sage-500 dark:text-sage-400">
                {user?.role} · {user?.branch_name || "Main"}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Suspense fallback={
            <div className="flex h-64 items-center justify-center text-sage-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          }>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
