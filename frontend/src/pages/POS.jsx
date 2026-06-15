import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { money } from "../lib/money.js";
import ReceiptModal from "../components/Receipt.jsx";
import { cacheCatalogue, loadCachedCatalogue, queueSale, queueCount } from "../lib/offlineDB.js";
import { syncQueue } from "../lib/offlineSync.js";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Loader2, CheckCircle2, X,
  ShieldAlert, Banknote, CreditCard, Smartphone, ScanLine, HandCoins, Wallet, Lock,
  PauseCircle, Clock3, PlayCircle, Wifi, WifiOff, RefreshCw, CloudOff, Maximize2, Minimize2,
} from "lucide-react";

const uuid = () =>
  (crypto.randomUUID && crypto.randomUUID()) ||
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const PAYMENTS = [
  { key: "cash", label: "Cash", icon: Banknote },
  { key: "card", label: "Card", icon: CreditCard },
  { key: "mobile", label: "Mobile", icon: Smartphone },
];

export default function POS() {
  const { user, settings, moduleEnabled, can } = useAuth();
  const customersOn = moduleEnabled("customers");
  const canDiscount = can("pos.discount");
  const canAccount = can("pos.account");
  const financeOn = moduleEnabled("finance");
  const controlledOn = moduleEnabled("controlled_drugs");
  const [shift, setShift] = useState(undefined); // undefined=checking, null=none, obj=open
  const [prescriber, setPrescriber] = useState({ name: "", license: "" });
  const [products, setProducts] = useState(null);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState([]); // {id, name, price, unit, stock, qty, is_controlled}
  const [discount, setDiscount] = useState("");
  const [payment, setPayment] = useState("cash");
  const [customer, setCustomer] = useState("");        // free-text name (walk-in)
  const [custId, setCustId] = useState(null);          // registered customer
  const [custObj, setCustObj] = useState(null);        // {name, balance, credit_limit}
  const [custQuery, setCustQuery] = useState("");
  const [custResults, setCustResults] = useState([]);
  const [tendered, setTendered] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [split, setSplit] = useState({ cash: "", card: "", mobile: "", account: "", loyalty: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [showParked, setShowParked] = useState(false);
  const [showHold, setShowHold] = useState(false);
  const [parkedCount, setParkedCount] = useState(0);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [fromCache, setFromCache] = useState(false); // catalogue served from offline cache
  const [pending, setPending] = useState(0);         // queued offline sales
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [isFs, setIsFs] = useState(false);
  const searchRef = useRef(null);
  const posRef = useRef(null);

  // Full-screen the till (browser Fullscreen API — needs a click to start).
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else posRef.current?.requestFullscreen?.().catch(() => {});
  };

  const loadParked = () => api("/api/pos/parked").then((r) => setParkedCount(r.length)).catch(() => {});

  const doPark = async (label) => {
    try {
      await api("/api/pos/park", { method: "POST", body: {
        items: cart, discount: disc, customer_id: custId || null, customer_name: customer || null,
        customer: custObj || null, label: label || null,
      } });
      setCart([]); setDiscount(""); clearCustomer(); setTendered(""); setShowHold(false);
      loadParked();
    } catch (e) { setErr(e.message); setShowHold(false); }
  };

  const resume = async (held) => {
    setCart(held.cart.items || []);
    setDiscount(held.cart.discount ? String(held.cart.discount) : "");
    if (held.customer_id) { setCustId(held.customer_id); setCustObj(held.cart.customer || null); setCustomer(held.customer_name || ""); }
    else setCustomer(held.customer_name || "");
    await api(`/api/pos/parked/${held.id}`, { method: "DELETE" }).catch(() => {});
    setShowParked(false);
    loadParked();
  };

  // Customer search (registered customers, when the module is on)
  useEffect(() => {
    if (!customersOn || custId) return;
    const t = custQuery.trim();
    if (!t) { setCustResults([]); return; }
    const h = setTimeout(() => {
      api("/api/customers", { params: { q: t } }).then((r) => setCustResults(r.slice(0, 6))).catch(() => {});
    }, 200);
    return () => clearTimeout(h);
  }, [custQuery, customersOn, custId]);

  const pickCustomer = (c) => {
    setCustId(c.id);
    setCustObj(c);
    setCustomer(c.name);
    setCustQuery("");
    setCustResults([]);
  };
  const clearCustomer = () => {
    setCustId(null); setCustObj(null); setCustomer(""); setCustQuery("");
    if (payment === "account") setPayment("cash");
  };

  const load = () =>
    api("/api/pos/products")
      .then((p) => { setProducts(p); setFromCache(false); cacheCatalogue(p); })
      .catch(async (e) => {
        // Offline (or server unreachable): fall back to the last cached catalogue
        // so the till can keep selling.
        const cached = await loadCachedCatalogue();
        if (cached) { setProducts(cached); setFromCache(true); }
        else setErr(e.message);
      });
  const checkShift = () => {
    if (!financeOn) { setShift(null); return; }
    api("/api/finance/shift/current").then((r) => setShift(r.shift || null)).catch(() => setShift(null));
  };

  const refreshPending = () => queueCount().then(setPending);

  const sync = async (silent = false) => {
    if (syncing) return;
    const n = await queueCount();
    if (!n) { if (!silent) setSyncMsg("Nothing to sync."); return; }
    setSyncing(true); setSyncMsg("");
    try {
      const r = await syncQueue(api);
      await refreshPending();
      if (r.synced || r.failed.length) load(); // refresh stock after server processed
      const parts = [];
      if (r.synced) parts.push(`${r.synced} synced`);
      if (r.failed.length) parts.push(`${r.failed.length} rejected (review Sales)`);
      if (r.remaining) parts.push(`${r.remaining} still queued`);
      setSyncMsg(parts.join(" · ") || "Synced.");
    } catch (e) {
      setSyncMsg("Couldn't reach the server — still offline.");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(""), 5000);
    }
  };

  useEffect(() => {
    load();
    checkShift();
    loadParked();
    refreshPending();
    searchRef.current?.focus();
  }, []);

  // Track connectivity; auto-sync the offline queue when we come back online.
  useEffect(() => {
    const goOnline = () => { setOnline(true); load(); checkShift(); sync(true); };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    if (navigator.onLine) sync(true); // flush anything left from a previous session
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []); // eslint-disable-line

  const filtered = useMemo(() => {
    if (!products) return [];
    const term = q.trim().toLowerCase();
    const list = term
      ? products.filter((p) =>
          [p.name, p.generic_name, p.category, p.barcode]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(term))
        )
      : products;
    return list.slice(0, 60);
  }, [products, q]);

  const inCart = (id) => cart.find((c) => c.id === id)?.qty || 0;

  const addToCart = (p) => {
    if (p.stock <= 0) return;
    setErr("");
    setCart((prev) => {
      const ex = prev.find((c) => c.id === p.id);
      if (ex) {
        if (ex.qty >= p.stock) return prev;
        return prev.map((c) => (c.id === p.id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { id: p.id, name: p.name, price: p.price, unit: p.unit, stock: p.stock, qty: 1, is_controlled: p.is_controlled }];
    });
  };

  const setQty = (id, qty) =>
    setCart((prev) =>
      prev.flatMap((c) => {
        if (c.id !== id) return [c];
        const n = Math.max(0, Math.min(qty, c.stock));
        return n === 0 ? [] : [{ ...c, qty: n }];
      })
    );

  const removeLine = (id) => setCart((prev) => prev.filter((c) => c.id !== id));

  const onSearchKey = (e) => {
    if (e.key !== "Enter") return;
    const term = q.trim().toLowerCase();
    if (!term) return;
    const exact = products?.find((p) => p.barcode && p.barcode.toLowerCase() === term);
    const pick = exact || filtered[0];
    if (pick && pick.stock > 0) {
      addToCart(pick);
      setQ("");
    }
  };

  const taxPct = Number(settings?.tax_percent || 0);
  const subtotal = cart.reduce((s, c) => s + c.qty * c.price, 0);
  const disc = Math.max(0, Math.min(Number(discount) || 0, subtotal));
  const taxable = subtotal - disc;
  const tax = Math.round(taxable * (taxPct / 100) * 100) / 100;
  const total = taxable + tax;
  const tend = Number(tendered) || 0;
  const change = !splitMode && payment === "cash" && tend > 0 ? Math.max(0, tend - total) : null;
  const short = !splitMode && payment === "cash" && tendered !== "" && tend < total;
  // Split payment tallies
  const splitSum = Math.round((["cash", "card", "mobile", "account", "loyalty"].reduce((s, k) => s + (Number(split[k]) || 0), 0)) * 100) / 100;
  const splitRemaining = Math.round((total - splitSum) * 100) / 100;
  const splitOk = splitMode && Math.abs(splitRemaining) < 0.01 && splitSum > 0;
  const accountPortion = splitMode ? (Number(split.account) || 0) : (payment === "account" ? total : 0);
  // Loyalty redemption
  const redeemValue = Number(settings?.loyalty_redeem_value || 0);
  const loyaltyOn = redeemValue > 0 && custObj && Number(custObj.loyalty_points) > 0;
  const pointsValue = custObj ? Number(custObj.loyalty_points) * redeemValue : 0;
  // On-account credit headroom check (mirrors the server rule)
  const overLimit = accountPortion > 0 && custObj && Number(custObj.credit_limit) > 0 &&
    Number(custObj.balance) + accountPortion > Number(custObj.credit_limit) + 1e-9;
  // Controlled-drug compliance gate (mirrors the server rule)
  const hasControlled = controlledOn && cart.some((c) => c.is_controlled);
  const controlledBlocked = hasControlled && (!prescriber.license.trim() || !(custId || customer.trim()));

  const resetSale = () => {
    setCart([]);
    setDiscount("");
    clearCustomer();
    setTendered("");
    setSplitMode(false);
    setSplit({ cash: "", card: "", mobile: "", account: "", loyalty: "" });
    setPrescriber({ name: "", license: "" });
    searchRef.current?.focus();
  };

  // Build a local receipt for an offline sale (server assigns the real one later).
  const provisionalReceipt = (payload) => ({
    receipt_no: "OFFLINE",
    created_at: Date.now(),
    items: cart.map((c) => ({ name: c.name, qty: c.qty, line_total: c.qty * c.price })),
    subtotal, discount: disc, tax, total,
    payment_method: splitMode ? "split" : payment,
    amount_paid: payload.amount_paid,
    change: payload.amount_paid != null ? Math.max(0, payload.amount_paid - total) : null,
    customer_name: customer || (custObj && custObj.name) || null,
    offline: true,
  });

  const checkout = async () => {
    if (cart.length === 0) return;
    setBusy(true);
    setErr("");
    const payments = splitMode
      ? ["cash", "card", "mobile", "account", "loyalty"].filter((k) => Number(split[k]) > 0).map((k) => ({ method: k, amount: Number(split[k]) }))
      : null;
    const payload = {
      client_uuid: uuid(),
      items: cart.map((c) => ({ product_id: c.id, qty: c.qty })),
      discount: disc,
      payment_method: payment,
      payments,
      customer_id: custId || null,
      customer_name: customer || null,
      amount_paid: !splitMode && payment === "cash" && tendered !== "" ? tend : null,
      prescriber_name: hasControlled ? prescriber.name || null : null,
      prescriber_license: hasControlled ? prescriber.license || null : null,
    };

    // Offline sale: queue it, decrement cached stock, hand over a provisional receipt.
    const goOffline = async (label) => {
      await queueSale({ uuid: payload.client_uuid, payload, label, at: Date.now() });
      setProducts((prev) => prev && prev.map((p) => {
        const line = cart.find((c) => c.id === p.id);
        return line ? { ...p, stock: Math.max(0, p.stock - line.qty) } : p;
      }));
      await refreshPending();
      setReceipt(provisionalReceipt(payload));
      resetSale();
    };

    try {
      if (!navigator.onLine) { await goOffline(customer || custObj?.name || "Walk-in"); return; }
      const res = await api("/api/sales", { method: "POST", body: payload });
      setReceipt(res);
      resetSale();
      load();
    } catch (e) {
      // A network error (server has no status) → fall back to the offline queue.
      if (e.status == null) { await goOffline(customer || custObj?.name || "Walk-in"); return; }
      if (e.data?.code === "NO_SHIFT") setShift(null); // surface the open-till gate
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Open-till gate: when Finance is licensed, the cashier must open a till first.
  // Skipped while offline (we can't verify the shift) — offline sales reconcile
  // against the server's open till at sync time.
  if (financeOn && shift === null && online) {
    return <OpenTill onOpened={(s) => setShift(s)} cashier={user?.full_name} />;
  }

  return (
    <div ref={posRef} className={isFs ? "h-screen overflow-y-auto bg-sage-50 p-4 dark:bg-sage-950" : ""}>
    <div className={`grid ${isFs ? "h-[calc(100vh-2rem)]" : "h-[calc(100vh-7rem)]"} grid-cols-1 gap-5 lg:grid-cols-[1fr_400px]`}>
      {/* Catalogue */}
      <div className="flex min-h-0 flex-col">
        {(!online || fromCache || pending > 0 || syncMsg) && (
          <div className={`mb-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
            online ? "border-sage-200 bg-white dark:border-sage-800 dark:bg-sage-900"
                   : "border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20"}`}>
            {online ? <Wifi className="h-4 w-4 text-brand-600" /> : <WifiOff className="h-4 w-4 text-amber-600" />}
            <span className={online ? "font-medium text-sage-700 dark:text-sage-200" : "font-medium text-amber-700 dark:text-amber-300"}>
              {online ? "Online" : "Offline — sales are saved on this device"}
            </span>
            {fromCache && <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"><CloudOff className="h-3 w-3" /> cached catalogue</span>}
            {pending > 0 && <span className="chip bg-sage-100 text-sage-600 dark:bg-sage-800 dark:text-sage-300">{pending} queued</span>}
            <div className="flex-1" />
            {syncMsg && <span className="text-xs text-sage-500 dark:text-sage-400">{syncMsg}</span>}
            {pending > 0 && (
              <button onClick={() => sync(false)} disabled={syncing || !online}
                className="btn-outline !px-3 !py-1 text-xs" title={online ? "Sync queued sales" : "Reconnect to sync"}>
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync now
              </button>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <ScanLine className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-500" />
            <input
              ref={searchRef}
              className="input py-3 pl-11 text-base"
              placeholder="Scan barcode or search a product, then press Enter…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onSearchKey}
            />
          </div>
          <button type="button" onClick={toggleFs} className="btn-outline shrink-0 !px-3.5" title={isFs ? "Exit full screen" : "Full screen"}>
            {isFs ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {!products ? (
            <div className="flex h-40 items-center justify-center text-sage-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p) => {
                const out = p.stock <= 0;
                const taken = inCart(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={out || taken >= p.stock}
                    className="card group relative flex flex-col p-3.5 text-left transition hover:border-brand-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {p.is_controlled && (
                      <ShieldAlert className="absolute right-2.5 top-2.5 h-4 w-4 text-rose-500" title="Controlled" />
                    )}
                    <div className="line-clamp-2 pr-4 text-sm font-semibold text-sage-900 dark:text-sage-50">
                      {p.name}
                    </div>
                    <div className="mt-0.5 text-xs text-sage-400">
                      {[p.strength, p.dosage_form].filter(Boolean).join(" · ") || p.category || " "}
                    </div>
                    <div className="mt-auto flex items-end justify-between pt-3">
                      <span className="text-base font-semibold text-brand-700 dark:text-brand-400">
                        {money(p.price)}
                      </span>
                      <span
                        className={`chip ${
                          out
                            ? "bg-sage-100 text-sage-400 dark:bg-sage-800 dark:text-sage-500"
                            : p.stock <= 10
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                            : "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                        }`}
                      >
                        {out ? "Out" : `${p.stock - taken} ${p.unit}`}
                      </span>
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className="col-span-full py-10 text-center text-sage-400">
                  No products match “{q}”.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cart / checkout */}
      <div className="card flex min-h-0 flex-col">
        <div className="flex items-center justify-between border-b border-sage-200 px-5 py-4 dark:border-sage-800">
          <div className="flex items-center gap-2 font-display text-lg font-semibold text-sage-900 dark:text-sage-50">
            <ShoppingCart className="h-5 w-5 text-brand-600" /> Current sale
          </div>
          <div className="flex items-center gap-3 text-xs font-medium">
            <button onClick={() => setShowParked(true)} className="flex items-center gap-1 text-sage-400 hover:text-brand-600">
              <Clock3 className="h-3.5 w-3.5" /> Held{parkedCount ? ` (${parkedCount})` : ""}
            </button>
            {cart.length > 0 && (
              <>
                <button onClick={() => setShowHold(true)} className="flex items-center gap-1 text-sage-400 hover:text-brand-600"><PauseCircle className="h-3.5 w-3.5" /> Hold</button>
                <button onClick={() => setCart([])} className="text-sage-400 hover:text-rose-500">Clear</button>
              </>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sage-400">
              <ShoppingCart className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">Scan or tap a product to start a sale.</p>
            </div>
          ) : (
            cart.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-sage-50 dark:hover:bg-sage-800/50">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-sage-900 dark:text-sage-50">{c.name}</div>
                  <div className="text-xs text-sage-400">{money(c.price)} × {c.qty}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setQty(c.id, c.qty - 1)} className="btn-ghost !p-1.5">
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <input
                    className="w-10 rounded-lg border border-sage-200 bg-transparent py-1 text-center text-sm dark:border-sage-700"
                    value={c.qty}
                    onChange={(e) => setQty(c.id, parseInt(e.target.value, 10) || 0)}
                  />
                  <button
                    onClick={() => setQty(c.id, c.qty + 1)}
                    disabled={c.qty >= c.stock}
                    className="btn-ghost !p-1.5 disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="w-16 text-right text-sm font-semibold text-sage-900 dark:text-sage-50">
                  {money(c.qty * c.price)}
                </div>
                <button onClick={() => removeLine(c.id)} className="btn-ghost !p-1.5 text-sage-400 hover:text-rose-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Totals + checkout */}
        <div className="space-y-3 border-t border-sage-200 px-5 py-4 dark:border-sage-800">
          {/* Customer */}
          {customersOn ? (
            custObj ? (
              <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm dark:border-brand-900/50 dark:bg-brand-900/20">
                <div className="min-w-0">
                  <div className="truncate font-medium text-brand-800 dark:text-brand-200">{custObj.name}</div>
                  <div className="text-xs text-brand-600/80 dark:text-brand-300/80">
                    Owes {money(custObj.balance)}{Number(custObj.credit_limit) > 0 ? ` · limit ${money(custObj.credit_limit)}` : ""}
                  </div>
                </div>
                <button onClick={clearCustomer} className="btn-ghost !px-2 !py-1"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="relative">
                <input className="input !py-2" placeholder="Find / add a customer (optional)" value={custQuery} onChange={(e) => setCustQuery(e.target.value)} />
                {custResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-sage-200 bg-white shadow-soft dark:border-sage-700 dark:bg-sage-900">
                    {custResults.map((c) => (
                      <button key={c.id} onClick={() => pickCustomer(c)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-sage-50 dark:hover:bg-sage-800">
                        <span className="text-sage-800 dark:text-sage-100">{c.name} <span className="text-xs text-sage-400">{c.phone || ""}</span></span>
                        {Number(c.balance) > 0 && <span className="text-xs text-amber-600">{money(c.balance)}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          ) : (
            <input className="input !py-2" placeholder="Customer (optional)" value={customer} onChange={(e) => setCustomer(e.target.value)} />
          )}

          {/* Controlled-drug compliance: prescriber details required */}
          {hasControlled && (
            <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 dark:border-rose-900/50 dark:bg-rose-950/30">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-300">
                <ShieldAlert className="h-3.5 w-3.5" /> Controlled item — prescriber required
              </div>
              <input className="input !py-2" placeholder="Prescriber name" value={prescriber.name}
                onChange={(e) => setPrescriber({ ...prescriber, name: e.target.value })} />
              <input className="input !py-2" placeholder="Prescriber license no. *" value={prescriber.license}
                onChange={(e) => setPrescriber({ ...prescriber, license: e.target.value })} />
              {!(custId || customer.trim()) && <div className="text-xs text-rose-600 dark:text-rose-400">A customer is also required.</div>}
            </div>
          )}

          <input
            type="number"
            min="0"
            disabled={!canDiscount}
            title={canDiscount ? "" : "You don't have permission to apply discounts"}
            className="input !py-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={canDiscount ? "Discount" : "Discount (not permitted)"}
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />

          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-sage-400">Payment</span>
            <button onClick={() => setSplitMode(!splitMode)}
              className={`text-xs font-medium ${splitMode ? "text-brand-600" : "text-sage-400 hover:text-brand-600"}`}>
              {splitMode ? "Single payment" : "Split payment"}
            </button>
          </div>

          {!splitMode ? (
            <>
              <div className={`grid gap-2 ${custId && canAccount ? "grid-cols-4" : "grid-cols-3"}`}>
                {[...PAYMENTS, ...(custId && canAccount ? [{ key: "account", label: "Account", icon: HandCoins }] : [])].map((p) => (
                  <button key={p.key} onClick={() => setPayment(p.key)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs font-medium transition ${
                      payment === p.key ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                        : "border-sage-200 text-sage-500 hover:bg-sage-50 dark:border-sage-700 dark:hover:bg-sage-800"}`}>
                    <p.icon className="h-4 w-4" /> {p.label}
                  </button>
                ))}
              </div>
              {payment === "cash" && (
                <input type="number" min="0" className="input !py-2" placeholder="Amount tendered"
                  value={tendered} onChange={(e) => setTendered(e.target.value)} />
              )}
            </>
          ) : (
            <div className="space-y-2 rounded-xl border border-sage-200 p-2.5 dark:border-sage-800">
              {["cash", "card", "mobile", ...(custId && canAccount ? ["account"] : []), ...(loyaltyOn ? ["loyalty"] : [])].map((m) => (
                <div key={m} className="flex items-center gap-2">
                  <span className="w-16 text-xs capitalize text-sage-500">{m}</span>
                  <input type="number" min="0" step="0.01" className="input !py-1.5 text-right" placeholder="0.00"
                    value={split[m]} onChange={(e) => setSplit({ ...split, [m]: e.target.value })} />
                  {m === "loyalty" && <button type="button" onClick={() => setSplit({ ...split, loyalty: String(Math.min(pointsValue, splitRemaining + (Number(split.loyalty) || 0)).toFixed(2)) })} className="shrink-0 text-[10px] text-brand-600" title={`${custObj.loyalty_points} pts ≈ ${money(pointsValue)}`}>use</button>}
                </div>
              ))}
              <div className={`flex justify-between pt-1 text-xs font-medium ${Math.abs(splitRemaining) < 0.01 ? "text-brand-600" : "text-amber-600"}`}>
                <span>{splitRemaining > 0 ? "Remaining" : splitRemaining < 0 ? "Over" : "Balanced"}</span>
                <span>{money(Math.abs(splitRemaining))}</span>
              </div>
            </div>
          )}

          <div className="space-y-1 rounded-xl bg-sage-50 p-3 text-sm dark:bg-sage-950">
            <div className="flex justify-between text-sage-500 dark:text-sage-400">
              <span>Subtotal</span><span>{money(subtotal)}</span>
            </div>
            {disc > 0 && (
              <div className="flex justify-between text-sage-500 dark:text-sage-400">
                <span>Discount</span><span>−{money(disc)}</span>
              </div>
            )}
            {tax > 0 && (
              <div className="flex justify-between text-sage-500 dark:text-sage-400">
                <span>Tax ({taxPct}%)</span><span>{money(tax)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-semibold text-sage-900 dark:text-sage-50">
              <span>Total</span><span>{money(total)}</span>
            </div>
            {change != null && (
              <div className="flex justify-between font-medium text-brand-600 dark:text-brand-400">
                <span>Change</span><span>{money(change)}</span>
              </div>
            )}
          </div>

          {short && <div className="text-sm text-amber-600 dark:text-amber-400">Amount tendered is less than the total.</div>}
          {splitMode && !splitOk && cart.length > 0 && <div className="text-sm text-amber-600 dark:text-amber-400">Split must add up to {money(total)}.</div>}
          {overLimit && <div className="text-sm text-rose-600 dark:text-rose-400">This sale exceeds the customer's credit limit.</div>}
          {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}

          <button onClick={checkout} disabled={busy || cart.length === 0 || short || overLimit || controlledBlocked || (splitMode && !splitOk)} className="btn-primary w-full !py-3 text-base">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : (!splitMode && payment === "account") ? <HandCoins className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
            {(!splitMode && payment === "account") ? "Charge to account" : "Complete sale"} · {money(total)}
          </button>
        </div>
      </div>

      {receipt && (
        <ReceiptModal receipt={receipt} cashier={user?.full_name} branch={user?.branch_name} settings={settings} onClose={() => setReceipt(null)} />
      )}
      {showParked && (
        <ParkedModal onClose={() => setShowParked(false)} onResume={resume} onChanged={loadParked} hasCart={cart.length > 0} />
      )}
      {showHold && (
        <HoldModal defaultLabel={customer} total={total} onClose={() => setShowHold(false)} onHold={doPark} />
      )}
    </div>
    </div>
  );
}

function HoldModal({ defaultLabel, total, onClose, onHold }) {
  const [label, setLabel] = useState(defaultLabel || "");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await onHold(label.trim());
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={submit} className="card relative z-10 w-full max-w-sm p-6">
        <div className="mb-4 flex items-center gap-2 text-brand-600">
          <PauseCircle className="h-5 w-5" />
          <h3 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Hold this sale</h3>
        </div>
        <p className="mb-4 text-sm text-sage-500 dark:text-sage-400">Set it aside ({money(total)}) and resume it later from “Held”.</p>
        <label className="label">Label <span className="font-normal text-sage-400">(optional)</span></label>
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. customer name or note" autoFocus />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />} Hold sale
          </button>
        </div>
      </form>
    </div>
  );
}

function ParkedModal({ onClose, onResume, onChanged, hasCart }) {
  const [list, setList] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const load = () => api("/api/pos/parked").then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const discard = async (id) => {
    await api(`/api/pos/parked/${id}`, { method: "DELETE" }).catch(() => {});
    setConfirmId(null);
    load(); onChanged && onChanged();
  };
  const resume = async (id) => {
    const held = await api(`/api/pos/parked/${id}`);
    onResume(held);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">Held sales</h3>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2"><X className="h-5 w-5" /></button>
        </div>
        {hasCart && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">Resuming replaces the current cart — hold it first if needed.</p>}
        {!list ? (
          <div className="flex h-24 items-center justify-center text-sage-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-sage-400">No held sales.</p>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {list.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-xl border border-sage-200 px-3 py-2.5 dark:border-sage-800">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-sage-900 dark:text-sage-50">{h.label || h.customer_name || `Hold #${h.id}`}</div>
                  <div className="text-xs text-sage-400">{h.item_count} items · {money(h.total)} · {new Date(h.created_at).toLocaleTimeString()}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  {confirmId === h.id ? (
                    <>
                      <button onClick={() => discard(h.id)} className="btn-ghost !px-2 !py-1.5 text-xs font-medium text-rose-500">Discard?</button>
                      <button onClick={() => setConfirmId(null)} className="btn-ghost !px-2 !py-1.5 text-xs text-sage-400">No</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => resume(h.id)} className="btn-primary !px-3 !py-1.5 text-xs"><PlayCircle className="h-3.5 w-3.5" /> Resume</button>
                      <button onClick={() => setConfirmId(h.id)} className="btn-ghost !px-2 !py-1.5 text-sage-400 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Shown before any sale when Finance is on and the cashier has no open till.
function OpenTill({ onOpened, cashier }) {
  const [float, setFloat] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const open = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const s = await api("/api/finance/shift/open", { method: "POST", body: { opening_float: Number(float) || 0 } });
      onOpened(s);
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <div className="flex h-[calc(100vh-7rem)] items-center justify-center">
      <form onSubmit={open} className="card w-full max-w-sm p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
          <Lock className="h-7 w-7" />
        </span>
        <h2 className="mt-4 font-display text-xl font-semibold text-sage-900 dark:text-sage-50">Open your till</h2>
        <p className="mt-1 text-sm text-sage-500 dark:text-sage-400">
          {cashier ? `${cashier.split(" ")[0]}, count` : "Count"} your starting cash float to begin selling.
        </p>
        <div className="mt-6 text-left">
          <label className="label flex items-center gap-1.5"><Wallet className="h-4 w-4 text-brand-600" /> Opening cash float</label>
          <input type="number" min="0" step="0.01" className="input text-lg" value={float} onChange={(e) => setFloat(e.target.value)} placeholder="0.00" autoFocus />
        </div>
        {err && <div className="mt-3 text-sm text-rose-600 dark:text-rose-400">{err}</div>}
        <button type="submit" className="btn-primary mt-6 w-full !py-3" disabled={busy}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} Open till & start selling
        </button>
      </form>
    </div>
  );
}
