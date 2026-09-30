import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { matchStockX, resetStockXForTests, throttle } from "../lib/stockx.js";
import { ebayComps, resetEbayForTests } from "../lib/ebay.js";
import { lookupUPC } from "../lib/upc.js";
import { createAppServer } from "../server.js";

throttle.minIntervalMs = 0;

/** Routes fetch() by URL substring to canned responses; records calls. */
function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    calls.push({ url: u, options });
    for (const [pattern, reply] of routes) {
      if (u.includes(pattern)) {
        const { status = 200, body } = typeof reply === "function" ? reply(u, options) : reply;
        return new Response(JSON.stringify(body), { status });
      }
    }
    return new Response("{}", { status: 404 });
  };
  return calls;
}

const realFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = realFetch;
  resetStockXForTests();
  resetEbayForTests();
  Object.assign(process.env, {
    STOCKX_API_KEY: "k", STOCKX_CLIENT_ID: "id", STOCKX_CLIENT_SECRET: "s", STOCKX_REFRESH_TOKEN: "r",
    EBAY_CLIENT_ID: "eid", EBAY_CLIENT_SECRET: "esec", EBAY_USE_SOLD: "false", APP_PASSWORD: "",
  });
});

const token = ["oauth/token", { body: { access_token: "AT", expires_in: 3600 } }];
const panda = {
  productId: "p1", urlKey: "nike-dunk-low-retro-white-black-2021", styleId: "DD1391-100",
  title: "Nike Dunk Low Retro White Black Panda", brand: "Nike",
  productAttributes: { colorway: "White/Black", retailPrice: 110 },
};
const variants = [
  { variantId: "v9", variantValue: "9", gtins: [{ identifier: "195866000009", type: "UPC" }] },
  { variantId: "v10", variantValue: "10", gtins: [{ identifier: "0195866000010", type: "EAN-13" }] },
];

test("StockX matches by barcode GTIN and returns market data", async () => {
  const calls = mockFetch([
    token,
    ["/catalog/search", { body: { products: [panda] } }],
    ["/market-data", { body: { lowestAskAmount: "98", highestBidAmount: "85" } }],
    ["/variants", { body: variants }],
  ]);
  const m = await matchStockX({ barcode: "195866000010", styleCode: "", size: "" });
  assert.equal(m.size, "10");
  assert.equal(m.lowestAsk, 98);
  assert.equal(m.highestBid, 85);
  assert.equal(m.retailPrice, 110);
  assert.ok(m.matchedByBarcode);
  const search = calls.find((c) => c.url.includes("/catalog/search"));
  assert.equal(search.options.headers["x-api-key"], "k");
  assert.equal(search.options.headers.Authorization, "Bearer AT");
});

test("StockX falls back to style code + size", async () => {
  mockFetch([
    token,
    ["query=195", { body: { products: [] } }],
    ["query=DD1391+100", { body: { products: [{ ...panda, styleId: "DD1391-100" }] } }],
    ["/market-data", { body: { lowestAskAmount: 101 } }],
    ["/variants", { body: variants }],
  ]);
  const m = await matchStockX({ barcode: "195866999999", styleCode: "dd1391 100", size: "US 9" });
  assert.equal(m.size, "9");
  assert.equal(m.lowestAsk, 101);
  assert.equal(m.matchedByBarcode, false);
});

test("eBay: sized active listings, style-code filtered, outliers trimmed", async () => {
  const listing = (title, value) => ({ title, price: { value: String(value), currency: "USD" } });
  const calls = mockFetch([
    ["oauth2/token", { body: { access_token: "E", expires_in: 7200 } }],
    ["item_summary/search", {
      body: { itemSummaries: [
        listing("Nike Dunk Low Panda DD1391-100 Sz 10", 120),
        listing("Nike Dunk Low Panda DD1391-100 size 10", 125),
        listing("Nike Dunk Low Panda DD1391-100", 130),
        listing("Nike Dunk Low DD1391-100 new", 135),
        listing("Nike Dunk Low DD1391-100 lot of 5", 700),
        listing("Dunk laces", 12),
      ] },
    }],
  ]);
  const comps = await ebayComps({ styleCode: "DD1391-100", name: "", size: "10" });
  assert.deepEqual(comps, { count: 4, median: 127.5, low: 120, high: 135, basis: "active listings, size 10" });
  const search = new URL(calls.find((c) => c.url.includes("item_summary")).url);
  assert.equal(search.searchParams.get("aspect_filter"), "categoryId:15709,US Shoe Size:{10}");
  assert.equal(search.searchParams.get("filter"), "buyingOptions:{FIXED_PRICE|AUCTION},conditionIds:{1000}");
});

test("eBay: sold data used when enabled, falls back to active on 403", async () => {
  process.env.EBAY_USE_SOLD = "true";
  mockFetch([
    ["oauth2/token", { body: { access_token: "E" } }],
    ["item_sales/search", { body: { itemSales: [{ title: "DD1391-100 size 10", lastSoldPrice: { value: "111.00" } }] } }],
  ]);
  assert.equal((await ebayComps({ styleCode: "DD1391-100", size: "10" })).basis, "sold, size 10");

  resetEbayForTests();
  mockFetch([
    ["oauth2/token", { body: { access_token: "E" } }],
    ["item_sales/search", { status: 403, body: {} }],
    ["item_summary/search", { body: { itemSummaries: [{ title: "DD1391-100", price: { value: "140" } }] } }],
  ]);
  const comps = await ebayComps({ styleCode: "DD1391-100", size: "10" });
  assert.equal(comps.median, 140);
  assert.equal(comps.basis, "active listings, size 10");
});

test("UPC lookup parses UPCitemdb and treats 404 as not found", async () => {
  mockFetch([["upc=195866000010", { body: { code: "OK", items: [{ title: "Nike Dunk Low", brand: "Nike", model: "DD1391-100", images: ["https://img/x.jpg"] }] } }]]);
  assert.equal((await lookupUPC("195866000010")).imageURL, "https://img/x.jpg");
  mockFetch([["upc=", { status: 404, body: { code: "INVALID_UPC" } }]]);
  assert.equal(await lookupUPC("000000000000"), null);
});

test("HTTP API: auth, validation, health", async (t) => {
  process.env.APP_PASSWORD = "sneakers";
  const server = createAppServer().listen(0);
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  mockFetchPassthrough(base);

  const post = (path, body, code) => fetch(`${base}/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(code ? { "x-access-code": code } : {}) },
    body: JSON.stringify(body),
  });

  assert.equal((await post("upc", { barcode: "195866000010" })).status, 401);
  assert.equal((await post("upc", { barcode: "123" }, "sneakers")).status, 400);
  const health = await (await fetch(`${base}/api/health`, { headers: { "x-access-code": "sneakers" } })).json();
  assert.deepEqual(
    { authRequired: health.authRequired, authorized: health.authorized, ebay: health.sources.ebay, stockx: health.sources.stockx },
    { authRequired: true, authorized: true, ebay: true, stockx: true },
  );
  const upc = await post("upc", { barcode: "0195866000010" }, "sneakers");
  assert.equal(upc.status, 200);
  assert.equal((await upc.json()).product.title, "Mock Shoe");
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
});

/** Local requests hit the real server; upstream API calls get canned data. */
function mockFetchPassthrough(base) {
  const local = realFetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith(base)) return local(url, options);
    if (String(url).includes("upcitemdb")) {
      return new Response(JSON.stringify({ items: [{ title: "Mock Shoe" }] }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
}
