import { exchangeCode } from "../lib/stockx.js";
import { callbackURL } from "../lib/origin.js";

const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(res, status, title, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:0 auto;padding:24px 16px;background:#fff;color:#111}
textarea{width:100%;height:120px;font:13px ui-monospace,monospace;box-sizing:border-box}
code{background:#f1f1f1;padding:1px 4px;border-radius:4px}
@media (prefers-color-scheme: dark){body{background:#111;color:#eee}code{background:#222}}</style>
</head><body><h1>${escapeHTML(title)}</h1>${body}</body></html>`);
}

// Step 2 of connecting StockX: StockX redirects here with ?code=…
export default async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const code = url.searchParams.get("code");
  if (!code) {
    return page(res, 400, "StockX sign-in failed",
      `<p>${escapeHTML(url.searchParams.get("error_description") || url.searchParams.get("error") || "No code returned.")}</p>`);
  }
  try {
    const refreshToken = await exchangeCode(code, callbackURL(req));
    page(res, 200, "StockX connected: one more step",
      `<p>Copy this refresh token and save it as the <code>STOCKX_REFRESH_TOKEN</code> environment variable
      (Vercel: Project → Settings → Environment Variables), then redeploy.</p>
      <textarea readonly onclick="this.select()">${escapeHTML(refreshToken)}</textarea>
      <p>Treat it like a password: it lets this app read StockX data on your account.</p>`);
  } catch (err) {
    page(res, 502, "StockX sign-in failed", `<p>${escapeHTML(err.message)}</p>`);
  }
}
