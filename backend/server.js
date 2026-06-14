require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const pool = require("./config/db");

const { protect, authorize } = require("./middleware/auth");
const { requireModule } = require("./middleware/requireModule");
const requirePermission = require("./middleware/requirePermission");
const adminApiKey = require("./middleware/adminApiKey");
const { seedIfEmpty } = require("./lib/permissions");
const permissions = require("./controllers/permissionsController");
const auth = require("./controllers/authController");
const modules = require("./controllers/modulesController");
const catalog = require("./controllers/catalogController");
const dashboard = require("./controllers/dashboardController");
const sales = require("./controllers/salesController");
const subscription = require("./controllers/subscriptionController");
const settings = require("./controllers/settingsController");
const users = require("./controllers/usersController");
const categories = require("./controllers/categoriesController");
const pricing = require("./controllers/pricingController");
const customers = require("./controllers/customersController");
const prescriptions = require("./controllers/prescriptionsController");
const controlled = require("./controllers/controlledController");
const finance = require("./controllers/financeController");
const branches = require("./controllers/branchesController");
const purchasing = require("./controllers/purchasingController");
const reports = require("./controllers/reportsController");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ── Migrations + default admin on boot ──────────────────────
(async () => {
  try {
    await pool.query("SELECT NOW()");
    const dir = path.join(__dirname, "migrations");
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      try {
        await pool.query(fs.readFileSync(path.join(dir, f), "utf8"));
        console.log(`✅ migration ${f}`);
      } catch (e) {
        console.error(`⚠️  migration ${f}: ${e.message}`);
      }
    }
    const { rows } = await pool.query("SELECT COUNT(*)::int n FROM users");
    if (rows[0].n === 0) {
      const hash = await bcrypt.hash("admin123", 10);
      const b = await pool.query("SELECT id FROM branches WHERE is_main LIMIT 1");
      await pool.query(
        "INSERT INTO users (branch_id, full_name, email, password_hash, role) VALUES ($1,'Administrator','admin@remedy.local',$2,'owner')",
        [b.rows[0]?.id || null, hash]
      );
      console.log("✅ Seeded admin — email: admin@remedy.local  password: admin123");
    }
    if (await seedIfEmpty()) console.log("✅ Seeded default role permissions");
    console.log("✅ Remedy database ready");
  } catch (e) {
    console.error("❌ DB init failed:", e.message);
    process.exit(1);
  }
})();

// ── Routes ──────────────────────────────────────────────────
app.get("/api/health", (_, res) => res.json({ ok: true }));

app.post("/api/auth/login", auth.login);
app.get("/api/me", protect, auth.me);
app.get("/api/modules", protect, modules.list);
app.get("/api/dashboard", protect, dashboard.summary);

app.get("/api/products", protect, requireModule("inventory"), catalog.listProducts);
app.post("/api/products", protect, requireModule("inventory"), requirePermission("inventory.manage"), catalog.createProduct);
app.put("/api/products/:id", protect, requireModule("inventory"), requirePermission("inventory.manage"), catalog.updateProduct);
app.delete("/api/products/:id", protect, requireModule("inventory"), requirePermission("inventory.manage"), catalog.deactivateProduct);
app.get("/api/batches", protect, requireModule("inventory"), catalog.listBatches);
app.post("/api/stock/receive", protect, requireModule("inventory"), requirePermission("inventory.receive"), catalog.receiveStock);
app.post("/api/stock/adjust", protect, requireModule("inventory"), requirePermission("inventory.adjust"), catalog.adjustStock);
app.get("/api/suppliers", protect, catalog.listSuppliers);
app.get("/api/catalog/lite", protect, catalog.listLite);

// Drug-class categories (formulary structure)
app.get("/api/categories", protect, categories.list);
app.post("/api/categories", protect, requireModule("inventory"), requirePermission("inventory.categories"), categories.create);
app.patch("/api/categories/:id", protect, requireModule("inventory"), requirePermission("inventory.categories"), categories.update);
app.delete("/api/categories/:id", protect, requireModule("inventory"), requirePermission("inventory.categories"), categories.deactivate);

// Settings (core admin)
app.get("/api/settings", protect, settings.get);
app.put("/api/settings", protect, requirePermission("settings.manage"), settings.update);

// Roles & permissions (owner only)
app.get("/api/permissions", protect, authorize("owner", "manager"), permissions.list);
app.put("/api/permissions/:role", protect, authorize("owner"), permissions.updateRole);

// Customers (licensable module)
app.get("/api/customers", protect, requireModule("customers"), customers.list);
app.get("/api/customers/:id", protect, requireModule("customers"), customers.get);
app.post("/api/customers", protect, requireModule("customers"), requirePermission("customers.manage"), customers.create);
app.patch("/api/customers/:id", protect, requireModule("customers"), requirePermission("customers.manage"), customers.update);
app.post("/api/customers/:id/payment", protect, requireModule("customers"), requirePermission("customers.payment"), customers.recordPayment);

