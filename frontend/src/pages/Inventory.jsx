import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { money } from "../lib/money.js";
import { parseCSV, downloadCSV } from "../lib/csv.js";
import ConfirmModal from "../components/Confirm.jsx";
import {
  Search, Plus, PackagePlus, X, Loader2, AlertTriangle, CalendarClock,
  Boxes, ShieldAlert, Pencil, Layers, Trash2, SlidersHorizontal, Upload, Download, CheckCircle2, FileSpreadsheet,
  ClipboardCheck, Barcode, Printer, RefreshCw, ImagePlus,
} from "lucide-react";
import { barcodeSVG, printBarcodeLabels } from "../lib/barcode.js";
import { fileToImage } from "../lib/branding.js";
import ProductImage from "../components/ProductImage.jsx";

const monthsUntil = (d) => {
  if (!d) return Infinity;
  return (new Date(d) - new Date()) / (1000 * 60 * 60 * 24 * 30.4);
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col p-6">
        <div className="mb-5 flex shrink-0 items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">
            {title}
          </h3>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
          {children}
        </div>
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
  const [showImport, setShowImport] = useState(false);
  const [showCount, setShowCount] = useState(false);
  const [barcodeFor, setBarcodeFor] = useState(null);
  const [showProduct, setShowProduct] = useState(false);
  const [editFor, setEditFor] = useState(null);
  const [receiveFor, setReceiveFor] = useState(null);
  const [expanded, setExpanded] = useState(null); // product id whose batches are open

  const load = () =>
    api("/api/products")
      .then(setProducts)
      .catch((e) => setErr(e.message));
  const loadCats = () => api("/api/categories").then(setCategories).catch(() => {});

  const [confirmDeactivate, setConfirmDeactivate] = useState(null);
  const deactivate = (p) => setConfirmDeactivate(p);
  const doDeactivate = async () => {
    await api(`/api/products/${confirmDeactivate.id}`, { method: "DELETE" });
    setConfirmDeactivate(null); load();
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
          {can("inventory.adjust") && (
            <button className="btn-outline" onClick={() => setShowCount(true)}>
              <ClipboardCheck className="h-4 w-4" /> Stock-take
            </button>
          )}
          {can("inventory.manage") && (
            <button className="btn-outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4" /> Import
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
                      <div className="flex items-center gap-3">
                        <ProductImage product={p} className="h-10 w-10" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium text-sage-900 dark:text-sage-50">
                            {p.name}
                            {p.is_controlled && (
                              <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-rose-500" title="Controlled drug" />
                            )}
                          </div>
                          <div className="text-xs text-sage-400">
                            {[p.generic_name, p.strength, p.dosage_form].filter(Boolean).join(" · ")}
                          </div>
                        </div>
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
                          <button className="btn-ghost !px-2 !py-1.5 text-xs" onClick={() => setBarcodeFor(p)} title="Barcode & labels">
                            <Barcode className="h-4 w-4" />
                          </button>
                        )}
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
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onDone={() => { load(); loadCats(); }} />
      )}
      {showCount && (
        <StockCountModal products={products || []} onClose={() => setShowCount(false)} onDone={() => { setShowCount(false); load(); }} />
      )}
      {barcodeFor && (
        <BarcodeModal product={barcodeFor} settings={settings} onClose={() => setBarcodeFor(null)} onChanged={load} />
      )}
      {confirmDeactivate && (
        <ConfirmModal danger title="Deactivate product" confirmLabel="Deactivate"
          message={`"${confirmDeactivate.name}" will be hidden from inventory and the till. You can re-add it later.`}
          onConfirm={doDeactivate} onClose={() => setConfirmDeactivate(null)} />
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
    pack_size: product?.pack_size ?? 1, pack_label: product?.pack_label || "",
    surveillance_tag: product?.surveillance_tag || "",
    image: undefined, // undefined = keep existing, "" = remove, dataURL = set
  });
  const [shTags, setShTags] = useState([]);
  useEffect(() => { api("/api/public-health/tags").then(setShTags).catch(() => {}); }, []);
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
        <div className="flex items-center gap-4">
          {f.image
            ? <img src={f.image} alt="" className="h-16 w-16 rounded-xl bg-sage-100 object-cover dark:bg-sage-800" />
            : (editing && product.has_image && f.image !== "")
              ? <img src={`/api/products/${product.id}/image`} alt="" className="h-16 w-16 rounded-xl bg-sage-100 object-cover dark:bg-sage-800" />
              : <ProductImage product={{ name: f.name }} className="h-16 w-16" rounded="rounded-xl" />}
          <div className="flex flex-col items-start gap-1.5">
            <label className="btn-outline !py-1.5 cursor-pointer text-sm">
              <ImagePlus className="h-4 w-4" /> {(f.image || (editing && product.has_image && f.image !== "")) ? "Change photo" : "Add photo"}
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return;
                try { const dataUrl = await fileToImage(file); setF((p) => ({ ...p, image: dataUrl })); } catch (er) { setErr(er.message); }
                e.target.value = "";
              }} />
            </label>
            {(f.image || (editing && product.has_image && f.image !== "")) && (
              <button type="button" className="btn-ghost !py-1 text-xs text-rose-500" onClick={() => setF((p) => ({ ...p, image: "" }))}>Remove photo</button>
            )}
          </div>
        </div>
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
          <Field label="Units per pack">
            <input type="number" min="1" step="1" className="input" value={f.pack_size} onChange={set("pack_size")} placeholder="e.g. 100" />
          </Field>
          <Field label="Pack label">
            <input className="input" value={f.pack_label} onChange={set("pack_label")} placeholder="e.g. Box of 100" />
          </Field>
        </div>
        <Field label="Barcode">
          <div className="flex gap-2">
            <input className="input" value={f.barcode} onChange={set("barcode")} placeholder="Scan or generate" />
            <button type="button" className="btn-outline shrink-0" title="Generate an in-store barcode"
              onClick={async () => { try { const { barcode } = await api("/api/barcode/generate", { method: "POST", body: { name: f.name } }); setF((p) => ({ ...p, barcode })); } catch (e) { setErr(e.message); } }}>
              <Barcode className="h-4 w-4" /> Generate
            </button>
          </div>
        </Field>
        <Field label="Surveillance indicator">
          <select className="input" value={f.surveillance_tag} onChange={set("surveillance_tag")}>
            <option value="">— None (not tracked) —</option>
            {shTags.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <p className="mt-1 text-xs text-sage-400">Tag products whose dispensing signals a public-health case (for Ministry-of-Health reporting).</p>
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
  const packSize = Math.max(1, Number(product.pack_size) || 1);
  const hasPacks = packSize > 1;
  const [byPack, setByPack] = useState(false);
  const [f, setF] = useState({
    batch_no: "", expiry_date: "", quantity: "", cost_price: "", selling_price: "", supplier_id: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const unitName = product.unit || "unit";
  const qtyNum = Number(f.quantity) || 0;
  const costNum = Number(f.cost_price) || 0;
  const totalUnits = byPack ? qtyNum * packSize : qtyNum;
  const perUnitCost = byPack && costNum ? costNum / packSize : costNum;

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
          receive_by: byPack ? "pack" : "unit",
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
        {hasPacks && (
          <div className="flex rounded-xl border border-sage-200 p-1 text-sm dark:border-sage-800">
            <button type="button" onClick={() => setByPack(false)}
              className={"flex-1 rounded-lg px-3 py-1.5 font-medium transition " + (!byPack ? "bg-brand-600 text-white" : "text-sage-600 dark:text-sage-300")}>
              By {unitName}
            </button>
            <button type="button" onClick={() => setByPack(true)}
              className={"flex-1 rounded-lg px-3 py-1.5 font-medium transition " + (byPack ? "bg-brand-600 text-white" : "text-sage-600 dark:text-sage-300")}>
              By pack {product.pack_label ? `(${product.pack_label})` : `(×${packSize})`}
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={byPack ? "Packs *" : "Quantity *"}>
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
          <Field label={byPack ? "Cost per pack" : "Cost price"}>
            <input type="number" min="0" step="0.01" className="input" value={f.cost_price} onChange={set("cost_price")} />
          </Field>
          <Field label={`Selling price (per ${unitName})`}>
            <input type="number" min="0" step="0.01" className="input" value={f.selling_price} onChange={set("selling_price")} />
          </Field>
        </div>

        {byPack && qtyNum > 0 && (
          <div className="rounded-xl bg-sage-50 px-4 py-2.5 text-sm text-sage-600 dark:bg-sage-900 dark:text-sage-300">
            Receiving <b>{totalUnits} {unitName}s</b>{costNum ? <> · cost <b>{money(perUnitCost)}</b> per {unitName}</> : null}
          </div>
        )}

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

const IMPORT_COLUMNS = ["name", "generic_name", "category", "dosage_form", "strength", "unit", "barcode", "reorder_level", "is_controlled", "base_price"];

function ImportModal({ onClose, onDone }) {
  const fileRef = useRef(null);
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      if (!parsed.length) return setErr("No rows found in that file.");
      if (!("name" in parsed[0])) return setErr("CSV must have a 'name' column.");
      setRows(parsed); setErr("");
    } catch { setErr("Could not read that file."); }
  };

  const template = () => downloadCSV("remedy-products-template", [
    { name: "Amoxicillin 500mg", generic_name: "Amoxicillin", category: "Antibiotics", dosage_form: "Capsule", strength: "500mg", unit: "capsule", barcode: "", reorder_level: 50, is_controlled: "no", base_price: "" },
  ], IMPORT_COLUMNS);

  const doImport = async () => {
    setBusy(true); setErr("");
    try {
      const res = await api("/api/products/import", { method: "POST", body: { products: rows } });
      setResult(res);
      onDone && onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="Import products" onClose={onClose}>
      {result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-brand-600"><CheckCircle2 className="h-5 w-5" /> <span className="font-medium">Import complete</span></div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-sage-200 p-3 dark:border-sage-800"><div className="text-2xl font-semibold text-brand-600">{result.created}</div><div className="text-xs text-sage-400">created</div></div>
            <div className="rounded-xl border border-sage-200 p-3 dark:border-sage-800"><div className="text-2xl font-semibold text-sage-500">{result.skipped}</div><div className="text-xs text-sage-400">skipped (dupes)</div></div>
            <div className="rounded-xl border border-sage-200 p-3 dark:border-sage-800"><div className="text-2xl font-semibold text-rose-500">{result.errors.length}</div><div className="text-xs text-sage-400">errors</div></div>
          </div>
          {result.errors.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-xl bg-sage-50 p-3 text-xs text-rose-600 dark:bg-sage-950 dark:text-rose-300">
              {result.errors.slice(0, 20).map((e, i) => <div key={i}>Row {e.row}: {e.error}</div>)}
            </div>
          )}
          <div className="flex justify-end"><button className="btn-primary" onClick={onClose}>Done</button></div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-sage-500 dark:text-sage-400">
            Upload a CSV with a <b>name</b> column (required). Optional: generic_name, category, dosage_form, strength, unit, barcode, reorder_level, is_controlled, base_price. Existing products (by name) are skipped.
          </p>
          <button onClick={template} className="btn-ghost text-sm text-brand-600"><Download className="h-4 w-4" /> Download template</button>

          <button onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-sage-300 py-8 text-sage-500 transition hover:border-brand-400 hover:text-brand-600 dark:border-sage-700">
            <FileSpreadsheet className="h-8 w-8" />
            <span className="text-sm font-medium">{rows ? `${rows.length} products ready` : "Choose a CSV file"}</span>
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />

          {rows && (
            <div className="max-h-40 overflow-auto rounded-xl border border-sage-200 text-xs dark:border-sage-800">
              <table className="w-full">
                <thead><tr className="bg-sage-50 text-left text-sage-400 dark:bg-sage-950">
                  <th className="px-2 py-1 font-medium">Name</th><th className="px-2 py-1 font-medium">Category</th><th className="px-2 py-1 font-medium">Strength</th></tr></thead>
                <tbody>
                  {rows.slice(0, 8).map((r, i) => (
                    <tr key={i} className="border-t border-sage-100 dark:border-sage-800/60">
                      <td className="px-2 py-1 text-sage-800 dark:text-sage-100">{r.name}</td>
                      <td className="px-2 py-1 text-sage-500">{r.category || "—"}</td>
                      <td className="px-2 py-1 text-sage-500">{r.strength || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 8 && <div className="px-2 py-1 text-sage-400">…and {rows.length - 8} more</div>}
            </div>
          )}

          {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
          <div className="flex justify-end gap-2">
            <button className="btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={doImport} disabled={busy || !rows}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import {rows ? `${rows.length}` : ""}
            </button>
          </div>
        </div>
      )}
    </Modal>
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

  const [confirmCat, setConfirmCat] = useState(null);
  const deactivate = (c) => setConfirmCat(c);
  const doDeactivateCat = async () => {
    try { await api(`/api/categories/${confirmCat.id}`, { method: "DELETE" }); setConfirmCat(null); load(); onChanged && onChanged(); }
    catch (e) { setErr(e.message); setConfirmCat(null); }
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
      {confirmCat && (
        <ConfirmModal danger title="Deactivate category" confirmLabel="Deactivate"
          message={`"${confirmCat.name}" will be hidden from pickers. Products keep their link.`}
          onConfirm={doDeactivateCat} onClose={() => setConfirmCat(null)} />
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

// Physical count: enter what's on the shelf, the system reconciles the difference.
// Leave a product blank to skip it (no change). Only counted rows are submitted.
function StockCountModal({ products, onClose, onDone }) {
  const [q, setQ] = useState("");
  const [counts, setCounts] = useState({}); // product_id -> string
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = t
      ? products.filter((p) => [p.name, p.generic_name, p.barcode].filter(Boolean).some((v) => String(v).toLowerCase().includes(t)))
      : products;
    return base.slice(0, 200);
  }, [products, q]);

  const entered = useMemo(
    () => Object.entries(counts).filter(([, v]) => v !== "" && v != null && !Number.isNaN(Number(v))),
    [counts]
  );
  const discrepancies = entered.filter(([pid, v]) => {
    const p = products.find((x) => String(x.id) === String(pid));
    return p && Number(v) !== Number(p.stock);
  }).length;

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!entered.length) { setErr("Enter a counted quantity for at least one product."); return; }
    setBusy(true);
    try {
      const items = entered.map(([product_id, counted_qty]) => ({ product_id: Number(product_id), counted_qty: Number(counted_qty) }));
      const r = await api("/api/stock-counts", { method: "POST", body: { items, note: note || null } });
      setResult(r);
    } catch (e2) {
      setErr(e2.message || "Could not post the count.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Stock-take</h3>
            <p className="mt-0.5 text-sm text-sage-500 dark:text-sage-400">
              Count the shelf, enter the figure — the system corrects the difference. Blank = skip.
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2"><X className="h-5 w-5" /></button>
        </div>

        {result ? (
          <div className="space-y-4 py-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-brand-500" />
            <div>
              <div className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Count posted</div>
              <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">
                {result.items_counted} product{result.items_counted === 1 ? "" : "s"} counted ·
                stock value change {money(result.variance_value)}
              </p>
            </div>
            <button className="btn-primary mx-auto" onClick={onDone}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sage-400" />
              <input className="input pl-10" placeholder="Filter products to count…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-sage-200 dark:border-sage-800">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-sage-50 text-xs uppercase tracking-wide text-sage-500 dark:bg-sage-900 dark:text-sage-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Product</th>
                    <th className="px-3 py-2 text-right font-medium">System</th>
                    <th className="px-3 py-2 text-right font-medium">Counted</th>
                    <th className="px-3 py-2 text-right font-medium">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sage-100 dark:divide-sage-800">
                  {list.length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-8 text-center text-sage-400">No products match "{q}".</td></tr>
                  )}
                  {list.map((p) => {
                    const raw = counts[p.id];
                    const has = raw !== "" && raw != null && !Number.isNaN(Number(raw));
                    const v = has ? Number(raw) - Number(p.stock) : null;
                    return (
                      <tr key={p.id} className="hover:bg-sage-50/60 dark:hover:bg-sage-900/40">
                        <td className="px-3 py-1.5">
                          <div className="font-medium text-sage-800 dark:text-sage-100">{p.name}</div>
                          {p.generic_name && <div className="text-xs text-sage-400">{p.generic_name}</div>}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-sage-600 dark:text-sage-300">{p.stock}</td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            type="number" min="0" inputMode="numeric"
                            className="input !w-24 !py-1 text-right"
                            value={raw ?? ""}
                            onChange={(e) => setCounts((c) => ({ ...c, [p.id]: e.target.value }))}
                            placeholder="—"
                          />
                        </td>
                        <td className={"px-3 py-1.5 text-right tabular-nums font-medium " + (v == null ? "text-sage-300" : v === 0 ? "text-sage-400" : v > 0 ? "text-brand-600 dark:text-brand-400" : "text-rose-600 dark:text-rose-400")}>
                          {v == null ? "—" : v > 0 ? `+${v}` : v}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 space-y-3">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional) — e.g. monthly count, aisle 3" />
              {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-sage-500 dark:text-sage-400">
                  {entered.length} counted · <span className={discrepancies ? "font-medium text-amber-600 dark:text-amber-400" : ""}>{discrepancies} discrepanc{discrepancies === 1 ? "y" : "ies"}</span>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={busy || !entered.length}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} Post count
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Barcode preview, generate (in-store EAN-13), and print price/barcode labels.
function BarcodeModal({ product, settings, onClose, onChanged }) {
  const [code, setCode] = useState(product.barcode || "");
  const [prefix, setPrefix] = useState(settings?.barcode_prefix || "");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const generate = async () => {
    setBusy(true); setErr("");
    try {
      const { barcode } = await api("/api/barcode/generate", { method: "POST", body: { product_id: product.id, name: product.name, prefix } });
      setCode(barcode);
      onChanged && onChanged();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Barcode · ${product.name}`} onClose={onClose}>
      <div className="space-y-4">
        {code ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-sage-200 bg-white p-4 dark:border-sage-800">
            <div className="[&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: barcodeSVG(code) }} />
          </div>
        ) : (
          <p className="rounded-xl bg-sage-50 px-4 py-6 text-center text-sm text-sage-500 dark:bg-sage-900 dark:text-sage-400">
            No barcode yet. Generate an in-store barcode to print and stick on the product.
          </p>
        )}

        {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Prefix (blank = numeric)">
            <input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. PAR, RMD or {name}" />
          </Field>
          <Field label="Labels to print">
            <input type="number" min="1" max="200" className="input" value={qty} onChange={(e) => setQty(e.target.value)} disabled={!code} />
          </Field>
        </div>
        <p className="-mt-1 text-xs text-sage-400">
          Letters need CODE128 (numeric stays EAN-13). <code>{"{name}"}</code> uses the product name → e.g. <b>{("PAR" )}…</b>. Then press Regenerate.
        </p>

        <div className="flex items-center gap-2">
          <div className="flex-1" />
          <button type="button" className="btn-outline" onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {code ? "Regenerate" : "Generate"}
          </button>
          <button type="button" className="btn-primary" onClick={() => printBarcodeLabels({ ...product, barcode: code }, qty, settings)} disabled={!code}>
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </div>
    </Modal>
  );
}
