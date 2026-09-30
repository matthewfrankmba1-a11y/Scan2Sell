import { env } from "./http.js";

/** Public origin of this deployment, e.g. https://scan2sell.vercel.app */
export function publicOrigin(req) {
  if (env("PUBLIC_URL")) return env("PUBLIC_URL").replace(/\/$/, "");
  const proto = String(req.headers["x-forwarded-proto"] ?? "http").split(",")[0];
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return `${proto}://${host}`;
}

/** Register exactly this URL as the redirect URI in your StockX app. */
export const callbackURL = (req) => `${publicOrigin(req)}/api/stockx-callback`;
