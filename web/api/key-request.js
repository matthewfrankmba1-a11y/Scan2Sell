import { readBody, sendJSON } from "../lib/http.js";
import { approvalToken, isValidEmail, keysEnabled, normalizeEmail } from "../lib/keys.js";
import { discordConfigured, postKeyRequest } from "../lib/discord.js";
import { publicOrigin } from "../lib/origin.js";

// Someone asks for an access key: post it to Discord with an Approve button.
// No access key needed (that's the point), so it's rate limited per instance.
const recentByIP = new Map(); // ip → [timestamps]
const recentEmails = new Map(); // email → timestamp
const HOUR = 3600000;

function tooMany(ip, email) {
  const now = Date.now();
  const hits = (recentByIP.get(ip) ?? []).filter((t) => now - t < HOUR);
  if (hits.length >= 5) return "Too many requests. Try again in an hour.";
  if (now - (recentEmails.get(email) ?? 0) < 10 * 60000) return "Already requested. You'll get an email once it's approved.";
  hits.push(now);
  recentByIP.set(ip, hits);
  recentEmails.set(email, now);
  if (recentEmails.size > 5000) recentEmails.clear();
  if (recentByIP.size > 5000) recentByIP.clear();
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJSON(res, 405, { error: "Use POST" });
  if (!keysEnabled() || !discordConfigured()) {
    return sendJSON(res, 503, { error: "Key requests aren't set up on this server." });
  }
  let body;
  try {
    body = await readBody(req);
  } catch {
    return sendJSON(res, 400, { error: "Bad request" });
  }
  if (body.website) return sendJSON(res, 200, { ok: true }); // honeypot: bots fill hidden fields

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) return sendJSON(res, 400, { error: "Enter a valid email address." });

  const ip = String(req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress ?? "").split(",")[0].trim();
  const limited = tooMany(ip, email);
  if (limited) return sendJSON(res, 429, { error: limited });

  try {
    const origin = publicOrigin(req);
    await postKeyRequest(email, (messageId) =>
      `${origin}/api/key-approve?t=${encodeURIComponent(approvalToken({ email, messageId }))}`);
    sendJSON(res, 200, { ok: true });
  } catch {
    recentEmails.delete(email);
    sendJSON(res, 502, { error: "Couldn't send your request right now. Try again later." });
  }
}
