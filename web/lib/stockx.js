import { env, fetchJSON } from "./http.js";
import { barcodesMatch, normalizeSize, normalizeStyleCode } from "../shared/labelParser.js";

// StockX public API v2 (developer.stockx.com).
const API = "https://api.stockx.com/v2";
const TOKEN_URL = "https://accounts.stockx.com/oauth/token";
const AUDIENCE = "gateway.stockx.com";

export const stockxConfigured = () =>
  ["STOCKX_API_KEY", "STOCKX_CLIENT_ID", "STOCKX_CLIENT_SECRET", "STOCKX_REFRESH_TOKEN"].every((k) => env(k));

// Cached per warm serverless instance.
let accessToken = null;
let tokenExpiry = 0;
let rotatedRefreshToken = null;
let lastRequest = 0;
export const throttle = { minIntervalMs: 1100 };

const num = (v) => {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function requestToken(params) {
  const body = new URLSearchParams({
    ...params,
    client_id: env("STOCKX_CLIENT_ID"),
    client_secret: env("STOCKX_CLIENT_SECRET"),
    audience: AUDIENCE,
  });
  return fetchJSON("StockX login", TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

async function token() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  const data = await requestToken({
    grant_type: "refresh_token",
    refresh_token: rotatedRefreshToken ?? env("STOCKX_REFRESH_TOKEN"),
  });
  if (data.refresh_token && data.refresh_token !== env("STOCKX_REFRESH_TOKEN")) {
    rotatedRefreshToken = data.refresh_token;
  }
  accessToken = data.access_token;
  tokenExpiry = Date.now() + ((data.expires_in ?? 3600) - 120) * 1000;
  return accessToken;
}

async function get(path, params) {
  // StockX allows roughly one request per second.
  const wait = throttle.minIntervalMs - (Date.now() - lastRequest);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();

  const url = `${API}${path}${params ? `?${new URLSearchParams(params)}` : ""}`;
  return fetchJSON("StockX", url, {
    headers: { "x-api-key": env("STOCKX_API_KEY"), Authorization: `Bearer ${await token()}` },
  });
}

const searchProducts = async (query) =>
  (await get("/catalog/search", { query, pageNumber: "1", pageSize: "10" }))?.products ?? [];

const fetchVariants = async (productId) =>
  (await get(`/catalog/products/${encodeURIComponent(productId)}/variants`)) ?? [];

const fetchMarketData = (productId, variantId) =>
  get(`/catalog/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}/market-data`,
    { currencyCode: "USD" });

async function buildMatch(product, variant, matchedByBarcode, fallbackSize = "") {
  let market = null;
  if (variant) {
    try { market = await fetchMarketData(product.productId, variant.variantId); } catch { /* prices optional */ }
  }
  return {
    productId: product.productId,
    urlKey: product.urlKey ?? "",
    title: product.title ?? "",
    brand: product.brand ?? "",
    styleId: product.styleId ?? "",
    colorway: product.productAttributes?.colorway ?? "",
    retailPrice: num(product.productAttributes?.retailPrice),
    size: variant?.variantValue ?? fallbackSize,
    lowestAsk: num(market?.lowestAskAmount),
    highestBid: num(market?.highestBidAmount),
    matchedByBarcode,
  };
}

/** Product + size variant for a pair: exact barcode (GTIN) first, then style code + size. */
export async function matchStockX({ barcode, styleCode, size }) {
  if (barcode) {
    const products = await searchProducts(barcode);
    for (const product of products.slice(0, 3)) {
      const variants = await fetchVariants(product.productId);
      const variant = variants.find((v) => (v.gtins ?? []).some((g) => barcodesMatch(g.identifier, barcode)));
      if (variant) return buildMatch(product, variant, true);
    }
  }
  if (!styleCode) return null;

  const wanted = normalizeStyleCode(styleCode);
  const products = await searchProducts(styleCode.toUpperCase());
  const product = products.find((p) =>
    String(p.styleId ?? "").split("/").some((s) => normalizeStyleCode(s) === wanted));
  if (!product) return null;

  let variant = null;
  if (size) {
    const wantedSize = normalizeSize(size);
    const variants = await fetchVariants(product.productId);
    variant = variants.find((v) => normalizeSize(v.variantValue) === wantedSize) ?? null;
  }
  return buildMatch(product, variant, false, size);
}

export function authorizeURL(redirectURI, state) {
  return `https://accounts.stockx.com/authorize?${new URLSearchParams({
    response_type: "code",
    client_id: env("STOCKX_CLIENT_ID"),
    redirect_uri: redirectURI,
    scope: "offline_access openid",
    audience: AUDIENCE,
    state,
  })}`;
}

/** One-time code from the sign-in redirect → long-lived refresh token. */
export async function exchangeCode(code, redirectURI) {
  const data = await requestToken({ grant_type: "authorization_code", code, redirect_uri: redirectURI });
  if (!data.refresh_token) {
    throw new Error("StockX didn't return a refresh token (is offline_access enabled for your app?)");
  }
  return data.refresh_token;
}

export function resetStockXForTests() {
  accessToken = null; tokenExpiry = 0; rotatedRefreshToken = null; lastRequest = 0;
}
