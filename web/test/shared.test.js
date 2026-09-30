import { test } from "node:test";
import assert from "node:assert/strict";
import {
  barcodesMatch, normalizeBarcode, normalizeSize, styleCode, usSize,
} from "../shared/labelParser.js";
import { summarize } from "../shared/priceStats.js";
import { makeCSV, escapeField, textFormula } from "../shared/csv.js";
import { ebaySold } from "../shared/marketLinks.js";
import { estimatedValue, labelPatch, newPair, stockxPatch, upcPatch } from "../shared/pairs.js";
import { HEADER, pairsToCSV } from "../shared/exportCSV.js";

test("normalizeBarcode", () => {
  assert.equal(normalizeBarcode("0196153853891"), "196153853891");
  assert.equal(normalizeBarcode("196153853891"), "196153853891");
  assert.equal(normalizeBarcode("4066748895213"), "4066748895213");
  assert.equal(normalizeBarcode("00196153853891"), "196153853891");
  assert.equal(normalizeBarcode("12345"), null);
  assert.ok(barcodesMatch("0196153853891", "196153853891"));
  assert.ok(!barcodesMatch("196153853891", "196153853892"));
});

test("style codes", () => {
  assert.equal(styleCode("Air Jordan 1 Retro High OG DZ5485-612"), "DZ5485-612");
  assert.equal(styleCode("STYLE 555088-134 US 10"), "555088-134");
  assert.equal(styleCode("gel-kayano 14 1201a019-107"), "1201A019-107");
  assert.equal(styleCode("adidas Samba OG Cloud White IE3439"), "IE3439");
  assert.equal(styleCode("Yeezy Boost 350 V2 B75806"), "B75806");
  assert.equal(styleCode("Nike Dunk Low Panda Size 10 DD1391-100"), "DD1391-100");
  assert.equal(styleCode("Nike Dunk Low Panda Size 10"), null);
});

test("sizes", () => {
  const cases = {
    "US 10  UK 9  EUR 44  CM 28": "10", "US 5.5Y UK 5 EUR 38": "5.5Y", "US W 8": "8W",
    "US M 11.5": "11.5", "Nike Dunk Low Panda Size 10 DD1391-100": "10",
    "Jordan 4 Bred Reimagined Sz 9.5": "9.5", "Nike Air Force 1 Women's 8": "8W",
    "Dunk Low size 7 Womens": "7W", "Size: Men's 12": "12", "US 10C": "10C",
    "Nike Air Max 90": null, "Size 105": null,
  };
  for (const [text, expected] of Object.entries(cases)) assert.equal(usSize(text), expected, text);
  assert.equal(normalizeSize("US M 10"), "10");
  assert.equal(normalizeSize("10M"), "10");
  assert.equal(normalizeSize("W 8"), "8W");
  assert.equal(normalizeSize("5.5 Y"), "5.5Y");
});

test("price summary trims outliers", () => {
  assert.deepEqual(summarize([120, 130, 125, 140, 135, 900]), { count: 5, median: 130, low: 120, high: 140 });
  assert.equal(summarize([100, 200]).median, 150);
  assert.equal(summarize([]), null);
});

test("csv escaping", () => {
  assert.equal(makeCSV(["A", "B"], [['Jordan 1 "Chicago"', "x,y"]]), 'A,B\r\n"Jordan 1 ""Chicago""","x,y"\r\n');
  assert.equal(escapeField(textFormula("012345678905")), '"=""012345678905"""');
  assert.match(ebaySold("DZ5485-612 size 10"), /LH_Sold=1/);
});

test("label, UPC and StockX patches", () => {
  const p = newPair("196153853891");
  Object.assign(p, labelPatch(p, "NIKE\nDUNK LOW\nDD1391-100\nUS 10 UK 9 EUR 44"));
  assert.equal(p.styleCode, "DD1391-100");
  assert.equal(p.size, "10");

  const up = upcPatch(p, { title: "Nike Dunk Low Retro White Black Panda Size 10", brand: "Nike", model: "DD1391-100", color: "White/Black", size: "" });
  assert.equal(up.name, "Nike Dunk Low Retro White Black Panda Size 10");
  assert.equal(up.size, undefined); // already known from label

  const q = newPair("123456789012");
  Object.assign(q, { styleCode: "AB1234" }); // adidas-ish OCR guess gets overridden
  assert.equal(upcPatch(q, { title: "Samba", model: "IE3439", size: "9.5" }).styleCode, "IE3439");
  assert.equal(upcPatch(q, { title: "Samba", model: "IE3439", size: "9.5" }).size, "9.5");

  const sx = stockxPatch(p, { title: "Nike Dunk Low Retro White Black", brand: "Nike", styleId: "DD1391-100", size: "10", matchedByBarcode: true, lowestAsk: 95, highestBid: 80, urlKey: "nike-dunk-low", retailPrice: 110, colorway: "White/Black" });
  assert.equal(sx.stockxLowestAsk, 95);
  assert.equal(sx.retailPrice, 110);
});

test("estimated value priority", () => {
  const p = newPair("1");
  assert.equal(estimatedValue(p), null);
  Object.assign(p, { ebayMedian: 150, ebayBasis: "active listings, size 10" });
  assert.equal(estimatedValue(p).source, "eBay active median");
  Object.assign(p, { stockxLowestAsk: 140 });
  assert.equal(estimatedValue(p).source, "StockX lowest ask");
  Object.assign(p, { ebayBasis: "sold, size 10" });
  assert.deepEqual(estimatedValue(p), { amount: 150, source: "eBay sold median" });
});

test("spreadsheet export", () => {
  const p = Object.assign(newPair("196153853891", { now: new Date(2026, 8, 30, 14, 5) }), {
    name: 'Nike Dunk Low "Panda"', styleCode: "DD1391-100", size: "10", quantity: 2,
    ebayMedian: 120, ebayBasis: "sold, size 10", ebayCount: 14,
  });
  const lines = pairsToCSV([p]).trim().split("\r\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[0], HEADER.join(","));
  assert.ok(lines[1].startsWith('2026-09-30 14:05,"=""196153853891""",,DD1391-100,10,"Nike Dunk Low ""Panda""",,2,'));
  assert.ok(lines[1].includes(",120.00,eBay sold median,240.00,"));
});
