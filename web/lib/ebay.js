import { env, fetchJSON } from "./http.js";
import { normalizeSize, normalizeStyleCode, usSize } from "../shared/labelParser.js";
import { summarize } from "../shared/priceStats.js";

// eBay Buy APIs.
// - Marketplace Insights (real *sold* prices, last 90 days) is restricted: eBay
//   must approve your app. Set EBAY_USE_SOLD=true once approved.
// - Browse (current *active* listings) works for any developer key and is the fallback.

const ATHLETIC_SHOES = "15709";
const BASE_SCOPE = "https://api.ebay.com/oauth/api_scope";
const INSIGHTS_SCOPE = "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights";

export const ebayConfigured = () => Boolean(env("EBAY_CLIENT_ID") && env("EBAY_CLIENT_SECRET"));
export const ebaySoldEnabled = () => /^(1|true|yes)$/i.test(env("EBAY_USE_SOLD"));

const tokens = new Map(); // scope → { token, expiry }

async function token(scope) {
  const cached = tokens.get(scope);
  if (cached && Date.now() < cached.expiry) return cached.token;
  const basic = Buffer.from(`${env("EBAY_CLIENT_ID")}:${env("EBAY_CLIENT_SECRET")}`).toString("base64");
  const data = await fetchJSON("eBay login", "https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope }),
  });
  tokens.set(scope, { token: data.access_token, expiry: Date.now() + ((data.expires_in ?? 7200) - 120) * 1000 });
  return data.access_token;
}

async function fetchListings({ query, size, sold, newOnly }) {
  const endpoint = sold
    ? "https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search"
    : "https://api.ebay.com/buy/browse/v1/item_summary/search";
  const params = new URLSearchParams({ q: query, limit: "50" });
  const filters = [];
  if (!sold) filters.push("buyingOptions:{FIXED_PRICE|AUCTION}");
  if (newOnly) filters.push("conditionIds:{1000}");
  if (filters.length) params.set("filter", filters.join(","));
  if (size) {
    const ebaySize = normalizeSize(size).replace(/[^\d.]/g, "");
    params.set("category_ids", ATHLETIC_SHOES);
    params.set("aspect_filter", `categoryId:${ATHLETIC_SHOES},US Shoe Size:{${ebaySize}}`);
  }

  const data = await fetchJSON(sold ? "eBay sold data" : "eBay", `${endpoint}?${params}`, {
    headers: {
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      Authorization: `Bearer ${await token(sold ? INSIGHTS_SCOPE : BASE_SCOPE)}`,
    },
  });
  const items = sold ? data?.itemSales : data?.itemSummaries;
  return (items ?? [])
    .map((i) => ({ title: i.title ?? "", price: Number((sold ? i.lastSoldPrice : i.price)?.value) }))
    .filter((l) => Number.isFinite(l.price));
}

/** When most results mention the style code, drop the ones that don't. */
function relevant(listings, styleCode) {
  if (!styleCode) return listings;
  const wanted = normalizeStyleCode(styleCode);
  const matching = listings.filter((l) => normalizeStyleCode(l.title).includes(wanted));
  return matching.length >= 3 ? matching : listings;
}

/**
 * Size-filtered search first, then all sizes filtered by the size in each
 * listing title, then all sizes.
 */
async function bestComps({ query, styleCode, size, sold, newOnly }) {
  const kind = sold ? "sold" : "active listings";
  if (size) {
    const sized = relevant(await fetchListings({ query, size, sold, newOnly }), styleCode);
    const summary = summarize(sized.map((l) => l.price));
    if (summary) return { ...summary, basis: `${kind}, size ${size}` };
  }
  const all = relevant(await fetchListings({ query, size: null, sold, newOnly }), styleCode);
  if (size) {
    const wanted = normalizeSize(size);
    const titleMatched = all.filter((l) => {
      const s = usSize(l.title);
      return s && normalizeSize(s) === wanted;
    });
    const summary = summarize(titleMatched.map((l) => l.price));
    if (summary) return { ...summary, basis: `${kind}, size ${size}` };
  }
  const summary = summarize(all.map((l) => l.price));
  return summary ? { ...summary, basis: `${kind}, all sizes` } : null;
}

export async function ebayComps({ styleCode, name, size, newOnly = true }) {
  const query = styleCode || name;
  if (!query) return null;
  let soldError = null;
  if (ebaySoldEnabled()) {
    try {
      const sold = await bestComps({ query, styleCode, size, sold: true, newOnly });
      if (sold) return sold;
    } catch (err) {
      soldError = err;
    }
  }
  const active = await bestComps({ query, styleCode, size, sold: false, newOnly });
  if (!active && soldError) throw soldError;
  return active;
}

export function resetEbayForTests() {
  tokens.clear();
}
