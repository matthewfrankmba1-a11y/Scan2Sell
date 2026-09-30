// Preloaded into server.js for end-to-end tests (`node --import`): answers
// UPCitemdb / StockX / eBay calls with canned data instead of the internet.
const realFetch = globalThis.fetch;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

globalThis.fetch = async (url, options) => {
  const u = String(url);
  if (u.includes("upcitemdb.com")) {
    return u.includes("195866000018")
      ? json({ code: "OK", items: [{ title: "Nike Dunk Low Retro White Black Panda Mens Size 10", brand: "Nike", model: "DD1391-100", color: "White/Black", images: [] }] })
      : json({ code: "OK", items: [] });
  }
  if (u.includes("accounts.stockx.com/oauth/token")) return json({ access_token: "AT", expires_in: 3600 });
  if (u.includes("api.stockx.com")) {
    if (u.includes("/market-data")) return json({ lowestAskAmount: "98", highestBidAmount: "84" });
    if (u.includes("/variants")) return json([{ variantId: "v10", variantValue: "10", gtins: [{ identifier: "195866000018" }] }]);
    if (u.includes("/catalog/search")) {
      return json({ products: [{ productId: "p1", urlKey: "nike-dunk-low-retro-white-black-2021", styleId: "DD1391-100",
        title: "Nike Dunk Low Retro White Black Panda", brand: "Nike",
        productAttributes: { colorway: "White/Black", retailPrice: 110 } }] });
    }
  }
  if (u.includes("api.ebay.com/identity")) return json({ access_token: "E", expires_in: 7200 });
  if (u.includes("api.ebay.com/buy/browse")) {
    const prices = [112, 118, 120, 125, 129, 450];
    return json({ itemSummaries: prices.map((p) => ({ title: `Nike Dunk Low Panda DD1391-100 Size 10`, price: { value: String(p) } })) });
  }
  if (u.includes("discord.com/api/webhooks")) {
    console.log("[mock discord]", options?.method, u.replace(/webhooks\/\d+\/[\w-]+/, "webhooks/…"), options?.body ?? "");
    return json({ id: "999" });
  }
  if (u.includes("api.brevo.com")) {
    console.log("[mock brevo] to", JSON.parse(options.body).to[0].email);
    return json({ messageId: "m1" }, 201);
  }
  return realFetch(url, options);
};