// Prescriptions (licensable module)
app.get("/api/prescriptions", protect, requireModule("prescriptions"), prescriptions.list);
app.get("/api/prescriptions/:id", protect, requireModule("prescriptions"), prescriptions.get);
app.post("/api/prescriptions", protect, requireModule("prescriptions"), authorize("owner", "manager", "pharmacist"), prescriptions.create);
app.post("/api/prescriptions/:id/dispense", protect, requireModule("prescriptions"), authorize("owner", "manager", "pharmacist"), prescriptions.dispense);
app.post("/api/prescriptions/:id/cancel", protect, requireModule("prescriptions"), authorize("owner", "manager", "pharmacist"), prescriptions.cancel);

// Branches (licensable module)
app.get("/api/branches", protect, requireModule("branches"), branches.list);
app.post("/api/branches", protect, requireModule("branches"), requirePermission("branches.manage"), branches.create);
app.patch("/api/branches/:id", protect, requireModule("branches"), requirePermission("branches.manage"), branches.update);

// Finance — till shifts, cash movements, expenses (licensable module)
app.get("/api/finance/shift/current", protect, requireModule("finance"), finance.current);
app.post("/api/finance/shift/open", protect, requireModule("finance"), finance.open);
app.post("/api/finance/shift/close", protect, requireModule("finance"), finance.close);
app.post("/api/finance/cash", protect, requireModule("finance"), finance.cashMovement);
app.get("/api/finance/shifts", protect, requireModule("finance"), requirePermission("finance.reconcile"), finance.shifts);
app.get("/api/finance/shifts/:id", protect, requireModule("finance"), finance.shiftReport);
app.get("/api/finance/expenses", protect, requireModule("finance"), finance.listExpenses);
app.post("/api/finance/expenses", protect, requireModule("finance"), requirePermission("finance.expense"), finance.createExpense);

// Controlled-drugs register (licensable module)
app.get("/api/controlled/products", protect, requireModule("controlled_drugs"), controlled.products);
app.get("/api/controlled/:id/register", protect, requireModule("controlled_drugs"), controlled.register);

// Market pricing & exchange rates (licensable module)
app.get("/api/pricing", protect, requireModule("market_pricing"), pricing.get);
app.post("/api/pricing/rate", protect, requireModule("market_pricing"), requirePermission("pricing.manage"), pricing.setRate);

// Staff / users (core admin)
app.get("/api/users", protect, requirePermission("staff.manage"), users.list);
app.post("/api/users", protect, requirePermission("staff.manage"), users.create);
app.patch("/api/users/:id", protect, requirePermission("staff.manage"), users.update);
app.post("/api/users/:id/reset-password", protect, requirePermission("staff.manage"), users.resetPassword);

// Point of Sale
app.get("/api/pos/products", protect, requireModule("pos"), sales.sellableProducts);
app.post("/api/sales", protect, requireModule("pos"), requirePermission("pos.sell"), sales.createSale);
app.get("/api/sales", protect, requireModule("pos"), sales.listSales);
app.get("/api/sales/:id", protect, requireModule("pos"), sales.getSale);

// Purchasing
app.post("/api/suppliers", protect, authorize("owner", "manager"), purchasing.createSupplier);
app.get("/api/purchasing/reorder", protect, requireModule("purchasing"), purchasing.reorderSuggestions);
app.get("/api/purchase-orders", protect, requireModule("purchasing"), purchasing.listPOs);
app.post("/api/purchase-orders", protect, requireModule("purchasing"), requirePermission("purchasing.manage"), purchasing.createPO);
app.get("/api/purchase-orders/:id", protect, requireModule("purchasing"), purchasing.getPO);
app.post("/api/purchase-orders/:id/receive", protect, requireModule("purchasing"), requirePermission("purchasing.receive"), purchasing.receivePO);
app.post("/api/purchase-orders/:id/cancel", protect, requireModule("purchasing"), requirePermission("purchasing.manage"), purchasing.cancelPO);

// Reports
app.get("/api/reports/sales", protect, requireModule("reports"), requirePermission("reports.view"), reports.sales);
app.get("/api/reports/inventory", protect, requireModule("reports"), requirePermission("reports.view"), reports.inventory);

// ── Control Center remote management (admin-key auth) ───────
app.get("/api/subscription/status", adminApiKey, subscription.status);
app.get("/api/subscription/remote/modules", adminApiKey, subscription.remoteGetModules);
app.put("/api/subscription/remote/apply", adminApiKey, subscription.remoteApplyModules);
app.put("/api/subscription/plans/:planKey/pricing", adminApiKey, subscription.updatePlanPricing);

// ── Serve built frontend (production) ───────────────────────
const dist = path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (req, res) =>
    req.path.startsWith("/api")
      ? res.status(404).json({ message: "Not found" })
      : res.sendFile(path.join(dist, "index.html"))
  );
}

const PORT = process.env.PORT || 5190;
app.listen(PORT, "0.0.0.0", () => console.log(`🩺 Remedy API on http://0.0.0.0:${PORT}`));
