import { styleCode as findStyleCode, usSize } from "./labelParser.js";
import { searchQuery as buildQuery } from "./marketLinks.js";

export function newPair(barcode, { id, now = new Date() } = {}) {
  return {
    id: id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    barcode,
    scannedAt: now.toISOString(),
    quantity: 1,
    brand: "",
    styleCode: "",
    size: "",
    name: "",
    colorway: "",
    retailPrice: null,
    imageURL: null,
    labelStyleHint: "",
    labelSizeHint: "",
    ebayMedian: null,
    ebayLow: null,
    ebayHigh: null,
    ebayCount: null,
    ebayBasis: "",
    stockxLowestAsk: null,
    stockxHighestBid: null,
    stockxURLKey: "",
    goatPrice: null,
    notes: "",
    status: "pending", // pending | lookingUp | done | partial | failed
    statusMessage: "",
    lastLookup: null,
  };
}

export const displayName = (p) => p.name || p.styleCode || `UPC ${p.barcode}`;

export const searchQuery = (p) => buildQuery({ styleCode: p.styleCode, name: p.name, size: p.size });

/**
 * Best single "what is this pair worth" number: real eBay sales first, then
 * StockX asks, then a manually entered GOAT price, then eBay asking prices.
 */
export function estimatedValue(p) {
  if (p.ebayMedian && p.ebayBasis.startsWith("sold")) return { amount: p.ebayMedian, source: "eBay sold median" };
  if (p.stockxLowestAsk) return { amount: p.stockxLowestAsk, source: "StockX lowest ask" };
  if (p.goatPrice) return { amount: p.goatPrice, source: "GOAT" };
  if (p.ebayMedian) return { amount: p.ebayMedian, source: "eBay active median" };
  return null;
}

/** Style code / size read off the box label by OCR. Fills gaps only. */
export function labelPatch(p, labelText) {
  const style = findStyleCode(labelText) ?? "";
  const size = usSize(labelText) ?? "";
  const patch = { labelStyleHint: style, labelSizeHint: size };
  if (!p.styleCode && style) patch.styleCode = style;
  if (!p.size && size) patch.size = size;
  return patch;
}

/** Fields to update from a UPCitemdb product. */
export function upcPatch(p, product) {
  const patch = { name: product.title };
  if (!p.brand) patch.brand = product.brand;
  if (!p.colorway) patch.colorway = product.color;
  if (!p.imageURL && product.imageURL) patch.imageURL = product.imageURL;
  // A database style code beats a label-OCR guess, except a Nike-style
  // "XXXXXX-XXX" read off the label, which is reliable.
  const dbStyle = findStyleCode(product.model) ?? findStyleCode(product.title);
  if (dbStyle && (!p.styleCode || !p.styleCode.includes("-"))) patch.styleCode = dbStyle;
  if (!p.size) {
    const size = (product.size && usSize(`Size ${product.size}`)) || usSize(product.title);
    if (size) patch.size = size;
  }
  return patch;
}

/** Fields to update from a StockX match. StockX titles are clean, so prefer them. */
export function stockxPatch(p, m) {
  const patch = {
    stockxURLKey: m.urlKey,
    stockxLowestAsk: m.lowestAsk,
    stockxHighestBid: m.highestBid,
  };
  if (m.title) patch.name = m.title;
  if (m.brand) patch.brand = m.brand;
  if (m.colorway) patch.colorway = m.colorway;
  if (m.styleId && (m.matchedByBarcode || !p.styleCode)) patch.styleCode = m.styleId;
  if (m.matchedByBarcode && m.size) patch.size = m.size;
  if (m.retailPrice) patch.retailPrice = m.retailPrice;
  return patch;
}

export const ebayPatch = (comps) => ({
  ebayMedian: comps.median,
  ebayLow: comps.low,
  ebayHigh: comps.high,
  ebayCount: comps.count,
  ebayBasis: comps.basis,
});
