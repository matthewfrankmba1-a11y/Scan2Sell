import { badRequest, jsonHandler } from "../lib/http.js";
import { lookupUPC } from "../lib/upc.js";
import { normalizeBarcode } from "../shared/labelParser.js";

export default jsonHandler(async ({ barcode }) => {
  const code = normalizeBarcode(barcode);
  if (!code) throw badRequest("Invalid barcode");
  return { product: await lookupUPC(code) };
});
