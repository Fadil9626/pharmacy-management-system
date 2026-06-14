import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import Layout from "./components/Layout.jsx";
import { Pill } from "lucide-react";

// Code-split every page so the login screen only ships its own small chunk —
// a cashier never downloads the finance/admin bundles.
const Login = lazy(() => import("./pages/Login.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Inventory = lazy(() => import("./pages/Inventory.jsx"));
const POS = lazy(() => import("./pages/POS.jsx"));
const Sales = lazy(() => import("./pages/Sales.jsx"));
const Customers = lazy(() => import("./pages/Customers.jsx"));
const Prescriptions = lazy(() => import("./pages/Prescriptions.jsx"));
const Controlled = lazy(() => import("./pages/Controlled.jsx"));
const Purchasing = lazy(() => import("./pages/Purchasing.jsx"));
const Pricing = lazy(() => import("./pages/Pricing.jsx"));
const Reports = lazy(() => import("./pages/Reports.jsx"));
const Finance = lazy(() => import("./pages/Finance.jsx"));
const Branches = lazy(() => import("./pages/Branches.jsx"));
const Staff = lazy(() => import("./pages/Staff.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));

// Route table: each page declares the module it needs and the roles allowed.
// The single source of truth the sidebar nav mirrors.
const ROUTES = [
  { index: true, el: <Dashboard /> },
  { path: "inventory", el: <Inventory />, module: "inventory" },
  { path: "pos", el: <POS />, module: "pos" },
  { path: "sales", el: <Sales />, module: "pos" },
  { path: "customers", el: <Customers />, module: "customers" },
  { path: "prescriptions", el: <Prescriptions />, module: "prescriptions" },
  { path: "controlled", el: <Controlled />, module: "controlled_drugs" },
  { path: "purchasing", el: <Purchasing />, module: "purchasing", roles: ["owner", "manager", "pharmacist"] },
  { path: "pricing", el: <Pricing />, module: "market_pricing", roles: ["owner", "manager"] },
  { path: "reports", el: <Reports />, module: "reports", roles: ["owner", "manager"] },
  { path: "finance", el: <Finance />, module: "finance", roles: ["owner", "manager"] },
  { path: "branches", el: <Branches />, module: "branches", roles: ["owner", "manager"] },
  { path: "staff", el: <Staff />, roles: ["owner", "manager"] },
  { path: "settings", el: <Settings />, roles: ["owner", "manager"] },
];

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sage-50 dark:bg-sage-950">
      <div className="flex flex-col items-center gap-3 text-brand-600">
        <Pill className="h-10 w-10 animate-pulse" />
        <span className="font-display text-lg">Remedy</span>
      </div>
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Route-level RBAC + licensing. Disallowed role or an off module → bounce to the
// dashboard, so typing /finance or /settings in the address bar gets you nowhere.
// (The backend independently authorizes every request — this is the UI layer.)
function Guarded({ roles, module, children }) {
  const { user, moduleEnabled } = useAuth();
  if (module && !moduleEnabled(module)) return <Navigate to="/" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route
          path="/login"
          element={loading ? <Splash /> : user ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/"
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          {ROUTES.map((r, i) => (
            <Route
              key={i}
              index={r.index}
              path={r.path}
              element={<Guarded roles={r.roles} module={r.module}>{r.el}</Guarded>}
            />
          ))}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
