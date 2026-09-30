import { pairsToCSV } from "../shared/exportCSV.js";

/** Opens the iOS share sheet with the CSV (Save to Files, Numbers, Mail, AirDrop…), or downloads it. */
export async function exportSpreadsheet(pairs) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const name = `Scan2Sell-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
  // Oldest first reads naturally in a spreadsheet. BOM so Excel detects UTF-8.
  const csv = "﻿" + pairsToCSV([...pairs].reverse());
  const file = new File([csv], name, { type: "text/csv" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Scan2Sell inventory" });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
      // Fall through to a plain download.
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
