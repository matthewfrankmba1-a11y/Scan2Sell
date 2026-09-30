import { badRequest, jsonHandler } from "../lib/http.js";
import { matchStockX, stockxConfigured } from "../lib/stockx.js";
import { normalizeBarcode } from "../shared/labelParser.js";

export default jsonHandler(async ({ barcode, styleCode, size }) => {
  if (!stockxConfigured()) throw badRequest("StockX is not configured on the server");
  return {
    match: await matchStockX({
      barcode: normalizeBarcode(barcode),
      styleCode: String(styleCode ?? "").trim(),
      size: String(size ?? "").trim(),
    }),
  };
});
