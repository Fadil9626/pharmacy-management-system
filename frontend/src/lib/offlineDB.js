// Minimal IndexedDB wrapper for offline POS: a key/value store for the cached
// sellable catalogue, and a queue store for sales rung up while offline.
const DB_NAME = "remedy-offline";
const VERSION = 1;

let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv", { keyPath: "k" });
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "uuid" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const out = fn(s);
        t.oncomplete = () => resolve(out._result !== undefined ? out._result : out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

const wrap = (req, holder) => { req.onsuccess = () => { holder._result = req.result; }; return holder; };

// ── Catalogue cache ─────────────────────────────────────────
export const cacheCatalogue = (products) =>
  tx("kv", "readwrite", (s) => { s.put({ k: "pos-products", data: products, at: Date.now() }); return {}; }).catch(() => {});

export const loadCachedCatalogue = () =>
  tx("kv", "readonly", (s) => wrap(s.get("pos-products"), {})).then((r) => r?.data || null).catch(() => null);

// ── Offline sale queue ──────────────────────────────────────
export const queueSale = (sale) =>
  tx("queue", "readwrite", (s) => { s.put(sale); return {}; });

export const queuedSales = () =>
  tx("queue", "readonly", (s) => wrap(s.getAll(), {})).then((r) => r || []).catch(() => []);

export const dequeueSale = (uuid) =>
  tx("queue", "readwrite", (s) => { s.delete(uuid); return {}; });

export const queueCount = () =>
  tx("queue", "readonly", (s) => wrap(s.count(), {})).then((r) => r || 0).catch(() => 0);
