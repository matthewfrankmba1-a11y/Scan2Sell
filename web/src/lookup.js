import { api, getHealth } from "./api.js";
import { getPair, notify, settings, updatePair } from "./store.js";
import { ebayPatch, stockxPatch, upcPatch } from "../shared/pairs.js";
import { sleep } from "./util.js";

// Looks pairs up one at a time (keeps API rate limits happy).
const queue = [];
const labelReads = new Map(); // id → promise for OCR still running
let running = false;
let current = null;

export const pendingCount = () => queue.length + (current ? 1 : 0);

/** Lookups wait (briefly) for the label OCR so they can use its style code/size. */
export function waitForLabel(id, promise) {
  labelReads.set(id, promise);
}

export function enqueue(id) {
  if (queue.includes(id) || current === id) return;
  queue.push(id);
  updatePair(id, { status: "pending" });
  run();
}

async function run() {
  if (running) return;
  running = true;
  while (queue.length) {
    current = queue.shift();
    try {
      await lookUp(current);
    } catch (err) {
      updatePair(current, { status: "failed", statusMessage: err.message });
    }
    current = null;
  }
  running = false;
  notify(); // refresh the progress indicator
}

async function lookUp(id) {
  if (!getPair(id)) return;
  updatePair(id, { status: "lookingUp" });

  const label = labelReads.get(id);
  if (label) {
    await Promise.race([label.catch(() => {}), sleep(20000)]);
    labelReads.delete(id);
  }

  const health = await getHealth({ refresh: true });
  if (health.authRequired && !health.authorized) {
    updatePair(id, { status: "failed", statusMessage: "Enter the access code in Settings" });
    return;
  }

  const problems = [];
  let found = false;
  const step = async (fn) => {
    const pair = getPair(id);
    if (!pair) return false;
    try {
      await fn(pair);
    } catch (err) {
      problems.push(err.message);
    }
    return true;
  };

  await step(async (pair) => {
    if (pair.name) return;
    const { product } = await api("upc", { barcode: pair.barcode });
    if (!product) return problems.push("Barcode not in UPC database");
    updatePair(id, upcPatch(pair, product));
    found = true;
  });

  if (health.sources.stockx) {
    await step(async (pair) => {
      const { match } = await api("stockx", { barcode: pair.barcode, styleCode: pair.styleCode, size: pair.size });
      if (!match) return problems.push("Not found on StockX");
      updatePair(id, stockxPatch(pair, match));
      found = true;
    });
  }

  if (health.sources.ebay) {
    await step(async (pair) => {
      const { comps } = await api("ebay", {
        styleCode: pair.styleCode, name: pair.name, size: pair.size, newOnly: settings.newOnly,
      });
      if (!comps) return problems.push("No eBay comps");
      updatePair(id, ebayPatch(comps));
      found = true;
    });
  }

  if (!health.sources.stockx && !health.sources.ebay) {
    problems.push("No price sources set up on the server yet");
  }

  const pair = getPair(id);
  if (!pair) return;
  const identified = pair.name || pair.styleCode;
  updatePair(id, {
    lastLookup: new Date().toISOString(),
    statusMessage: problems.join(" · "),
    status: problems.length === 0 ? "done" : found || identified ? "partial" : "failed",
  });
}
