// Parse CSV text into an array of objects keyed by snake_case headers.
export function parseCSV(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n");
  if (!lines.length || !lines[0].trim()) return [];
  const parseLine = (line) => {
    const out = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') q = true;
      else cur += c;
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    const cells = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] !== undefined ? cells[i].trim() : ""; });
    return obj;
  });
}

// Download an array of plain objects as a CSV file (client-side, no deps).
export function downloadCSV(filename, rows, headers) {
  if (!rows || !rows.length) return;
  const cols = headers || Object.keys(rows[0]);
  const esc = (v) => {
    v = v == null ? "" : String(v);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
