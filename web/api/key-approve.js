import { keyForEmail, readApprovalToken } from "../lib/keys.js";
import { markApproved } from "../lib/discord.js";
import { keyEmail, mailConfigured, sendMail } from "../lib/mail.js";
import { publicOrigin } from "../lib/origin.js";
import { readBody } from "../lib/http.js";

// Opened from the Discord "Approve" button. GET shows a confirmation page;
// the POST from its button issues the key and emails it.

const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(res, status, title, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHTML(title)}</title>
<style>
:root{--bg:#f4f4f6;--card:#fff;--text:#16161b;--muted:#6b6b76;--accent:#ff6a00}
@media (prefers-color-scheme:dark){:root{--bg:#101014;--card:#1c1c22;--text:#f2f2f5;--muted:#9a9aa6}}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 -apple-system,system-ui,sans-serif}
main{max-width:480px;margin:0 auto;padding:40px 16px}
.card{background:var(--card);border-radius:14px;padding:20px}
h1{font-size:22px;margin:0 0 8px}p{margin:8px 0}.muted{color:var(--muted);font-size:14px}
button{width:100%;min-height:50px;border:0;border-radius:12px;background:var(--accent);color:#fff;font:600 17px system-ui;margin-top:12px}
code{display:block;font:600 18px ui-monospace,Menlo,monospace;letter-spacing:1px;background:var(--bg);padding:12px;border-radius:10px;margin:12px 0;user-select:all;word-break:break-all}
</style></head><body><main><div class="card"><h1>${escapeHTML(title)}</h1>${body}</div></main></body></html>`);
}

export default async function handler(req, res) {
  let token = new URL(req.url, "http://localhost").searchParams.get("t");
  if (req.method === "POST") {
    try {
      token = (await readBody(req)).t ?? token;
    } catch { /* fall through to invalid */ }
  }
  const request = readApprovalToken(token);
  if (!request) {
    return page(res, 400, "Link expired or invalid",
      `<p>This approval link isn't valid anymore. Approval links last 14 days. Ask the person to request a key again.</p>`);
  }
  const { email, messageId } = request;

  if (req.method !== "POST") {
    return page(res, 200, "Approve access?",
      `<p><b>${escapeHTML(email)}</b> is asking for a Scan2Sell access key.</p>
      <form method="post"><input type="hidden" name="t" value="${escapeHTML(token)}">
      <button type="submit">Approve &amp; email key</button></form>
      <p class="muted">Not expecting this? Just close this page. Nothing happens unless you approve.</p>`);
  }

  const key = keyForEmail(email);
  const appURL = publicOrigin(req);
  let emailed = false;
  let mailError = "";
  if (mailConfigured()) {
    try {
      await sendMail({ to: email, ...keyEmail({ key, appURL }) });
      emailed = true;
    } catch (err) {
      mailError = err.message;
    }
  }
  await markApproved(messageId, email, emailed);

  page(res, 200, emailed ? "Approved: key emailed ✅" : "Approved",
    `<p>${emailed ? `The key was emailed to <b>${escapeHTML(email)}</b>.`
      : `Send this key to <b>${escapeHTML(email)}</b>${mailError ? ` (email failed: ${escapeHTML(mailError)})` : " (email sending isn't set up on the server)"}:`}</p>
    <code>${escapeHTML(key)}</code>
    <p class="muted">They paste it into Scan2Sell → Settings → Access key, or open:<br>
    ${escapeHTML(`${appURL}/#/key/${key}`)}</p>
    <p class="muted">To revoke it later, add it to the REVOKED_KEYS environment variable.</p>`);
}
