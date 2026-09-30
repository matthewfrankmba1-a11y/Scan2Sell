import { env, fetchJSON } from "./http.js";

// Sends email over HTTP (no SMTP library needed):
// - Brevo (BREVO_API_KEY): can send from a single verified address such as
//   your Gmail, no domain required. Free tier ~300 emails/day.
// - Resend (RESEND_API_KEY): needs a verified domain to email other people.
// MAIL_FROM is the sender, e.g. "Scan2Sell <you@gmail.com>".

export const mailConfigured = () => Boolean((env("BREVO_API_KEY") || env("RESEND_API_KEY")) && env("MAIL_FROM"));

function parseFrom(from) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1] || "Scan2Sell", email: m[2] } : { name: "Scan2Sell", email: from.trim() };
}

export async function sendMail({ to, subject, text, html }) {
  if (env("BREVO_API_KEY")) {
    await fetchJSON("Brevo email", "https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env("BREVO_API_KEY"), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ sender: parseFrom(env("MAIL_FROM")), to: [{ email: to }], subject, textContent: text, htmlContent: html }),
    });
    return;
  }
  await fetchJSON("Resend email", "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("MAIL_FROM"), to: [to], subject, text, html }),
  });
}

const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function keyEmail({ key, appURL }) {
  const link = `${appURL}/#/key/${encodeURIComponent(key)}`;
  return {
    subject: "Your Scan2Sell access key",
    text: `Your Scan2Sell access key is:\n\n${key}\n\nOpen this link on your phone to add it automatically:\n${link}\n\nOr open ${appURL}, go to Settings, and paste the key into "Access key".\n`,
    html: `<div style="font:16px/1.5 -apple-system,system-ui,sans-serif;max-width:480px">
<p>Your Scan2Sell access key is:</p>
<p style="font:600 20px ui-monospace,Menlo,monospace;letter-spacing:1px;background:#f4f4f6;padding:12px 16px;border-radius:10px">${escapeHTML(key)}</p>
<p><a href="${escapeHTML(link)}" style="display:inline-block;background:#ff6a00;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px">Open Scan2Sell with this key</a></p>
<p style="color:#6b6b76;font-size:14px">Or open ${escapeHTML(appURL)}, go to Settings, and paste the key into “Access key”.</p>
</div>`,
  };
}
