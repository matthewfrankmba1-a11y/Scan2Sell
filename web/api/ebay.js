import { badRequest, jsonHandler } from "../lib/http.js";
import { ebayComps, ebayConfigured } from "../lib/ebay.js";

export default jsonHandler(async ({ styleCode, name, size, newOnly }) => {
  if (!ebayConfigured()) throw badRequest("eBay is not configured on the server");
  return {
    comps: await ebayComps({
      styleCode: String(styleCode ?? "").trim(),
      name: String(name ?? "").trim(),
      size: String(size ?? "").trim(),
      newOnly: newOnly !== false,
    }),
  };
});
