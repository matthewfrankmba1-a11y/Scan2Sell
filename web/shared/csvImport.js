import { normalizeBarcode } from "./labelParser.js";
import { newPair } from "./pairs.js";

/** RFC 4180 CSV parser (quoted fields, "" escapes, CRLF/LF, embedded newlines). */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Spreadsheet column → pair field. Matches the app's own export, so an
// exported file (edited in Numbers/Excel or not) imports straight back.
const TEXT = {
  "Brand": "brand", "Style Code": "styleCode", "Size": "size", "Description": "name",
  "Colorway": "colorway", "eBay Basis": "ebayBasis", "Notes": "notes",
};
const NUMBER = {
  "Retail": "retailPrice", "eBay Median": "ebayMedian", "eBay Low": "ebayLow", "eBay High": "ebayHigh",
  "StockX Lowest Ask": "stockxLowestAsk", "StockX Highest Bid": "stockxHighestBid", "GOAT Price": "goatPrice",
};
const INTEGER = { "Qty": "quantity", "eBay Comps": "ebayCount" };

/** `="0123"` (the export's keep-as-text trick) → `0123` */
const unformula = (v) => v.trim().replace(/^="(.*)"$/, "$1");

function parseDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Spreadsheet rows as { barcode, fields, scannedAt }. Only non-empty cells
 * become fields, so a blank cell never erases data already in the app.
 */
export function readInventoryCSV(text) {
  const [header = [], ...rows] = parseCSV(text.replace(/^﻿/, ""))
    .filter((r) => r.some((c) => c.trim() !== ""));
  const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  if (!("UPC" in col)) throw new Error("This file has no UPC column. Import a spreadsheet exported from Scan2Sell.");

  const records = [];
  let skipped = 0;
  for (const row of rows) {
    const cell = (name) => (name in col ? unformula(row[col[name]] ?? "") : "");
    const barcode = normalizeBarcode(cell("UPC"));
    if (!barcode) { skipped++; continue; }

    const fields = {};
    for (const [name, key] of Object.entries(TEXT)) if (cell(name)) fields[key] = cell(name);
    for (const [name, key] of Object.entries(NUMBER)) {
      const n = parseFloat(cell(name).replace(/[$,]/g, ""));
      if (Number.isFinite(n) && n > 0) fields[key] = n;
    }
    for (const [name, key] of Object.entries(INTEGER)) {
      const n = parseInt(cell(name), 10);
      if (Number.isFinite(n) && n > 0) fields[key] = n;
    }
    const stockx = /^https:\/\/stockx\.com\/([^/?#]+)$/.exec(cell("StockX Link"));
    if (stockx && stockx[1] !== "search") fields.stockxURLKey = decodeURIComponent(stockx[1]);

    records.push({ barcode, fields, scannedAt: parseDate(cell("Scanned")) });
  }
  return { records, skipped };
}

/**
 * Plans how a spreadsheet merges into the current list, matched by UPC:
 * existing pairs get the spreadsheet's non-empty values, unknown UPCs are added.
 */
export function planImport(existingPairs, text) {
  const { records, skipped } = readInventoryCSV(text);
  const byBarcode = new Map(existingPairs.map((p) => [p.barcode, p]));
  const updates = new Map(); // id → patch
  const additions = new Map(); // barcode → new pair

  for (const { barcode, fields, scannedAt } of records) {
    const existing = byBarcode.get(barcode);
    if (existing) {
      const patch = { ...updates.get(existing.id), ...fields };
      // Now identified: clear the old "not in UPC database" message.
      if ((fields.name || fields.styleCode) && existing.status !== "done") {
        Object.assign(patch, { status: "done", statusMessage: "" });
      }
      updates.set(existing.id, patch);
    } else if (additions.has(barcode)) {
      Object.assign(additions.get(barcode), fields);
    } else {
      additions.set(barcode, { ...newPair(barcode, { now: scannedAt ?? new Date() }), ...fields, status: "done" });
    }
  }

  const changed = [...updates].filter(([id, patch]) => {
    const pair = existingPairs.find((p) => p.id === id);
    return Object.entries(patch).some(([k, v]) => pair[k] !== v);
  });
  return {
    updates: changed.map(([id, patch]) => ({ id, patch })),
    additions: [...additions.values()],
    unchanged: updates.size - changed.length,
    skipped,
  };
}
