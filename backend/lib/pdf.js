const PDFDocument = require("pdfkit");

const L = 50, R = 545; // page content edges (A4, 50pt margins)

function start(res, filename) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);
  return doc;
}

function letterhead(doc, settings, title, meta = []) {
  doc.fillColor("#15803d").font("Helvetica-Bold").fontSize(20).text(settings.pharmacy_name || "Remedy Pharmacy", L, 50);
  doc.font("Helvetica").fillColor("#555").fontSize(9);
  [settings.address, settings.phone, settings.email].filter(Boolean).forEach((l) => doc.text(l));
  doc.fillColor("#111").font("Helvetica-Bold").fontSize(16).text(title, L, 50, { align: "right", width: R - L });
  doc.font("Helvetica").fillColor("#555").fontSize(9);
  meta.forEach((m) => doc.text(m, L, doc.y, { align: "right", width: R - L }));
  doc.moveDown(0.6);
  const y = doc.y;
  doc.moveTo(L, y).lineTo(R, y).strokeColor("#15803d").lineWidth(1.5).stroke();
  doc.moveDown(1);
}

const row = (doc, cols, y, opts = {}) => {
  doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(opts.size || 9).fillColor(opts.color || "#222");
  cols.forEach((c) => doc.text(c.text, c.x, y, { width: c.w, align: c.align || "left" }));
};

// ── Sale invoice / receipt ──────────────────────────────────
function invoice(res, { sale, items, payments, promotions, settings }) {
  const sym = settings.currency_symbol || "";
  const m = (n) => `${sym}${Number(n || 0).toFixed(2)}`;
  const doc = start(res, `${sale.receipt_no || "invoice"}.pdf`);

  letterhead(doc, settings, "INVOICE", [
    `${sale.receipt_no || ""}`,
    new Date(sale.created_at).toLocaleString(),
    sale.customer_name ? `Customer: ${sale.customer_name}` : "",
  ].filter(Boolean));

  // Items table
  const cols = [
    { x: L, w: 250, key: "name" },
    { x: 300, w: 60, key: "qty", align: "right" },
    { x: 365, w: 85, key: "price", align: "right" },
    { x: 455, w: R - 455, key: "total", align: "right" },
  ];
  let y = doc.y;
  row(doc, [
    { text: "Item", x: cols[0].x, w: cols[0].w },
    { text: "Qty", x: cols[1].x, w: cols[1].w, align: "right" },
    { text: "Unit", x: cols[2].x, w: cols[2].w, align: "right" },
    { text: "Amount", x: cols[3].x, w: cols[3].w, align: "right" },
  ], y, { bold: true });
  y += 16;
  doc.moveTo(L, y - 3).lineTo(R, y - 3).strokeColor("#ddd").lineWidth(1).stroke();
  (items || []).forEach((it) => {
    if (y > 720) { doc.addPage(); y = 60; }
    row(doc, [
      { text: it.name, x: cols[0].x, w: cols[0].w },
      { text: String(it.qty), x: cols[1].x, w: cols[1].w, align: "right" },
      { text: m(it.unit_price), x: cols[2].x, w: cols[2].w, align: "right" },
      { text: m(it.line_total), x: cols[3].x, w: cols[3].w, align: "right" },
    ], y);
    y += 16;
  });
  doc.moveTo(L, y).lineTo(R, y).strokeColor("#ddd").stroke();
  y += 10;

  // Totals
  const tot = (label, val, bold) => { row(doc, [
    { text: label, x: 320, w: 130, align: "right" },
    { text: val, x: 455, w: R - 455, align: "right" },
  ], y, { bold, size: bold ? 12 : 9 }); y += bold ? 20 : 15; };
  tot("Subtotal", m(sale.subtotal));
  (promotions || []).forEach((p) => tot(p.name, `-${m(p.amount)}`));
  const manual = Number(sale.discount || 0) - Number(sale.promo_discount || 0);
  if (manual > 0.005) tot("Discount", `-${m(manual)}`);
  if (Number(sale.tax) > 0) tot("Tax", m(sale.tax));
  tot("TOTAL", m(sale.total), true);
  y += 4;
  if ((payments || []).length) {
    doc.font("Helvetica").fontSize(9).fillColor("#555")
      .text(`Paid by ${payments.map((p) => `${p.method} ${m(p.amount)}`).join(", ")}`, L, y, { width: R - L, align: "right" });
  }

  doc.font("Helvetica").fontSize(9).fillColor("#888")
    .text(settings.receipt_footer || "Thank you.", L, 770, { align: "center", width: R - L });
  doc.end();
}

// ── Customer statement ──────────────────────────────────────
function statement(res, { data, settings }) {
  const sym = settings.currency_symbol || "";
  const m = (n) => `${sym}${Number(n || 0).toFixed(2)}`;
  const c = data.customer;
  const doc = start(res, `statement-${c.name}.pdf`);

  letterhead(doc, settings, "STATEMENT", [
    c.name, c.phone || "",
    `Period: ${data.from || "beginning"} → ${data.to || "today"}`,
  ].filter(Boolean));

  // Summary
  let y = doc.y;
  [["Opening balance", m(data.opening_balance)], ["Charges", m(data.total_charges)],
   ["Payments", m(data.total_payments)], ["Closing balance", m(data.closing_balance)]]
    .forEach(([k, v], i) => { row(doc, [{ text: k, x: L + i * 125, w: 120 }], y, { color: "#777", size: 8 });
      row(doc, [{ text: v, x: L + i * 125, w: 120 }], y + 12, { bold: true, size: 11 }); });
  y += 40;
  doc.moveTo(L, y).lineTo(R, y).strokeColor("#ddd").stroke(); y += 10;

  row(doc, [
    { text: "Date", x: L, w: 90 }, { text: "Detail", x: 150, w: 230 },
    { text: "Charge", x: 360, w: 60, align: "right" }, { text: "Payment", x: 425, w: 55, align: "right" },
    { text: "Balance", x: 485, w: R - 485, align: "right" },
  ], y, { bold: true }); y += 16;
  doc.moveTo(L, y - 3).lineTo(R, y - 3).strokeColor("#eee").stroke();
  (data.lines || []).forEach((l) => {
    if (y > 730) { doc.addPage(); y = 60; }
    row(doc, [
      { text: new Date(l.date).toLocaleDateString(), x: L, w: 90 },
      { text: l.label + (l.ref ? ` (${l.ref})` : ""), x: 150, w: 230 },
      { text: l.charge ? m(l.charge) : "", x: 360, w: 60, align: "right" },
      { text: l.payment ? m(l.payment) : "", x: 425, w: 55, align: "right" },
      { text: m(l.balance), x: 485, w: R - 485, align: "right" },
    ], y); y += 15;
  });
  if (!data.lines?.length) { doc.font("Helvetica").fontSize(9).fillColor("#999").text("No activity in this period.", L, y); }

  doc.end();
}

module.exports = { invoice, statement };
