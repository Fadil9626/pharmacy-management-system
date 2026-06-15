import { money } from "./money.js";

// ── Raw ESC/POS over WebUSB (optional, Chrome/Edge over HTTPS or localhost) ──
// True thermal printing: build ESC/POS bytes and stream them straight to a USB
// printer, no OS driver or print dialog. Best-effort — callers should fall back
// to printReceipt() (browser print) when this throws or isn't supported.

export const usbSupported = () => typeof navigator !== "undefined" && !!navigator.usb;

const ESC = 0x1b, GS = 0x1d;
const enc = new TextEncoder();

class Builder {
  constructor() { this.parts = []; }
  raw(arr) { this.parts.push(Uint8Array.from(arr)); return this; }
  text(s) { this.parts.push(enc.encode(String(s == null ? "" : s))); return this; }
  line(s = "") { return this.text(s + "\n"); }
  init() { return this.raw([ESC, 0x40]); }
  align(a) { return this.raw([ESC, 0x61, a === "center" ? 1 : a === "right" ? 2 : 0]); }
  bold(on) { return this.raw([ESC, 0x45, on ? 1 : 0]); }
  size(big) { return this.raw([GS, 0x21, big ? 0x11 : 0x00]); }
  feed(n = 3) { return this.raw([ESC, 0x64, n]); }
  cut() { return this.raw([GS, 0x56, 0x00]); }
  build() {
    const len = this.parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }
}

// Width in characters for the roll (58mm ≈ 32, 80mm ≈ 48).
const cols = (settings) => (String(settings.receipt_paper) === "58" ? 32 : 48);

function lineItem(left, right, width) {
  const r = String(right);
  const l = String(left);
  const space = Math.max(1, width - l.length - r.length);
  if (l.length + r.length >= width) return (l + " " + r).slice(0, width) + "\n";
  return l + " ".repeat(space) + r + "\n";
}

export function receiptBytes(receipt, settings = {}, ctx = {}) {
  const w = cols(settings);
  const b = new Builder().init();
  b.align("center").bold(true).size(true).line(settings.pharmacy_name || "Remedy Pharmacy").size(false).bold(false);
  b.line(ctx.branch || receipt.branch_name || "Main Branch");
  if (settings.address) b.line(settings.address);
  if (settings.phone) b.line(settings.phone);
  b.line(`${receipt.receipt_no || ""}  ${new Date(receipt.created_at || Date.now()).toLocaleString()}`);
  if (receipt.customer_name) b.line(`Customer: ${receipt.customer_name}`);
  b.align("left").line("-".repeat(w));
  for (const it of receipt.items || []) b.text(lineItem(`${it.name} x${it.qty}`, money(it.line_total), w));
  b.line("-".repeat(w));
  b.text(lineItem("Subtotal", money(receipt.subtotal), w));
  if (receipt.discount > 0) b.text(lineItem("Discount", "-" + money(receipt.discount), w));
  if (receipt.tax > 0) b.text(lineItem("Tax", money(receipt.tax), w));
  b.bold(true).text(lineItem("TOTAL", money(receipt.total), w)).bold(false);
  if (receipt.amount_paid != null) b.text(lineItem("Paid", money(receipt.amount_paid), w));
  if (receipt.change != null) b.text(lineItem("Change", money(receipt.change), w));
  b.align("center").line("").line(`Served by ${ctx.cashier || receipt.cashier || "-"} - ${receipt.payment_method || ""}`);
  b.line(settings.receipt_footer || "Thank you - get well soon.");
  b.feed(3).cut();
  return b.build();
}

// Pick a USB printer, claim its OUT endpoint, and stream the bytes.
export async function printBytesUSB(bytes) {
  if (!usbSupported()) throw new Error("WebUSB isn't available in this browser. Use Print instead.");
  const device = await navigator.usb.requestDevice({ filters: [{ classCode: 7 }, {}] });
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  // Find an interface with a bulk OUT endpoint and claim it.
  let iface = null, epOut = null;
  for (const cfg of device.configurations) {
    for (const i of cfg.interfaces) {
      const alt = i.alternates[0];
      const out = alt.endpoints.find((e) => e.direction === "out");
      if (out) { iface = i; epOut = out; break; }
    }
    if (iface) break;
  }
  if (!iface || !epOut) throw new Error("No printable USB endpoint found on that device.");
  try { await device.claimInterface(iface.interfaceNumber); }
  catch { throw new Error("Couldn't claim the printer — another driver may be using it."); }
  await device.transferOut(epOut.endpointNumber, bytes);
  try { await device.close(); } catch (_) {}
}

export async function printReceiptUSB(receipt, settings, ctx) {
  await printBytesUSB(receiptBytes(receipt, settings, ctx));
}
