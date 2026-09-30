import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCSV, planImport, readInventoryCSV } from "../shared/csvImport.js";
import { pairsToCSV, HEADER } from "../shared/exportCSV.js";
import { newPair } from "../shared/pairs.js";

test("parseCSV handles quotes, escapes, CRLF and embedded newlines", () => {
  assert.deepEqual(parseCSV('a,"b,c","d ""e"""\r\n"x\ny",,z\n'), [["a", "b,c", 'd "e"'], ["x\ny", "", "z"]]);
});

test("export → import round-trips every field", () => {
  const p = Object.assign(newPair("012345678905", { now: new Date(2026, 8, 30, 16, 23) }), {
    brand: "Nike", styleCode: "AH8145-014", size: "10.5", name: 'Air Max 1 "Black"', colorway: "Black/White",
    quantity: 2, retailPrice: 110, ebayMedian: 150, ebayLow: 120, ebayHigh: 180, ebayCount: 9,
    ebayBasis: "sold, size 10.5", stockxLowestAsk: 140, stockxHighestBid: 120, goatPrice: 145,
    stockxURLKey: "nike-air-max-1-black-white-2019", notes: "box damage, top shelf",
  });
  const [{ barcode, fields, scannedAt }] = readInventoryCSV("﻿" + pairsToCSV([p])).records;
  assert.equal(barcode, "012345678905"); // leading zero survives the ="..." wrapper
  assert.equal(scannedAt.getHours(), 16);
  for (const key of Object.values(fields)) void key;
  for (const k of ["brand", "styleCode", "size", "name", "colorway", "quantity", "retailPrice", "ebayMedian",
    "ebayLow", "ebayHigh", "ebayCount", "ebayBasis", "stockxLowestAsk", "stockxHighestBid", "goatPrice",
    "stockxURLKey", "notes"]) {
    assert.deepEqual(fields[k], p[k], k);
  }
});

test("merges by UPC: fills blanks, never erases, adds unknown UPCs", () => {
  const known = Object.assign(newPair("193658125581", { id: "a" }), {
    name: "Air Jordan 1 Retro High Og Core Purple", brand: "Air Jordan", notes: "my note",
    status: "partial", statusMessage: "No price sources set up on the server yet",
  });
  const blank = Object.assign(newPair("194276067314", { id: "b" }), {
    status: "failed", statusMessage: "Barcode not in UPC database",
  });
  const stillUnknown = Object.assign(newPair("198958957443", { id: "c" }), { status: "failed" });

  const csv = [
    HEADER.join(","),
    // Corrected name/style/size; Notes blank → keep "my note"
    `2026-09-30 16:24,"=""193658125581""",Jordan,555088-500,10.5,Air Jordan 1 Retro High OG Court Purple 2.0,,1,,,,,,,,,,,,,,https://stockx.com/search?s=555088-500,,,`,
    `2026-09-30 16:25,"=""194276067314""",Nike SB,CI2692-400,11,Nike SB Dunk High 'Doraemon',White/Blue/Red,1,,,,,,,,,,,,,,https://stockx.com/nike-sb-dunk-high-doraemon,,[Medium-High confidence],`,
    `2026-09-30 16:23,"=""198958957443""",,,,,,1,,,,,,,,,,,,,,,,,`,
    `2026-10-01 09:00,"=""195866000018""",Nike,DD1391-100,9,Dunk Low Panda,,3,$110.00,,,,,,,,,,,,,,,,`,
    `bad row,not-a-upc,,,,,,1`,
  ].join("\r\n");

  const plan = planImport([known, blank, stillUnknown], csv);
  const byId = Object.fromEntries(plan.updates.map((u) => [u.id, u.patch]));

  assert.equal(byId.a.styleCode, "555088-500");
  assert.equal(byId.a.brand, "Jordan");
  assert.equal(byId.a.notes, undefined); // blank cell does not erase
  assert.equal(byId.a.stockxURLKey, undefined); // search link isn't a product key
  assert.equal(byId.a.status, "done");
  assert.equal(byId.a.statusMessage, "");

  assert.equal(byId.b.size, "11");
  assert.equal(byId.b.stockxURLKey, "nike-sb-dunk-high-doraemon");
  assert.equal(byId.b.notes, "[Medium-High confidence]");

  assert.equal(byId.c, undefined); // nothing new for the unidentified pair
  assert.equal(plan.unchanged, 1);

  assert.equal(plan.additions.length, 1);
  assert.deepEqual(
    { barcode: plan.additions[0].barcode, qty: plan.additions[0].quantity, retail: plan.additions[0].retailPrice },
    { barcode: "195866000018", qty: 3, retail: 110 },
  );
  assert.equal(plan.skipped, 1);
});

test("rejects files without a UPC column", () => {
  assert.throws(() => planImport([], "Name,Price\nShoe,100\n"), /no UPC column/);
});
