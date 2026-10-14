import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { LABEL_SIZES, autoRotation, largestBlock, fitRect, pageSize } from "../shared/labelLayout.js";
import { imagesToPDF, packPixels } from "../shared/pdfWriter.js";

function rgba(width, height, inked = []) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [x, y] of inked) data.set([0, 0, 0, 255], (y * width + x) * 4);
  return data;
}

test("pageSize puts the long side across for horizontal", () => {
  assert.deepEqual(pageSize({ width: 4, height: 6 }), { width: 6, height: 4 });
  assert.deepEqual(pageSize({ width: 6, height: 4 }, "vertical"), { width: 4, height: 6 });
  for (const s of LABEL_SIZES) assert.ok(s.width >= s.height, s.id);
});

test("largestBlock finds the ink and ignores white and transparent pixels", () => {
  const data = rgba(10, 8, [[2, 3], [6, 5]]);
  data.set([0, 0, 0, 0], (0 * 10 + 9) * 4); // transparent black: not ink
  assert.deepEqual(largestBlock(data, 10, 8, { gap: 10 }), { x: 2, y: 3, width: 5, height: 3 });
  assert.deepEqual(largestBlock(data, 10, 8, { gap: 10, pad: 3 }), { x: 0, y: 0, width: 10, height: 8 });
  assert.equal(largestBlock(rgba(4, 4), 4, 4), null);
});

test("largestBlock keeps the label and drops instructions below it", () => {
  const ink = [];
  for (let y = 2; y <= 30; y++) { ink.push([2, y], [20, y]); } // label: 19 wide × 29 tall box sides
  for (let x = 2; x <= 20; x++) { ink.push([x, 2], [x, 30]); }
  for (let x = 0; x < 40; x++) ink.push([x, 45]); // instruction line across the page
  ink.push([35, 10]); // a stray mark to the right
  const box = largestBlock(rgba(40, 50, ink), 40, 50, { gap: 8 });
  assert.deepEqual(box, { x: 2, y: 2, width: 19, height: 29 });
  // With a gap bigger than the page nothing is split off.
  assert.deepEqual(largestBlock(rgba(40, 50, ink), 40, 50, { gap: 100 }), { x: 0, y: 2, width: 40, height: 44 });
});

test("autoRotation turns a tall label sideways on a wide page", () => {
  assert.equal(autoRotation(400, 600, { width: 6, height: 4 }), 90);
  assert.equal(autoRotation(600, 400, { width: 6, height: 4 }), 0);
  assert.equal(autoRotation(600, 400, { width: 4, height: 6 }), 90);
});

test("fitRect scales rotated content to fit and centres it", () => {
  // 4×6 portrait content rotated onto a 6×4 page fills it exactly.
  assert.deepEqual(fitRect(400, 600, 90, 1800, 1200), { scale: 3, width: 1800, height: 1200, x: 0, y: 0 });
  // Square content is letterboxed horizontally.
  const r = fitRect(100, 100, 0, 300, 100, 10);
  assert.equal(r.width, 80);
  assert.equal(r.x, 110);
  assert.equal(r.y, 10);
});

test("packPixels flattens transparency onto white", () => {
  const px = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255]);
  assert.deepEqual([...packPixels(px, true)], [0, 255, 76]);
  assert.deepEqual([...packPixels(px, false)], [0, 0, 0, 255, 255, 255, 255, 0, 0]);
});

test("imagesToPDF writes a page sized to the label with a valid xref", async () => {
  const bytes = await imagesToPDF([{ widthIn: 6, heightIn: 4, pixelWidth: 3, pixelHeight: 2, rgba: rgba(3, 2, [[1, 1]]), gray: true }]);
  const text = Buffer.from(bytes).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.endsWith("%%EOF\n"));
  assert.match(text, /\/MediaBox \[0 0 432 288\]/);
  assert.match(text, /\/Width 3 \/Height 2 \/ColorSpace \/DeviceGray/);

  // Every xref entry points at its "N 0 obj".
  const startxref = Number(text.match(/startxref\n(\d+)/)[1]);
  const entries = text.slice(startxref).split("\n").slice(3, 8);
  entries.forEach((line, i) => assert.ok(text.startsWith(`${i + 1} 0 obj`, Number(line.slice(0, 10)))));

  // The image stream decompresses back to the gray pixels.
  const len = Number(text.match(/\/FlateDecode \/Length (\d+)/)[1]);
  const start = text.indexOf("stream\n", text.indexOf("/FlateDecode")) + 7;
  assert.deepEqual([...inflateSync(bytes.subarray(start, start + len))], [255, 255, 255, 255, 0, 255]);
});
