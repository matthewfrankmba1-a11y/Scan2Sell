export function escapeField(value) {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV with CRLF line endings. */
export function makeCSV(header, rows) {
  return [header, ...rows].map((r) => r.map(escapeField).join(",")).join("\r\n") + "\r\n";
}

/**
 * Wraps a digit string so spreadsheets keep it as text instead of dropping
 * leading zeros or switching to scientific notation.
 */
export const textFormula = (value) => (value ? `="${value}"` : "");
