// Layout math for the label printer: trimming, rotation and fitting.
// Sizes are in inches, written wide side first (horizontal).

export const LABEL_SIZES = [
  { id: "4x6", name: "4 × 6 in shipping (Rollo, Munbyn, Zebra, Dymo 4XL)", width: 6, height: 4 },
  { id: "dymo30256", name: "Dymo 30256 shipping (2-5/16 × 4 in)", width: 4, height: 2.3125 },
  { id: "dymo30252", name: "Dymo 30252 address (1-1/8 × 3-1/2 in)", width: 3.5, height: 1.125 },
  { id: "brother62", name: "Brother 62 mm × 100 mm", width: 100 / 25.4, height: 62 / 25.4 },
  { id: "3x2", name: "3 × 2 in", width: 3, height: 2 },
  { id: "2x1", name: "2 × 1 in", width: 2, height: 1 },
  { id: "custom", name: "Custom size…", width: 6, height: 4 },
];

/** Page size in inches for a size + orientation ("horizontal" puts the long side across). */
export function pageSize({ width, height }, orientation = "horizontal") {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  return orientation === "vertical" ? { width: short, height: long } : { width: long, height: short };
}

/**
 * Bounds of the biggest block of ink: the page is split wherever a blank strip at
 * least `gap` pixels wide runs all the way across (or down), and the largest piece
 * is kept, repeatedly. Drops the instructions and receipts printed around a
 * shipping label on a letter-size page. Returns null for a blank image.
 */
export function largestBlock(data, width, height, { threshold = 240, gap = 100, pad = 0 } = {}) {
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    mask[p] = data[i + 3] >= 16 && (data[i] < threshold || data[i + 1] < threshold || data[i + 2] < threshold) ? 1 : 0;
  }
  let box = { x: 0, y: 0, width, height };
  for (let round = 0; round < 8; round++) {
    const next = splitLargest(mask, width, box, "y", gap) ?? box;
    const both = splitLargest(mask, width, next, "x", gap) ?? next;
    if (both.x === box.x && both.y === box.y && both.width === box.width && both.height === box.height) break;
    box = both;
  }
  if (!box.width || !box.height) return null;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  return { x, y, width: Math.min(width, box.x + box.width + pad) - x, height: Math.min(height, box.y + box.height + pad) - y };
}

/** Splits `box` into runs of ink along one axis, shrinks each to its ink, returns the biggest. */
function splitLargest(mask, stride, box, axis, gap) {
  const along = axis === "y" ? box.height : box.width;
  const inked = new Uint8Array(along);
  for (let j = 0; j < box.height; j++) {
    const row = (box.y + j) * stride + box.x;
    for (let i = 0; i < box.width; i++) {
      if (mask[row + i]) {
        if (axis === "y") { inked[j] = 1; break; }
        inked[i] = 1;
      }
    }
  }
  const runs = [];
  let start = -1, lastInk = -1;
  for (let k = 0; k < along; k++) {
    if (!inked[k]) continue;
    if (start < 0) start = k;
    else if (k - lastInk > gap) {
      runs.push([start, lastInk]);
      start = k;
    }
    lastInk = k;
  }
  if (start < 0) return { ...box, width: 0, height: 0 };
  runs.push([start, lastInk]);

  let best = null, bestArea = -1;
  for (const [a, b] of runs) {
    const piece = axis === "y"
      ? { x: box.x, y: box.y + a, width: box.width, height: b - a + 1 }
      : { x: box.x + a, y: box.y, width: b - a + 1, height: box.height };
    const area = piece.width * piece.height;
    if (area > bestArea) [best, bestArea] = [piece, area];
  }
  return best;
}

/** Rotation (degrees clockwise) that makes content match the page's orientation. */
export function autoRotation(contentWidth, contentHeight, page) {
  const contentWide = contentWidth >= contentHeight;
  const pageWide = page.width >= page.height;
  return contentWide === pageWide ? 0 : 90;
}

/**
 * Where to draw content (after rotation) on a page of `pageW`×`pageH` pixels:
 * scaled to fit inside the margin, centred.
 */
export function fitRect(contentWidth, contentHeight, rotation, pageW, pageH, margin = 0) {
  const sideways = rotation % 180 !== 0;
  const w = sideways ? contentHeight : contentWidth;
  const h = sideways ? contentWidth : contentHeight;
  const availW = Math.max(1, pageW - 2 * margin);
  const availH = Math.max(1, pageH - 2 * margin);
  const scale = Math.min(availW / w, availH / h);
  const drawW = w * scale;
  const drawH = h * scale;
  return { scale, width: drawW, height: drawH, x: (pageW - drawW) / 2, y: (pageH - drawH) / 2 };
}
