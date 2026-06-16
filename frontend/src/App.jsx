import { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import Layout from "./components/Layout.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import AccessDenied from "./components/AccessDenied.jsx";
import NotFound from "./components/NotFound.jsx";
import lazyWithRetry from "./lib/lazyWithRetry.js";
import { Pill } from "lucide-react";

// Code-split every page so the login screen only ships its own small chunk —
// a cashier never downloads the finance/admin bundles. lazyWithRetry survives a
// transient blip / freshly-deployed chunk before falling back to ErrorBoundary.
const Login = lazyWithRetry(() => import("./pages/Login.jsx"));
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard.jsx"));
const Inventory = lazyWithRetry(() => import("./pages/Inventory.jsx"));
const POS = lazyWithRetry(() => import("./pages/POS.jsx"));
const Sales = lazyWithRetry(() => import("./pages/Sales.jsx"));
const Customers = lazyWithRetry(() => import("./pages/Customers.jsx"));
const Prescriptions = lazyWithRetry(() => import("./pages/Prescriptions.jsx"));
const Controlled = lazyWithRetry(() => import("./pages/Controlled.jsx"));
const Purchasing = lazyWithRetry(() => import("./pages/Purchasing.jsx"));
const Pricing = lazyWithRetry(() => import("./pages/Pricing.jsx"));
const Reports = lazyWithRetry(() => import("./pages/Reports.jsx"));
const Finance = lazyWithRetry(() => import("./pages/Finance.jsx"));
const Branches = lazyWithRetry(() => import("./pages/Branches.jsx"));
const Staff = lazyWithRetry(() => import("./pages/Staff.jsx"));
const Settings = lazyWithRetry(() => import("./pages/Settings.jsx"));
const Profile = lazyWithRetry(() => import("./pages/Profile.jsx"));
const Promotions = lazyWithRetry(() => import("./pages/Promotions.jsx"));
const Reset = lazyWithRetry(() => import("./pages/Reset.jsx"));

// Route table: each page declares the module it needs and the roles allowed.
// The single source of truth the sidebar nav mirrors.
const STAFF = ["owner", "manager", "pharmacist"]; // everyone except cashier
const ROUTES = [
  { index: true, el: <Dashboard /> },
  { path: "inventory", el: <Inventory />, module: "inventory", roles: STAFF },
  { path: "pos", el: <POS />, module: "pos" },              // cashiers' core screen — open to all roles
  { path: "sales", el: <Sales />, module: "pos" },          // reprint receipts — open to all roles
  { path: "promotions", el: <Promotions />, module: "pos", roles: ["owner", "manager"] },
  { path: "customers", el: <Customers />, module: "customers", roles: STAFF },
  { path: "prescriptions", el: <Prescriptions />, module: "prescriptions", roles: STAFF },
  { path: "controlled", el: <Controlled />, module: "controlled_drugs", roles: STAFF },
  { path: "purchasing", el: <Purchasing />, module: "purchasing", roles: ["owner", "manager", "pharmacist"] },
  { path: "pricing", el: <Pricing />, module: "market_pricing", roles: ["owner", "manager"] },
  { path: "reports", el: <Reports />, module: "reports", roles: ["owner", "manager"] },
  { path: "finance", el: <Finance />, module: "finance", roles: ["owner", "manager"] },
  { path: "branches", el: <Branches />, module: "branches", roles: ["owner", "manager"] },
  { path: "staff", el: <Staff />, roles: ["owner", "manager"] },
  { path: "settings", el: <Settings />, roles: ["owner", "manager"] },
  { path: "profile", el: <Profile /> }, // every signed-in user
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

// Route-level RBAC + licensing. Rather than silently bouncing to the dashboard
// (which makes a user think their click was ignored), render an explicit reason.
// The backend independently authorizes every request — this is the UI layer.
function Guarded({ roles, module, children }) {
  const { user, moduleEnabled } = useAuth();
  if (module && !moduleEnabled(module)) return <AccessDenied variant="module" />;
  if (roles && !roles.includes(user?.role)) return <AccessDenied variant="role" role={user?.role} />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <ErrorBoundary fullScreen>
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route
            path="/login"
            element={loading ? <Splash /> : user ? <Navigate to="/" replace /> : <Login />}
          />
          <Route path="/reset" element={<Reset />} />{/* public: set password from emailed link */}
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
            {/* Unknown URL under the app shell → honest 404 (keeps the menu). */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
