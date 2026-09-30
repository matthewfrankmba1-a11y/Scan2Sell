import "./styles.css";
import * as store from "./store.js";
import { getHealth } from "./api.js";
import { enqueue, pendingCount, waitForLabel } from "./lookup.js";
import { exportSpreadsheet } from "./exporter.js";
import { readLabel } from "./ocr.js";
import { normalizeBarcode } from "../shared/labelParser.js";
import { labelPatch, newPair } from "../shared/pairs.js";
import { planImport } from "../shared/csvImport.js";
import * as views from "./views.js";

const app = document.getElementById("app");
const scannerEl = document.getElementById("scanner");
const scanPanel = document.getElementById("scan-last");
const scanCount = document.getElementById("scan-count");
const torchBtn = document.getElementById("torch");

let health = null;
let healthError = null;
let route = parseRoute();
let renderedKey = null;
let listScroll = 0;

// ─── Routing & rendering ────────────────────────────────────────────────────

function parseRoute() {
  const hash = location.hash.slice(1) || "/";
  const item = hash.match(/^\/item\/(.+)$/);
  if (item) return { name: "item", id: decodeURIComponent(item[1]) };
  if (hash === "/settings") return { name: "settings" };
  return { name: "list" };
}

function render() {
  const key = JSON.stringify(route);
  const sameView = key === renderedKey;

  if (route.name === "item") {
    const pair = store.getPair(route.id);
    if (!pair) return void (location.hash = "#/");
    if (sameView) return updateDetail(pair);
    app.innerHTML = views.detailView(pair);
  } else if (route.name === "settings") {
    if (sameView && document.activeElement?.matches("#app input")) return; // don't clobber typing
    app.innerHTML = views.settingsView({
      settings: store.settings, health, healthError, count: store.getPairs().length,
    });
  } else {
    app.innerHTML = views.inventoryView({
      pairs: store.getPairs(), pending: pendingCount(), health, healthError,
      storageFailed: store.storageFailed(),
    });
  }

  if (!sameView) window.scrollTo(0, route.name === "list" ? listScroll : 0);
  renderedKey = key;
}

/** Refreshes the detail page in place without disturbing a field being edited. */
function updateDetail(pair) {
  for (const input of app.querySelectorAll("input[name], textarea[name]")) {
    if (input === document.activeElement) continue;
    const value = pair[input.name] ?? "";
    if (input.value !== String(value)) input.value = value;
  }
  const live = (name, html) => {
    const el = app.querySelector(`[data-live="${name}"]`);
    if (el && el.innerHTML !== html) el.innerHTML = html;
  };
  live("prices", views.pricesSection(pair));
  live("links", views.linksSection(pair));
  live("status", views.statusSection(pair));
  live("quantity", String(pair.quantity));
}

window.addEventListener("hashchange", () => {
  if (route.name === "list") listScroll = window.scrollY;
  route = parseRoute();
  render();
});

store.subscribe(() => {
  render();
  if (!scannerEl.hidden) renderScanPanel();
});

async function refreshHealth() {
  try {
    health = await getHealth({ refresh: true });
    healthError = null;
  } catch (err) {
    health = null;
    healthError = err.message;
  }
  renderedKey = null; // settings page shows health: force a full render
  render();
}

// ─── Actions ────────────────────────────────────────────────────────────────

const currentPairId = () => app.querySelector("[data-pair]")?.dataset.pair;

const actions = {
  scan: openScanner,
  export: () => exportSpreadsheet(store.getPairs()),
  refresh: () => enqueue(currentPairId()),
  qty: (el) => {
    const pair = store.getPair(currentPairId());
    if (pair) store.updatePair(pair.id, { quantity: Math.max(1, pair.quantity + Number(el.dataset.delta)) });
  },
  delete: () => {
    const id = currentPairId();
    if (id && confirm("Delete this item?")) {
      location.hash = "#/";
      store.removePair(id);
    }
  },
  "refresh-all": () => {
    [...store.getPairs()].reverse().forEach((p) => enqueue(p.id));
    location.hash = "#/";
  },
  clear: () => {
    const n = store.getPairs().length;
    if (confirm(`Delete all ${n} items? Export first if you want a copy.`)) {
      store.clearPairs();
      location.hash = "#/";
    }
  },
  "close-scanner": closeScanner,
  torch: toggleTorch,
  undo: undoLast,
  "plus-one": () => {
    const pair = last && store.getPair(last.id);
    if (pair) store.updatePair(pair.id, { quantity: pair.quantity + 1 });
  },
};

document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el || el.tagName === "FORM" || el.disabled) return;
  const action = actions[el.dataset.action];
  if (action) {
    event.preventDefault();
    action(el);
  }
});

// Detail page edits save as you type.
app.addEventListener("input", (event) => {
  const input = event.target;
  const id = currentPairId();
  if (!id || !input.name) return;
  let value = input.value;
  if (input.name === "goatPrice") {
    const n = parseFloat(value.replace(/[^0-9.]/g, ""));
    value = Number.isFinite(n) && n > 0 ? n : null;
  } else if (input.name === "styleCode") {
    value = value.toUpperCase();
  } else if (input.name === "name") {
    value = value.replace(/\s*\n\s*/g, " ");
  }
  store.updatePair(id, { [input.name]: value });
});

