// Pulls sneaker identifiers (barcode, style code, US size) out of raw text:
// box-label OCR, marketplace listing titles, UPC database titles.

/** Canonical GTIN: UPC-A reported as 13-digit EAN with a leading 0 becomes 12 digits. */
export function normalizeBarcode(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 14 && digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 13 && digits.startsWith("0")) digits = digits.slice(1);
  return [8, 12, 13].includes(digits.length) ? digits : null;
}

/** Same item, ignoring leading-zero padding. */
export function barcodesMatch(a, b) {
  const strip = (s) => String(s ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const lhs = strip(a);
  return lhs !== "" && lhs === strip(b);
}

const STYLE_PATTERNS = [
  // Nike / Jordan: DZ5485-612, 555088-134. ASICS: 1201A789-020
  /\b(?=[A-Z0-9]*\d[A-Z0-9]*\d[A-Z0-9]*\d)[A-Z0-9]{6,8}-\d{3}\b/g,
  // adidas / Yeezy: GW2871, IE0421, B75806
  /\b(?:[A-Z]{2}\d{4}|[A-Z]\d{5})\b/g,
];

/** Likely manufacturer style codes, most specific pattern first. */
export function styleCodes(text) {
  const upper = String(text ?? "").toUpperCase();
  const found = [];
  for (const pattern of STYLE_PATTERNS) {
    for (const m of upper.matchAll(pattern)) {
      if (!found.includes(m[0])) found.push(m[0]);
    }
  }
  return found;
}

export function styleCode(text) {
  return styleCodes(text)[0] ?? null;
}

/** "DZ5485 612" === "dz5485-612" */
export function normalizeStyleCode(code) {
  return String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Capture groups in every pattern: 1 = leading women's marker, 2 = number, 3 = suffix.
const SIZE_PATTERNS = [
  // "US 10", "US M 10", "US Men's 10.5", "US 5.5Y", "US W 8"
  /\bUS\s*(?:M(?:EN'?S)?|(W)(?:OMEN'?S)?)?\s*(\d{1,2}(?:\.5)?)\s*([CYW])?(?![\d.])/gi,
  // "Size 10", "Sz. 9.5", "Size: US 11", "Size 8W", "Size 7 Women's"
  /\b(?:SIZE|SZ)\.?\s*:?\s*(?:US\s*)?(?:M(?:EN'?S)?\s*|(W)(?:OMEN'?S)?\s*)?(\d{1,2}(?:\.5)?)\s*([CYW](?![A-Z])|WOMEN'?S|WMNS)?(?![\d.])/gi,
  // "Men's 10", "Women's 8"
  /\b(?:MEN'?S|(WOMEN'?S|WMNS))\s+(\d{1,2}(?:\.5)?)(?![\d.])/gi,
];

/** US size like "10", "10.5", "5.5Y", "8W" or "10C". */
export function usSize(text) {
  const s = String(text ?? "");
  for (const pattern of SIZE_PATTERNS) {
    for (const m of s.matchAll(pattern)) {
      const number = m[2];
      const value = Number(number);
      if (!(value >= 1 && value <= 18)) continue;
      let suffix = "";
      if (m[3]) suffix = m[3].toUpperCase().startsWith("W") ? "W" : m[3].toUpperCase();
      if (!suffix && m[1]) suffix = "W";
      return number + suffix;
    }
  }
  return null;
}

/** "US M 10" === "10", "W 8" === "8W", "5.5 Y" === "5.5Y" */
export function normalizeSize(size) {
  let s = String(size ?? "").toUpperCase()
    .replace(/US/g, "").replace(/MEN'?S/g, "").replace(/\s+/g, "");
  if (/^M\d/.test(s)) s = s.slice(1);
  if (/^W\d/.test(s)) s = s.slice(1) + "W";
  if (s.endsWith("M")) s = s.slice(0, -1);
  return s;
}
