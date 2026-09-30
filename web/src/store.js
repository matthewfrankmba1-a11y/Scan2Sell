import { storage } from "./util.js";

// Scanned pairs and settings live on this device (localStorage).
const PAIRS_KEY = "scan2sell.pairs.v1";
const SETTINGS_KEY = "scan2sell.settings.v1";

let pairs = storage.get(PAIRS_KEY, []);
export const settings = Object.assign(
  { accessCode: "", ocr: true, newOnly: true },
  storage.get(SETTINGS_KEY, {}),
);

const listeners = new Set();
let saveFailed = false;

export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const storageFailed = () => saveFailed;
export const notify = () => listeners.forEach((fn) => fn());

function commit() {
  saveFailed = !storage.set(PAIRS_KEY, pairs);
  listeners.forEach((fn) => fn());
}

export const getPairs = () => pairs;
export const getPair = (id) => pairs.find((p) => p.id === id);
export const findByBarcode = (barcode) => pairs.find((p) => p.barcode === barcode);

export function addPair(pair) {
  pairs = [pair, ...pairs];
  commit();
}

export function updatePair(id, patch) {
  let changed = false;
  pairs = pairs.map((p) => {
    if (p.id !== id) return p;
    changed = true;
    return { ...p, ...patch };
  });
  if (changed) commit();
}

export function removePair(id) {
  pairs = pairs.filter((p) => p.id !== id);
  commit();
}

export function clearPairs() {
  pairs = [];
  commit();
}

export function saveSettings(patch) {
  Object.assign(settings, patch);
  storage.set(SETTINGS_KEY, settings);
  listeners.forEach((fn) => fn());
}