// Settings save on change.
app.addEventListener("change", (event) => {
  const input = event.target;
  if (route.name !== "settings" || !input.name) return;
  if (input.name === "import") {
    importSpreadsheet(input);
  } else if (input.type === "checkbox") {
    store.saveSettings({ [input.name]: input.checked });
  } else if (input.name === "accessCode") {
    store.saveSettings({ accessCode: input.value.trim() });
    refreshHealth();
  }
});

async function importSpreadsheet(input) {
  const file = input.files?.[0];
  input.value = ""; // allow picking the same file again
  if (!file) return;
  let plan;
  try {
    plan = planImport(store.getPairs(), await file.text());
  } catch (err) {
    return alert(`Couldn't import ${file.name}: ${err.message}`);
  }
  const { updates, additions, unchanged, skipped } = plan;
  if (!updates.length && !additions.length) {
    return alert(`Nothing to change: all ${unchanged} matching items already have this data.`);
  }
  store.applyImport(plan);
  const lines = [
    updates.length && `Updated ${updates.length} item${updates.length === 1 ? "" : "s"}`,
    additions.length && `Added ${additions.length} new item${additions.length === 1 ? "" : "s"}`,
    unchanged && `${unchanged} already up to date`,
    skipped && `${skipped} row${skipped === 1 ? "" : "s"} skipped (no valid UPC)`,
  ].filter(Boolean);
  alert(lines.join("\n"));
  location.hash = "#/";
}

// ─── Scanner ────────────────────────────────────────────────────────────────

let scanner = null;
let last = null; // { id, duplicate }
let sessionCount = 0;
let scanError = "";
let audio = null;

async function openScanner() {
  // Audio must be unlocked by a tap on iOS.
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
  } catch { /* no beep, that's fine */ }

  scannerEl.hidden = false;
  document.body.classList.add("scanning");
  last = null;
  sessionCount = 0;
  scanError = "";
  renderScanPanel();
  await startCamera();
}

async function startCamera() {
  try {
    const { Scanner } = await import("./scanner.js");
    scanner ??= new Scanner(scannerEl.querySelector("video"), addScanned);
    await scanner.start();
    torchBtn.hidden = !scanner.torchSupported;
  } catch (err) {
    scanError = err.name === "NotAllowedError"
      ? "Camera access was blocked. Allow it in Settings › Safari › Camera (or the site's settings), then try again. You can still type UPCs below."
      : err.name === "NotFoundError"
        ? "No camera found. You can type UPCs below."
        : err.message || "Couldn't start the camera.";
    renderScanPanel();
  }
}

function closeScanner() {
  scanner?.stop();
  scannerEl.hidden = true;
  document.body.classList.remove("scanning");
  torchBtn.classList.remove("on");
}

async function toggleTorch() {
  const on = !torchBtn.classList.contains("on");
  try {
    await scanner?.setTorch(on);
    torchBtn.classList.toggle("on", on);
  } catch { /* unsupported */ }
}

document.addEventListener("visibilitychange", () => {
  if (scannerEl.hidden || !scanner) return;
  if (document.hidden) scanner.stop();
  else startCamera();
});

function renderScanPanel() {
  const pair = last && store.getPair(last.id);
  if (last && !pair) last = null;
  scanPanel.innerHTML = views.scannerPanel({ last: pair ? { ...last, pair } : null, error: scanError });
  scanCount.textContent = sessionCount === 1 ? "1 scan" : `${sessionCount} scans`;
}

function addScanned(barcode, frame) {
  const existing = store.findByBarcode(barcode);
  if (existing) {
    last = { id: existing.id, duplicate: true };
    store.updatePair(existing.id, { quantity: existing.quantity + 1 });
  } else {
    const pair = newPair(barcode);
    last = { id: pair.id, duplicate: false };
    store.addPair(pair);
    if (store.settings.ocr && frame) {
      const job = readLabel(frame).then((text) => {
        const current = store.getPair(pair.id);
        if (current) store.updatePair(pair.id, labelPatch(current, text));
      });
      job.catch(() => {}); // OCR is best effort
      waitForLabel(pair.id, job);
    }
    enqueue(pair.id);
  }
  sessionCount += 1;
  scanError = "";
  feedback();
  renderScanPanel();
}

function undoLast() {
  const pair = last && store.getPair(last.id);
  if (!pair) return;
  if (last.duplicate && pair.quantity > 1) store.updatePair(pair.id, { quantity: pair.quantity - 1 });
  else store.removePair(pair.id);
  last = null;
  sessionCount = Math.max(0, sessionCount - 1);
  renderScanPanel();
}

function feedback() {
  navigator.vibrate?.(60);
  const flash = scannerEl.querySelector(".flash");
  flash.classList.remove("go");
  void flash.offsetWidth; // restart the animation
  flash.classList.add("go");
  if (!audio) return;
  try {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 1760;
    gain.gain.setValueAtTime(0.15, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.12);
  } catch { /* ignore */ }
}

scannerEl.querySelector("form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = event.target.elements.upc;
  const barcode = normalizeBarcode(input.value);
  if (!barcode) {
    scanError = "That doesn't look like a UPC (8, 12 or 13 digits).";
    return renderScanPanel();
  }
  input.value = "";
  addScanned(barcode, null);
});

// ─── Start ──────────────────────────────────────────────────────────────────

render();
refreshHealth();
// Resume lookups interrupted by closing the app.
store.getPairs()
  .filter((p) => p.status === "pending" || p.status === "lookingUp")
  .reverse()
  .forEach((p) => enqueue(p.id));
