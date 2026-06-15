const pool = require("./../config/db");

// The four built-in roles (owner is the super-user — always allowed).
const ROLES = ["owner", "manager", "pharmacist", "cashier"];

// Catalogue of granular actions, grouped for the matrix UI.
const PERMISSIONS = [
  { key: "pos.sell",            label: "Make sales",                    group: "Point of Sale" },
  { key: "pos.discount",        label: "Apply discounts",              group: "Point of Sale" },
  { key: "pos.account",         label: "Sell on account (credit)",     group: "Point of Sale" },
  { key: "pos.refund",          label: "Process returns / refunds",    group: "Point of Sale" },

  { key: "inventory.manage",    label: "Add & edit products",          group: "Inventory" },
  { key: "inventory.receive",   label: "Receive stock",                group: "Inventory" },
  { key: "inventory.adjust",    label: "Write off / adjust stock",     group: "Inventory" },
  { key: "inventory.categories",label: "Manage categories",            group: "Inventory" },

  { key: "purchasing.manage",   label: "Create purchase orders",       group: "Purchasing" },
  { key: "purchasing.receive",  label: "Receive orders",               group: "Purchasing" },

  { key: "customers.manage",    label: "Add & edit customers",         group: "Customers" },
  { key: "customers.payment",   label: "Take account payments",        group: "Customers" },

  { key: "controlled.dispense", label: "Dispense controlled drugs",    group: "Controlled" },

  { key: "finance.expense",     label: "Record expenses",              group: "Finance" },
  { key: "finance.reconcile",   label: "Close tills & shift history",  group: "Finance" },

  { key: "pricing.manage",      label: "Manage market rates",          group: "Pricing" },
  { key: "reports.view",        label: "View reports",                 group: "Reports" },

  { key: "branches.manage",     label: "Manage branches",              group: "Administration" },
  { key: "staff.manage",        label: "Manage staff",                 group: "Administration" },
  { key: "settings.manage",     label: "Edit settings",                group: "Administration" },
];

const ALL_KEYS = PERMISSIONS.map((p) => p.key);

// Sensible starting matrix (owner = everything, implicitly).
const DEFAULTS = {
  manager: ALL_KEYS.slice(),
  pharmacist: [
    "pos.sell", "pos.discount", "pos.account", "pos.refund",
    "inventory.manage", "inventory.receive", "inventory.adjust", "inventory.categories",
    "purchasing.manage", "purchasing.receive",
    "customers.manage", "customers.payment", "controlled.dispense",
  ],
  cashier: ["pos.sell", "customers.manage"],
};

// ── live cache ──────────────────────────────────────────────
let cache = { at: 0, map: null };
async function loadRolePerms() {
  if (cache.map && Date.now() - cache.at < 15000) return cache.map;
  const { rows } = await pool.query("SELECT role, permission FROM role_permissions");
  const map = {};
  for (const r of rows) (map[r.role] || (map[r.role] = new Set())).add(r.permission);
  cache = { at: Date.now(), map };
  return map;
}
function invalidate() { cache = { at: 0, map: null }; }

async function userCan(role, key) {
  if (role === "owner") return true;
  const map = await loadRolePerms();
  return map[role] ? map[role].has(key) : false;
}

async function permsForRole(role) {
  if (role === "owner") return ALL_KEYS.slice();
  const map = await loadRolePerms();
  return map[role] ? [...map[role]] : [];
}

// Seed the table from DEFAULTS the first time (called on boot).
async function seedIfEmpty() {
  const { rows } = await pool.query("SELECT COUNT(*)::int n FROM role_permissions");
  if (rows[0].n > 0) return false;
  for (const [role, keys] of Object.entries(DEFAULTS)) {
    for (const k of keys) {
      await pool.query("INSERT INTO role_permissions (role, permission) VALUES ($1,$2) ON CONFLICT DO NOTHING", [role, k]);
    }
  }
  return true;
}

// Backfill a newly-introduced permission for existing installs — runs once
// (skips if any role already has it, so it never undoes an owner's revocation).
async function backfillPermission(key, roles) {
  const { rows } = await pool.query("SELECT 1 FROM role_permissions WHERE permission = $1 LIMIT 1", [key]);
  if (rows.length) return false;
  for (const role of roles) {
    await pool.query("INSERT INTO role_permissions (role, permission) VALUES ($1,$2) ON CONFLICT DO NOTHING", [role, key]);
  }
  invalidate();
  return true;
}

module.exports = { ROLES, PERMISSIONS, ALL_KEYS, DEFAULTS, loadRolePerms, invalidate, userCan, permsForRole, seedIfEmpty, backfillPermission };
