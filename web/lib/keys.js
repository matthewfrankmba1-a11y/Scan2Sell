import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./http.js";

// Access keys and approval links are signed with ACCESS_KEY_SECRET, so the
// server can check them without a database. Setting the secret turns on
// "access key required" for the whole app.

export const keysEnabled = () => env("ACCESS_KEY_SECRET").length >= 16;

const hmac = (purpose, data) => createHmac("sha256", env("ACCESS_KEY_SECRET")).update(`${purpose}:${data}`).digest();

const BASE32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
function base32(bytes, length) {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length >= length) break;
  }
  return out;
}

export const normalizeEmail = (email) => String(email ?? "").trim().toLowerCase();

export function isValidEmail(email) {
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(email) && email.length <= 254;
}

/** Access key for an email: S2S-XXXX-XXXX-XXXX-XXXX-XXXX. Same email → same key. */
export function keyForEmail(email) {
  const id = base32(hmac("id", normalizeEmail(email)), 8);
  const sig = base32(hmac("key", id), 12);
  return `S2S-${(id + sig).match(/.{4}/g).join("-")}`;
}

/** Validates a key's signature; also honors REVOKED_KEYS (comma-separated). */
export function isValidKey(key) {
  if (!keysEnabled()) return false;
  const raw = String(key ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^S2S/, "");
  if (raw.length !== 20) return false;
  const id = raw.slice(0, 8);
  const expected = Buffer.from(base32(hmac("key", id), 12));
  const given = Buffer.from(raw.slice(8));
  if (!timingSafeEqual(expected, given)) return false;
  const revoked = env("REVOKED_KEYS").toUpperCase().replace(/[^A-Z0-9,]/g, "").split(",");
  return !revoked.some((r) => r.replace(/^S2S/, "") === raw);
}

const b64 = (s) => Buffer.from(s).toString("base64url");

/** Signed, expiring approval link payload: { email, messageId }. */
export function approvalToken({ email, messageId = "" }, ttlDays = 14) {
  const payload = b64(JSON.stringify({ e: normalizeEmail(email), m: messageId, x: Date.now() + ttlDays * 86400000 }));
  return `${payload}.${hmac("approve", payload).toString("base64url")}`;
}

export function readApprovalToken(token) {
  const [payload, sig] = String(token ?? "").split(".");
  if (!payload || !sig || !keysEnabled()) return null;
  const expected = hmac("approve", payload);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { e, m, x } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!isValidEmail(e) || Date.now() > x) return null;
    return { email: e, messageId: m || "" };
  } catch {
    return null;
  }
}
