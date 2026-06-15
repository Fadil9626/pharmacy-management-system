import { money } from "./money.js";

// ── Thermal receipts & dispensing labels ────────────────────────────────────
// We print through a dedicated pop-up window with its own @page size rather than
// the app's screen CSS. That gives pixel control over narrow thermal rolls
// (58/80 mm) and small label stock, and prints correctly on a normal printer too.

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function openPrint(html, title) {
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) {
    alert("Pop-up blocked — allow pop-ups for Remedy to print.");
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${html}</head>`);
  w.document.close();
  w.focus();
  // Give images/fonts a beat to lay out, then print. Close after (or on cancel).
  setTimeout(() => {
    w.print();
    w.onafterprint = () => w.close();
    setTimeout(() => { try { if (!w.closed) w.close(); } catch (_) {} }, 1500);
  }, 250);
}

// ── Receipt ─────────────────────────────────────────────────────────────────
export function receiptHTML(receipt, settings = {}, ctx = {}) {
  const widthMm = String(settings.receipt_paper) === "58" ? 58 : 80;
  const pad = widthMm === 58 ? 2 : 3;
  const name = settings.pharmacy_name || "Remedy Pharmacy";
  const footer = settings.receipt_footer || "Thank you — get well soon.";
  const taxPct = Number(settings.tax_percent || 0);
  const cur = settings.currency_code || "";

  const line = (l, r, cls = "") =>
    `<div class="row ${cls}"><span class="l">${esc(l)}</span><span class="r">${esc(r)}</span></div>`;

  const items = (receipt.items || [])
    .map((it) => `<div class="row item"><span class="l">${esc(it.name)} ×${esc(it.qty)}</span><span class="r">${esc(money(it.line_total))}</span></div>`)
    .join("");

  const body = `
    <div class="c">
      ${settings.logo ? `<img class="logo" src="${settings.logo}" alt="">` : ""}
      <div class="name">${esc(name)}</div>
      <div class="sm">${esc(ctx.branch || receipt.branch_name || "Main Branch")}</div>
      ${settings.address ? `<div class="sm">${esc(settings.address)}</div>` : ""}
      ${settings.phone ? `<div class="sm">${esc(settings.phone)}</div>` : ""}
      ${settings.receipt_header ? `<div class="sm pre">${esc(settings.receipt_header)}</div>` : ""}
      <div class="sm mt">${esc(receipt.receipt_no || "")} · ${esc(new Date(receipt.created_at || Date.now()).toLocaleString())}</div>
      ${receipt.customer_name ? `<div class="sm">Customer: ${esc(receipt.customer_name)}</div>` : ""}
    </div>
    <div class="hr"></div>
    ${items}
    <div class="hr"></div>
    ${line("Subtotal", money(receipt.subtotal))}
    ${receipt.discount > 0 ? line("Discount", "-" + money(receipt.discount)) : ""}
    ${receipt.tax > 0 ? line(`Tax${taxPct ? ` (${taxPct}%)` : ""}`, money(receipt.tax)) : ""}
    ${line("TOTAL", money(receipt.total), "tot")}
    ${receipt.amount_paid != null ? line("Paid", money(receipt.amount_paid)) : ""}
    ${receipt.change != null ? line("Change", money(receipt.change)) : ""}
    <div class="c sm mt">
      Served by ${esc(ctx.cashier || receipt.cashier || "—")} · ${esc(receipt.payment_method || "")}
      ${receipt.fx_rate ? `<div>Rate: 1 ${esc(receipt.fx_base)} = ${esc(Number(receipt.fx_rate).toLocaleString())} ${esc(cur)}</div>` : ""}
      <div class="mt">${esc(footer)}</div>
    </div>`;

  return `<style>
    @page { size: ${widthMm}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { width: ${widthMm}mm; margin: 0; padding: ${pad}mm; color: #000;
           font: 12px/1.35 "Courier New", ui-monospace, monospace; -webkit-print-color-adjust: exact; }
    .c { text-align: center; }
    .name { font-size: 15px; font-weight: 700; }
    .sm { font-size: 10px; }
    .pre { white-space: pre-line; }
    .mt { margin-top: 4px; }
    .logo { width: 44px; height: 44px; object-fit: contain; margin: 0 auto 4px; display: block; }
    .hr { border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; gap: 6px; }
    .row .l { flex: 1; min-width: 0; word-break: break-word; }
    .row .r { white-space: nowrap; }
    .item { font-size: 12px; }
    .tot { font-size: 14px; font-weight: 700; margin-top: 2px; }
  </style><body>${body}</body></html>`;
}

export function printReceipt(receipt, settings, ctx) {
  openPrint(receiptHTML(receipt, settings, ctx), `Receipt ${receipt.receipt_no || ""}`);
}

// ── Dispensing labels ───────────────────────────────────────────────────────
// One label per drug. `labels` = [{ drug, directions, qty, warnings:[] }], plus
// shared header fields (patient, prescriber, rx_number, date).
export function labelsHTML(labels, header = {}, settings = {}) {
  const [w, h] = String(settings.label_size || "50x30").split("x").map(Number);
  const widthMm = w || 50;
  const heightMm = h || 30;
  const pharmacy = settings.pharmacy_name || "Remedy Pharmacy";
  const date = new Date(header.date || Date.now()).toLocaleDateString();

  const one = (lb) => `
    <section class="label">
      <div class="ph">${esc(pharmacy)}${settings.phone ? " · " + esc(settings.phone) : ""}</div>
      <div class="pt">${esc(header.patient_name || "")}</div>
      <div class="dr">${esc(lb.drug)}${lb.qty ? ` <span class="qty">(Qty ${esc(lb.qty)})</span>` : ""}</div>
      ${lb.directions ? `<div class="sig">${esc(lb.directions)}</div>` : ""}
      ${(lb.warnings && lb.warnings.length) ? `<div class="warn">${lb.warnings.map(esc).join(" · ")}</div>` : ""}
      <div class="ft">
        <span>${esc(header.rx_number || "")}</span>
        <span>${esc(date)}</span>
      </div>
      ${header.prescriber_name ? `<div class="ft"><span>Dr ${esc(header.prescriber_name)}</span><span></span></div>` : ""}
    </section>`;

  return `<style>
    @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #000; font: 9px/1.25 "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; }
    .label { width: ${widthMm}mm; height: ${heightMm}mm; padding: 2mm; overflow: hidden;
             page-break-after: always; display: flex; flex-direction: column; }
    .ph { font-size: 7px; text-transform: uppercase; letter-spacing: .3px; color: #000; }
    .pt { font-weight: 700; font-size: 11px; margin-top: 1px; }
    .dr { font-size: 10px; font-weight: 600; margin-top: 1px; }
    .qty { font-weight: 400; }
    .sig { font-size: 11px; margin-top: 1px; }
    .warn { font-size: 7px; font-style: italic; margin-top: auto; }
    .ft { display: flex; justify-content: space-between; font-size: 7px; color: #000; }
  </style><body>${labels.map(one).join("")}</body></html>`;
}

export function printLabels(labels, header, settings) {
  if (!labels || !labels.length) return;
  openPrint(labelsHTML(labels, header, settings), `Labels ${header?.rx_number || ""}`);
}

// Standard cautionary text every dispensed item should carry.
export const baseWarnings = (controlled = false) =>
  [
    "Keep out of reach of children",
    controlled ? "Controlled drug — do not exceed dose" : null,
  ].filter(Boolean);
