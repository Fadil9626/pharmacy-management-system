import JsBarcode from "jsbarcode";
import { money } from "./money.js";
import { openPrint } from "./printing.js";

// Render a barcode to an SVG string. Tries EAN-13 (store-generated codes), and
// falls back to CODE128 for anything that isn't a valid 13-digit EAN — both are
// read by standard retail scanners.
export function barcodeSVG(value, opts = {}) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const base = { displayValue: true, fontSize: 14, height: 38, margin: 6, width: 2, ...opts };
  const isEAN13 = /^\d{13}$/.test(String(value));
  try {
    JsBarcode(svg, String(value), { format: isEAN13 ? "EAN13" : "CODE128", ...base });
  } catch (_) {
    JsBarcode(svg, String(value), { format: "CODE128", ...base });
  }
  return new XMLSerializer().serializeToString(svg);
}

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// Print N price/barcode labels for a product on the configured label stock.
export function printBarcodeLabels(product, qty, settings = {}) {
  const n = Math.max(1, Math.min(Number(qty) || 1, 200));
  if (!product.barcode) return;
  const [w, h] = String(settings.label_size || "50x30").split("x").map(Number);
  const widthMm = w || 50;
  const heightMm = h || 30;
  // Size the bars to the label width so they stay scannable on small stock.
  const svg = barcodeSVG(product.barcode, { width: widthMm >= 50 ? 1.6 : 1.2, height: widthMm >= 50 ? 34 : 26, fontSize: 12, margin: 2 });

  const label = `
    <section class="lbl">
      ${settings.pharmacy_name ? `<div class="nm">${esc(settings.pharmacy_name)}</div>` : ""}
      <div class="pr">${esc(product.name)}${product.last_price ? ` — ${esc(money(product.last_price))}` : ""}</div>
      <div class="bc">${svg}</div>
    </section>`;

  const html = `<style>
    @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #000; font: 9px/1.2 Arial, sans-serif; -webkit-print-color-adjust: exact; }
    .lbl { width: ${widthMm}mm; height: ${heightMm}mm; padding: 1mm; overflow: hidden; page-break-after: always;
           display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    .nm { font-size: 7px; text-transform: uppercase; letter-spacing: .3px; }
    .pr { font-size: 9px; font-weight: 600; margin: 1px 0; line-height: 1.1; max-height: 2.2em; overflow: hidden; }
    .bc svg { max-width: 100%; height: auto; }
  </style><body>${Array.from({ length: n }, () => label).join("")}</body></html>`;

  openPrint(html, `Barcodes — ${product.name}`);
}
