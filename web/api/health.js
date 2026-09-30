import { authRequired, env, isAuthorized, sendJSON } from "../lib/http.js";
import { keysEnabled } from "../lib/keys.js";
import { discordConfigured } from "../lib/discord.js";
import { mailConfigured } from "../lib/mail.js";
import { ebayConfigured, ebaySoldEnabled } from "../lib/ebay.js";
import { stockxConfigured } from "../lib/stockx.js";

// Tells the app which price sources the server has keys for (never the keys).
export default function handler(req, res) {
  sendJSON(res, 200, {
    ok: true,
    authRequired: authRequired(),
    authorized: isAuthorized(req),
    keyRequests: keysEnabled() && discordConfigured(),
    keyEmails: mailConfigured(),
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
