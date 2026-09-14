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
  // Pharmacy logo (stored as a data URL in settings) — drawn top-left if present.
  let tx = L;
  const logoMatch = settings.logo && /^data:image\/(png|jpe?g);base64,(.+)$/s.exec(settings.logo);
  if (logoMatch) {
    try { doc.image(Buffer.from(logoMatch[2], "base64"), L, 47, { fit: [46, 46] }); tx = L + 56; } catch (_) {}
  }
  doc.fillColor("#15803d").font("Helvetica-Bold").fontSize(20).text(settings.pharmacy_name || "Remedy Pharmacy", tx, 50);
  doc.font("Helvetica").fillColor("#555").fontSize(9);
  [settings.address, settings.phone, settings.email].filter(Boolean).forEach((l) => doc.text(l, tx));
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
    `Period: ${data.from || "beginning"} to ${data.to || "today"}`,
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


// ── Certificate of disposal ─────────────────────────────────
//
// The paper an inspector asks for. Everything on it is copied from the
// disposal record rather than recomputed from current stock: the whole point is
// that it says what was true on the day, and stays saying it after the product
// is renamed, reordered or deleted.
function disposalCertificate(res, { disposal, items, settings }) {
  const d = start(res, `${disposal.ref || "disposal"}.pdf`);
  const money = (n) => `${settings.currency_symbol || ""}${Number(n || 0).toFixed(2)}`;
  const date = new Date(disposal.created_at).toLocaleString();

  letterhead(d, settings, "CERTIFICATE OF DISPOSAL", [
    disposal.ref || "",
    date,
  ]);

  d.font("Helvetica").fontSize(10).fillColor("#222");
  const facts = [
    ["Reason", String(disposal.reason || "expired").replace(/^./, (c) => c.toUpperCase())],
    ["Method", disposal.method || "Not recorded"],
    ["Carried out by", disposal.disposed_by || "—"],
    ["Witnessed by", disposal.witness_name || "—"],
  ];
  facts.forEach(([k, v]) => {
    d.font("Helvetica-Bold").text(`${k}: `, L, d.y, { continued: true });
    d.font("Helvetica").text(v);
  });
  if (disposal.note) {
    d.moveDown(0.3);
    d.font("Helvetica-Oblique").fillColor("#555").fontSize(9).text(disposal.note, L, d.y, { width: R - L });
    d.fillColor("#222").fontSize(10);
  }
  d.moveDown(0.8);

  const cols = [
    { x: L,       w: 170, key: "product_name", label: "Product" },
    { x: L + 175, w: 70,  key: "batch_no",     label: "Batch" },
    { x: L + 250, w: 70,  key: "expiry",       label: "Expiry" },
    { x: L + 325, w: 45,  key: "qty",          label: "Qty",   align: "right" },
    { x: L + 375, w: 55,  key: "unit_cost",    label: "Unit",  align: "right" },
    { x: L + 435, w: 60,  key: "line_cost",    label: "Value", align: "right" },
  ];
  row(d, cols.map((c) => ({ text: c.label, x: c.x, w: c.w, align: c.align })), d.y, { bold: true });
  d.moveDown(0.4);
  d.moveTo(L, d.y).lineTo(R, d.y).strokeColor("#ccc").lineWidth(0.5).stroke();
  d.moveDown(0.3);

  items.forEach((it) => {
    if (d.y > 720) { d.addPage(); }
    const vals = {
      product_name: (it.product_name || "") + (it.is_controlled ? "  [CD]" : ""),
      batch_no: it.batch_no || "—",
      expiry: it.expiry_date ? new Date(it.expiry_date).toISOString().slice(0, 10) : "—",
      qty: String(it.qty),
      unit_cost: money(it.unit_cost),
      line_cost: money(it.line_cost),
    };
    row(d, cols.map((c) => ({ text: vals[c.key], x: c.x, w: c.w, align: c.align })), d.y);
    d.moveDown(0.55);
  });

  d.moveDown(0.3);
  d.moveTo(L, d.y).lineTo(R, d.y).strokeColor("#ccc").lineWidth(0.5).stroke();
  d.moveDown(0.4);
  row(d, [
    { text: `${disposal.total_units} unit(s) destroyed`, x: L, w: 300 },
    { text: `Total value at cost: ${money(disposal.total_cost)}`, x: L + 245, w: R - L - 245, align: "right" },
  ], d.y, { bold: true });

  // Signature lines. A certificate nobody signed is a printout.
  d.moveDown(3);
  const sy = d.y;
  d.font("Helvetica").fontSize(9).fillColor("#555");
  d.moveTo(L, sy).lineTo(L + 200, sy).strokeColor("#888").lineWidth(0.5).stroke();
  d.text("Signature — carried out by", L, sy + 4, { width: 200 });
  d.moveTo(R - 200, sy).lineTo(R, sy).stroke();
  d.text("Signature — witness", R - 200, sy + 4, { width: 200, align: "right" });

  d.end();
}

module.exports = { invoice, statement, disposalCertificate };
