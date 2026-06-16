import { useState } from "react";
import { CheckCircle2, X, Printer, Usb } from "lucide-react";
import { money } from "../lib/money.js";
import { printReceipt } from "../lib/printing.js";
import { usbSupported, printReceiptUSB } from "../lib/escpos.js";

// Shared receipt — used by POS (fresh sale) and Sales History (reprint).
export default function ReceiptModal({ receipt, cashier, branch, settings, onClose, title = "Sale complete" }) {
  const name = settings?.pharmacy_name || "Remedy Pharmacy";
  const footer = settings?.receipt_footer || "Thank you — get well soon.";
  const taxPct = Number(settings?.tax_percent || 0);
  const [usbErr, setUsbErr] = useState("");

  const ctx = { cashier, branch };
  const doPrint = () => printReceipt(receipt, settings, ctx);
  const doUsb = async () => {
    setUsbErr("");
    try { await printReceiptUSB(receipt, settings, ctx); }
    catch (e) { if (e?.name !== "NotFoundError") setUsbErr(e.message || "USB print failed"); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sage-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-sm">
        <div className="flex items-center justify-between border-b border-sage-200 px-5 py-4 dark:border-sage-800">
          <div className="flex items-center gap-2 text-brand-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-display text-lg font-semibold text-sage-900 dark:text-sage-50">{title}</span>
          </div>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2"><X className="h-5 w-5" /></button>
        </div>

        {receipt.offline && (
          <div className="mx-5 mt-4 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            Saved offline — will sync and get its receipt number when you reconnect.
          </div>
        )}
        <div id="receipt" className="px-6 py-5 text-sm">
          <div className="text-center">
            {settings?.logo && <img src={settings.logo} alt="" className="mx-auto mb-2 h-12 w-12 object-contain" />}
            <div className="font-display text-xl font-semibold text-sage-900 dark:text-sage-50">{name}</div>
            <div className="text-xs text-sage-400">{branch || receipt.branch_name || "Main Branch"}</div>
            {settings?.address && <div className="text-xs text-sage-400">{settings.address}</div>}
            {settings?.phone && <div className="text-xs text-sage-400">{settings.phone}</div>}
            {settings?.receipt_header && <div className="mt-1 whitespace-pre-line text-xs text-sage-500 dark:text-sage-400">{settings.receipt_header}</div>}
            <div className="mt-2 text-xs text-sage-500 dark:text-sage-400">
              {receipt.receipt_no} · {new Date(receipt.created_at).toLocaleString()}
            </div>
            {receipt.customer_name && (
              <div className="text-xs text-sage-500 dark:text-sage-400">Customer: {receipt.customer_name}</div>
            )}
          </div>

          <div className="my-4 border-t border-dashed border-sage-300 dark:border-sage-700" />

          <div className="space-y-1.5">
            {(receipt.items || []).map((it, i) => (
              <div key={i} className="flex justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-sage-700 dark:text-sage-200">
                  {it.name} <span className="text-sage-400">×{it.qty}</span>
                </span>
                <span className="text-sage-900 dark:text-sage-50">{money(it.line_total)}</span>
              </div>
            ))}
          </div>

          <div className="my-4 border-t border-dashed border-sage-300 dark:border-sage-700" />

          <div className="space-y-1">
            <Row label="Subtotal" value={money(receipt.subtotal)} muted />
            {(receipt.promotions || []).map((p, i) => (
              <Row key={i} label={p.name} value={`−${money(p.amount)}`} muted />
            ))}
            {(receipt.discount - (receipt.promo_discount || 0)) > 0 && (
              <Row label="Discount" value={`−${money(receipt.discount - (receipt.promo_discount || 0))}`} muted />
            )}
            {receipt.tax > 0 && <Row label={`Tax${taxPct ? ` (${taxPct}%)` : ""}`} value={money(receipt.tax)} muted />}
            <Row label="Total" value={money(receipt.total)} bold />
            {receipt.amount_paid != null && <Row label="Paid" value={money(receipt.amount_paid)} muted />}
            {receipt.change != null && <Row label="Change" value={money(receipt.change)} />}
          </div>

          <div className="mt-4 text-center text-xs text-sage-400">
            Served by {cashier || receipt.cashier || "—"} · {receipt.payment_method}
            {receipt.fx_rate && (
              <div className="mt-1">Rate: 1 {receipt.fx_base} = {Number(receipt.fx_rate).toLocaleString()} {settings?.currency_code || ""}</div>
            )}
            <div className="mt-1">{footer}</div>
          </div>
        </div>

        {usbErr && <div className="px-4 pt-2 text-xs text-rose-600 dark:text-rose-400">{usbErr}</div>}
        <div className="flex gap-2 border-t border-sage-200 p-4 dark:border-sage-800">
          <button onClick={doPrint} className="btn-outline flex-1">
            <Printer className="h-4 w-4" /> Print
          </button>
          {usbSupported() && (
            <button onClick={doUsb} className="btn-outline !px-3" title="Print direct to a USB thermal printer (ESC/POS)">
              <Usb className="h-4 w-4" />
            </button>
          )}
          <button onClick={onClose} className="btn-primary flex-1">Close</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, muted }) {
  return (
    <div className={`flex justify-between ${bold ? "text-base font-semibold text-sage-900 dark:text-sage-50" : muted ? "text-sage-500 dark:text-sage-400" : "font-medium text-brand-600 dark:text-brand-400"}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
