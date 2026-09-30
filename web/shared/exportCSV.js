import { makeCSV, textFormula } from "./csv.js";
import { ebaySold, goatSearch, stockxProduct, stockxSearch } from "./marketLinks.js";
import { estimatedValue, searchQuery } from "./pairs.js";

export const HEADER = [
  "Scanned", "UPC", "Brand", "Style Code", "Size", "Description", "Colorway", "Qty",
  "Retail", "eBay Median", "eBay Low", "eBay High", "eBay Comps", "eBay Basis",
  "StockX Lowest Ask", "StockX Highest Bid", "GOAT Price",
  "Est. Value (each)", "Value Source", "Est. Value (total)",
  "eBay Sold Link", "StockX Link", "GOAT Link", "Notes", "Lookup Status",
];

const money = (v) => (v == null || v === "" ? "" : Number(v).toFixed(2));

function formatDate(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function pairsToCSV(pairs) {
  const rows = pairs.map((p) => {
    const query = searchQuery(p);
    const styleOrName = p.styleCode || p.name;
    const estimate = estimatedValue(p);
    return [
      formatDate(p.scannedAt),
      textFormula(p.barcode),
      p.brand,
      p.styleCode,
      p.size,
      p.name,
      p.colorway,
      p.quantity,
      money(p.retailPrice),
      money(p.ebayMedian),
      money(p.ebayLow),
      money(p.ebayHigh),
      p.ebayCount ?? "",
      p.ebayBasis,
      money(p.stockxLowestAsk),
      money(p.stockxHighestBid),
      money(p.goatPrice),
      money(estimate?.amount),
      estimate?.source ?? "",
      money(estimate ? estimate.amount * p.quantity : null),
      query ? ebaySold(query) : "",
      query ? (p.stockxURLKey ? stockxProduct(p.stockxURLKey) : stockxSearch(styleOrName)) : "",
      query ? goatSearch(styleOrName) : "",
      p.notes,
      p.statusMessage || p.status,
    ];
  });
  return makeCSV(HEADER, rows);
}
