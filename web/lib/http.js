import { timingSafeEqual } from "node:crypto";

export class UpstreamError extends Error {
  constructor(service, status, body = "") {
    const reason = {
      401: "unauthorized. Check the credentials in your environment variables",
      403: "access denied (403)",
      429: "rate limited, try again later",
    }[status] ?? `HTTP ${status} ${String(body).slice(0, 200)}`;
    super(`${service}: ${reason}`);
    this.status = status;
  }
}

/** fetch() that throws UpstreamError on non-2xx and parses JSON. */
export async function fetchJSON(service, url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeout ?? 12000) });
  const text = await res.text();
  if (!res.ok) throw new UpstreamError(service, res.status, text);
  return text ? JSON.parse(text) : null;
}

export function sendJSON(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

/** Request body as an object. Vercel pre-parses it; the local server does not. */
export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

/** When APP_PASSWORD is set, every API call must send it as x-access-code. */
export function isAuthorized(req, provided = req.headers["x-access-code"]) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true;
  const a = Buffer.from(String(provided ?? ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Wraps a JSON POST handler with auth, body parsing and error handling.
 * `fn(body)` returns the response object.
 */
export function jsonHandler(fn) {
  return async (req, res) => {
    if (req.method !== "POST") return sendJSON(res, 405, { error: "Use POST" });
    if (!isAuthorized(req)) return sendJSON(res, 401, { error: "Wrong or missing access code" });
    try {
      sendJSON(res, 200, await fn(await readBody(req)));
    } catch (err) {
      const status = err instanceof UpstreamError ? 502 : err.statusCode ?? 500;
      sendJSON(res, status, { error: err.message || "Lookup failed" });
    }
  };
}

export function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

export const env = (name) => (process.env[name] ?? "").trim();
