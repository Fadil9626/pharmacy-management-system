import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { money } from "../lib/money.js";
import {
  Search, Plus, PackagePlus, X, Loader2, AlertTriangle, CalendarClock,
  Boxes, ShieldAlert, Pencil, Layers, Trash2, SlidersHorizontal,
} from "lucide-react";

const monthsUntil = (d) => {
  if (!d) return Infinity;
  return (new Date(d) - new Date()) / (1000 * 60 * 60 * 24 * 30.4);
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-lg p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">
            {title}
          </h3>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StockBadge({ p, nearMonths = 3 }) {
  const months = monthsUntil(p.nearest_expiry);
  if (p.stock <= 0)
    return <span className="chip bg-sage-100 text-sage-500 dark:bg-sage-800 dark:text-sage-400">Out of stock</span>;
  if (p.stock <= p.reorder_level)
    return (
      <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        <AlertTriangle className="h-3 w-3" /> Low
      </span>
    );
  if (months <= nearMonths)
    return (
      <span className="chip bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
        <CalendarClock className="h-3 w-3" /> Near expiry
      </span>
    );
  return <span className="chip bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">In stock</span>;
}

export default function Inventory() {
  const { settings, can } = useAuth();
  const nearMonths = Number(settings?.near_expiry_months || 3);
  const [products, setProducts] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [categories, setCategories] = useState([]);
  const [catFilter, setCatFilter] = useState("");
  const [showCategories, setShowCategories] = useState(false);
  const [showProduct, setShowProduct] = useState(false);
  const [editFor, setEditFor] = useState(null);
  const [receiveFor, setReceiveFor] = useState(null);
  const [expanded, setExpanded] = useState(null); // product id whose batches are open

  const load = () =>
    api("/api/products")
      .then(setProducts)
      .catch((e) => setErr(e.message));
  const loadCats = () => api("/api/categories").then(setCategories).catch(() => {});

  const deactivate = async (p) => {
    if (!confirm(`Deactivate "${p.name}"? It will be hidden from inventory and the till.`)) return;
    try { await api(`/api/products/${p.id}`, { method: "DELETE" }); load(); }
    catch (e) { alert(e.message); }
  };

  useEffect(() => {
    load();
    loadCats();
    api("/api/suppliers").then(setSuppliers).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (!products) return [];
    const term = q.trim().toLowerCase();
    return products.filter((p) => {
      if (catFilter && String(p.category_id || "") !== String(catFilter)) return false;
      if (!term) return true;
      return [p.name, p.generic_name, p.category, p.barcode]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(term));
    });
  }, [products, q, catFilter]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-sage-900 dark:text-sage-50">
            Inventory
          </h1>
          <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">
            {products ? `${products.length} products` : "Loading…"} · stock tracked by batch & expiry
          </p>
        </div>
        <div className="flex gap-2">
          {can("inventory.categories") && (
            <button className="btn-outline" onClick={() => setShowCategories(true)}>
              <Layers className="h-4 w-4" /> Categories
            </button>
          )}
          {can("inventory.manage") && (
            <button className="btn-primary" onClick={() => setShowProduct(true)}>
              <Plus className="h-4 w-4" /> New product
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sage-400" />
          <input
            className="input pl-10"
            placeholder="Search by name, generic, category, barcode…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="input sm:w-56" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.product_count})</option>
          ))}
        </select>
      </div>

      {err && (
        <div className="card border-rose-200 p-4 text-sm text-rose-600 dark:border-rose-900/50 dark:text-rose-300">
          {err}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sage-200 text-left text-xs uppercase tracking-wide text-sage-400 dark:border-sage-800">
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium text-right">Stock</th>
                <th className="px-5 py-3 font-medium text-right">Price</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!products ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sage-400">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sage-400">
                    No products match "{q}".
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <Fragment key={p.id}>
                  <tr
                    className="border-b border-sage-100 transition last:border-0 hover:bg-sage-50 dark:border-sage-800/60 dark:hover:bg-sage-800/40"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2 font-medium text-sage-900 dark:text-sage-50">
                        {p.name}
                        {p.is_controlled && (
                          <ShieldAlert className="h-3.5 w-3.5 text-rose-500" title="Controlled drug" />
                        )}
                      </div>
                      <div className="text-xs text-sage-400">
                        {[p.generic_name, p.strength, p.dosage_form].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sage-500 dark:text-sage-400">
                      {p.category || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-sage-900 dark:text-sage-50">
                      {p.stock}
                      <span className="ml-1 text-xs font-normal text-sage-400">{p.unit}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-sage-600 dark:text-sage-300">
                      {p.effective_price ? money(p.effective_price) : p.price ? money(p.price) : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <StockBadge p={p} nearMonths={nearMonths} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1.5">
                        {can("inventory.receive") && (
                          <button className="btn-outline !px-3 !py-1.5 text-xs" onClick={() => setReceiveFor(p)} title="Receive stock">
                            <PackagePlus className="h-3.5 w-3.5" /> Receive
                          </button>
                        )}
                        <button className="btn-ghost !px-2 !py-1.5 text-xs" onClick={() => setExpanded(expanded === p.id ? null : p.id)} title="Batches">
                          <Layers className="h-4 w-4" />
                        </button>
                        {can("inventory.manage") && (
                          <button className="btn-ghost !px-2 !py-1.5 text-xs" onClick={() => setEditFor(p)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {can("inventory.manage") && (
                          <button className="btn-ghost !px-2 !py-1.5 text-xs text-sage-400 hover:text-rose-500" onClick={() => deactivate(p)} title="Deactivate">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === p.id && (
                    <tr className="bg-sage-50/60 dark:bg-sage-950/40">
                      <td colSpan={6} className="px-5 py-4">
                        <BatchDrawer product={p} onChanged={load} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showProduct && (
        <ProductModal
          categories={categories}
          onClose={() => setShowProduct(false)}
          onSaved={() => {
            setShowProduct(false);
            load();
            loadCats();
          }}
        />
      )}
      {editFor && (
        <ProductModal
          product={editFor}
          categories={categories}
          onClose={() => setEditFor(null)}
          onSaved={() => {
            setEditFor(null);
            load();
            loadCats();
          }}
        />
      )}
      {showCategories && (
        <CategoriesManager
          onClose={() => setShowCategories(false)}
          onChanged={() => { loadCats(); load(); }}
        />
      )}
      {receiveFor && (
        <ReceiveModal
          product={receiveFor}
          suppliers={suppliers}
          onClose={() => setReceiveFor(null)}
          onSaved={() => {
            setReceiveFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function ProductModal({ product, categories = [], onClose, onSaved }) {
  const { settings, moduleEnabled } = useAuth();
  const marketOn = moduleEnabled("market_pricing");
  const baseCur = settings?.base_currency || "USD";
  const editing = !!product;
  const [f, setF] = useState({
    name: product?.name || "", generic_name: product?.generic_name || "",
    category_id: product?.category_id || "", dosage_form: product?.dosage_form || "",
    strength: product?.strength || "", unit: product?.unit || "unit",
    barcode: product?.barcode || "", reorder_level: product?.reorder_level ?? 10,
    is_controlled: product?.is_controlled || false,
    base_price: product?.base_price ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api(editing ? `/api/products/${product.id}` : "/api/products", {
        method: editing ? "PUT" : "POST",
        body: { ...f, reorder_level: Number(f.reorder_level) || 0 },
      });
      onSaved();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={editing ? "Edit product" : "New product"} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name *">
          <input className="input" value={f.name} onChange={set("name")} required autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Generic name">
            <input className="input" value={f.generic_name} onChange={set("generic_name")} />
          </Field>
          <Field label="Category">
            <select className="input" value={f.category_id} onChange={set("category_id")}>
              <option value="">— Uncategorised —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Strength">
            <input className="input" value={f.strength} onChange={set("strength")} placeholder="e.g. 500mg" />
          </Field>
          <Field label="Dosage form">
            <input className="input" value={f.dosage_form} onChange={set("dosage_form")} placeholder="Tablet, Syrup…" />
          </Field>
          <Field label="Unit">
            <input className="input" value={f.unit} onChange={set("unit")} />
          </Field>
          <Field label="Reorder level">
            <input type="number" min="0" className="input" value={f.reorder_level} onChange={set("reorder_level")} />
          </Field>
        </div>
        <Field label="Barcode">
          <input className="input" value={f.barcode} onChange={set("barcode")} />
        </Field>
        {marketOn && (
          <Field label={`Base price (${baseCur})`}>
            <input type="number" min="0" step="0.0001" className="input" value={f.base_price} onChange={set("base_price")}
              placeholder={`Anchor price in ${baseCur} — retail = this × market rate`} />
          </Field>
        )}
        <label className="flex items-center gap-2.5 text-sm text-sage-700 dark:text-sage-300">
          <input
            type="checkbox"
            checked={f.is_controlled}
            onChange={set("is_controlled")}
            className="h-4 w-4 rounded border-sage-300 text-brand-600 focus:ring-brand-500"
          />
          Controlled drug
        </label>

        {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {editing ? "Save changes" : "Save product"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReceiveModal({ product, suppliers, onClose, onSaved }) {
  const [f, setF] = useState({
    batch_no: "", expiry_date: "", quantity: "", cost_price: "", selling_price: "", supplier_id: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api("/api/stock/receive", {
        method: "POST",
        body: {
          product_id: product.id,
          batch_no: f.batch_no || null,
          expiry_date: f.expiry_date || null,
          quantity: Number(f.quantity),
          cost_price: f.cost_price === "" ? null : Number(f.cost_price),
          selling_price: f.selling_price === "" ? null : Number(f.selling_price),
          supplier_id: f.supplier_id || null,
        },
      });
      onSaved();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Receive stock · ${product.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity *">
            <input type="number" min="1" className="input" value={f.quantity} onChange={set("quantity")} required autoFocus />
          </Field>
          <Field label="Batch no.">
            <input className="input" value={f.batch_no} onChange={set("batch_no")} />
          </Field>
          <Field label="Expiry date">
            <input type="date" className="input" value={f.expiry_date} onChange={set("expiry_date")} />
          </Field>
          <Field label="Supplier">
            <select className="input" value={f.supplier_id} onChange={set("supplier_id")}>
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Cost price">
            <input type="number" min="0" step="0.01" className="input" value={f.cost_price} onChange={set("cost_price")} />
          </Field>
          <Field label="Selling price">
            <input type="number" min="0" step="0.01" className="input" value={f.selling_price} onChange={set("selling_price")} />
          </Field>
        </div>

        {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
            Receive stock
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Per-product batch list with expiry flags + write-off / adjust.
function BatchDrawer({ product, onChanged }) {
  const { can } = useAuth();
  const [batches, setBatches] = useState(null);
  const [adjust, setAdjust] = useState(null);

  const load = () =>
    api("/api/batches", { params: { product_id: product.id } }).then(setBatches).catch(() => setBatches([]));
  useEffect(() => { load(); }, [product.id]);

  if (!batches) return <div className="py-3 text-center text-sage-400"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>;
  if (batches.length === 0) return <p className="py-2 text-sm text-sage-400">No batches recorded. Use “Receive” to add stock.</p>;

  return (
    <div className="space-y-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left uppercase tracking-wide text-sage-400">
            <th className="pb-2 font-medium">Batch</th>
            <th className="pb-2 font-medium">Supplier</th>
            <th className="pb-2 text-right font-medium">Qty</th>
            <th className="pb-2 text-right font-medium">Cost</th>
            <th className="pb-2 text-right font-medium">Sell</th>
            <th className="pb-2 font-medium">Expiry</th>
            <th className="pb-2 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id} className="border-t border-sage-200/70 dark:border-sage-800">
              <td className="py-2 font-medium text-sage-800 dark:text-sage-100">{b.batch_no || `#${b.id}`}</td>
              <td className="py-2 text-sage-500">{b.supplier_name || "—"}</td>
              <td className="py-2 text-right text-sage-800 dark:text-sage-100">{b.quantity}</td>
              <td className="py-2 text-right text-sage-500">{money(b.cost_price)}</td>
              <td className="py-2 text-right text-sage-500">{money(b.selling_price)}</td>
              <td className="py-2">
                {b.expiry_date ? (
                  <span className={`chip ${b.expired ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" : b.expiring ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-sage-100 text-sage-500 dark:bg-sage-800 dark:text-sage-300"}`}>
                    {b.expired ? "Expired " : ""}{new Date(b.expiry_date).toLocaleDateString()}
                  </span>
                ) : <span className="text-sage-400">—</span>}
              </td>
              <td className="py-2 text-right">
                {can("inventory.adjust") && (
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setAdjust(b)} title="Write-off / adjust">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {adjust && (
        <AdjustModal batch={adjust} onClose={() => setAdjust(null)} onSaved={() => { setAdjust(null); load(); onChanged && onChanged(); }} />
      )}
    </div>
  );
}

const SURVEILLANCE_TAGS = ["malaria", "antibiotic", "hiv", "tb", "ari", "diarrhoea", "hypertension", "diabetes"];

function CategoriesManager({ onClose, onChanged }) {
  const [cats, setCats] = useState(null);
  const [editing, setEditing] = useState(null); // category being edited, or {} for new
  const [err, setErr] = useState("");

  const load = () => api("/api/categories", { params: { all: 1 } }).then(setCats).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const blank = { name: "", code: "", surveillance_tag: "", sort_order: 100 };

  const save = async (form) => {
    const body = { ...form, sort_order: Number(form.sort_order) || 100 };
    if (form.id) await api(`/api/categories/${form.id}`, { method: "PATCH", body });
    else await api("/api/categories", { method: "POST", body });
    setEditing(null);
    load();
    onChanged && onChanged();
  };

  const deactivate = async (c) => {
    if (!confirm(`Deactivate "${c.name}"? Products keep their link but it's hidden from pickers.`)) return;
    try { await api(`/api/categories/${c.id}`, { method: "DELETE" }); load(); onChanged && onChanged(); }
    catch (e) { alert(e.message); }
  };

  return (
    <Modal title="Drug-class categories" onClose={onClose}>
      <p className="-mt-2 mb-4 text-sm text-sage-500 dark:text-sage-400">
        Classify the formulary. A surveillance tag maps a class to a national case aggregate for public-health reporting.
      </p>

      {err && <div className="mb-3 text-sm text-rose-600 dark:text-rose-400">{err}</div>}

      {editing ? (
        <CategoryForm
          initial={editing.id ? editing : blank}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      ) : (
        <>
          <div className="mb-3 flex justify-end">
            <button className="btn-primary !py-2" onClick={() => setEditing(blank)}><Plus className="h-4 w-4" /> New category</button>
          </div>
          <div className="max-h-[55vh] overflow-y-auto">
            {!cats ? (
              <div className="py-8 text-center text-sage-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sage-200 text-left text-xs uppercase tracking-wide text-sage-400 dark:border-sage-800">
                    <th className="pb-2 font-medium">Category</th>
                    <th className="pb-2 font-medium">Tag</th>
                    <th className="pb-2 text-right font-medium">Items</th>
                    <th className="pb-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c) => (
                    <tr key={c.id} className={`border-b border-sage-100 dark:border-sage-800/60 ${!c.is_active ? "opacity-50" : ""}`}>
                      <td className="py-2.5">
                        <div className="font-medium text-sage-900 dark:text-sage-50">{c.name} {c.code && <span className="text-xs text-sage-400">{c.code}</span>}</div>
                      </td>
                      <td className="py-2.5">
                        {c.surveillance_tag
                          ? <span className="chip bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">{c.surveillance_tag}</span>
                          : <span className="text-sage-300 dark:text-sage-600">—</span>}
                      </td>
                      <td className="py-2.5 text-right text-sage-500">{c.product_count}</td>
                      <td className="py-2.5 text-right">
                        <button className="btn-ghost !px-2 !py-1" onClick={() => setEditing(c)} title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                        {c.is_active && (
                          <button className="btn-ghost !px-2 !py-1 text-sage-400 hover:text-rose-500" onClick={() => deactivate(c)} title="Deactivate"><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function CategoryForm({ initial, onCancel, onSave }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await onSave(f); } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="label">Name *</label><input className="input" value={f.name} onChange={set("name")} required autoFocus /></div>
        <div><label className="label">Code</label><input className="input" value={f.code || ""} onChange={set("code")} placeholder="e.g. ABX" /></div>
        <div><label className="label">Sort order</label><input type="number" className="input" value={f.sort_order ?? 100} onChange={set("sort_order")} /></div>
      </div>
      <div>
        <label className="label">Surveillance tag <span className="font-normal text-sage-400">(maps to national case aggregate)</span></label>
        <input className="input" list="surv-tags" value={f.surveillance_tag || ""} onChange={set("surveillance_tag")} placeholder="none — e.g. malaria, antibiotic" />
        <datalist id="surv-tags">{SURVEILLANCE_TAGS.map((t) => <option key={t} value={t} />)}</datalist>
      </div>
      {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-outline" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {f.id ? "Save" : "Create"}</button>
      </div>
    </form>
  );
}

const ADJUST_REASONS = [
  { key: "expired", label: "Expired" },
  { key: "damaged", label: "Damaged" },
  { key: "lost", label: "Lost / theft" },
  { key: "recall", label: "Recall" },
  { key: "correction", label: "Count correction" },
];

function AdjustModal({ batch, onClose, onSaved }) {
  const [mode, setMode] = useState("remove"); // remove | add
  const [qty, setQty] = useState(batch.expired ? batch.quantity : "");
  const [reason, setReason] = useState(batch.expired ? "expired" : "damaged");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async (e) => {
    e.preventDefault();
    const n = Number(qty);
    if (!n || n <= 0) return setErr("Enter a quantity greater than zero.");
    setBusy(true); setErr("");
    try {
      await api("/api/stock/adjust", {
        method: "POST",
        body: { batch_id: batch.id, qty_change: mode === "remove" ? -n : n, reason, note },
      });
      onSaved();
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <Modal title={`Adjust stock · ${batch.product_name || ""} ${batch.batch_no || `#${batch.id}`}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-sage-500 dark:text-sage-400">Current quantity in this batch: <b>{batch.quantity}</b></p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMode("remove")} className={`rounded-xl border px-3 py-2 text-sm font-medium ${mode === "remove" ? "border-rose-400 bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300" : "border-sage-200 text-sage-500 dark:border-sage-700"}`}>Remove</button>
          <button type="button" onClick={() => setMode("add")} className={`rounded-xl border px-3 py-2 text-sm font-medium ${mode === "add" ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300" : "border-sage-200 text-sage-500 dark:border-sage-700"}`}>Add back</button>
        </div>
        <Field label="Quantity">
          <input type="number" min="1" className="input" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
        </Field>
        <Field label="Reason">
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {ADJUST_REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Note (optional)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. broken in transit" />
        </Field>
        {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SlidersHorizontal className="h-4 w-4" />} Apply adjustment
          </button>
        </div>
      </form>
    </Modal>
  );
}
