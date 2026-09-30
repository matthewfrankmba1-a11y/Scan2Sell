import { env, isAuthorized, sendJSON } from "../lib/http.js";
import { ebayConfigured, ebaySoldEnabled } from "../lib/ebay.js";
import { stockxConfigured } from "../lib/stockx.js";

// Tells the app which price sources the server has keys for (never the keys).
export default function handler(req, res) {
  const authRequired = Boolean(env("APP_PASSWORD"));
  sendJSON(res, 200, {
    ok: true,
    authRequired,
    authorized: isAuthorized(req),
    sources: {
      upc: true,
      upcPaidKey: Boolean(env("UPCITEMDB_KEY")),
      ebay: ebayConfigured(),
      ebaySold: ebayConfigured() && ebaySoldEnabled(),
      stockx: stockxConfigured(),
      stockxAppKeys: Boolean(env("STOCKX_API_KEY") && env("STOCKX_CLIENT_ID") && env("STOCKX_CLIENT_SECRET")),
    },
  });
}
