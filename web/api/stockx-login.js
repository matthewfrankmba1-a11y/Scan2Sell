import { randomUUID } from "node:crypto";
import { env, isAuthorized, sendJSON } from "../lib/http.js";
import { authorizeURL } from "../lib/stockx.js";
import { callbackURL } from "../lib/origin.js";

// Step 1 of connecting StockX: send the browser to StockX's sign-in page.
export default function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (!isAuthorized(req, url.searchParams.get("key"))) {
    return sendJSON(res, 401, { error: "Wrong or missing access code" });
  }
  if (!env("STOCKX_CLIENT_ID") || !env("STOCKX_CLIENT_SECRET")) {
    return sendJSON(res, 400, { error: "Set STOCKX_CLIENT_ID and STOCKX_CLIENT_SECRET first" });
  }
  res.statusCode = 302;
  res.setHeader("Location", authorizeURL(callbackURL(req), randomUUID()));
  res.end();
}
