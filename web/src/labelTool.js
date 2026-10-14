// Label printer: open a downloaded shipping label (PDF or image), trim the white
// space, turn it horizontal, fit it to a label size, then print or save it.

import { LABEL_SIZES, autoRotation, largestBlock, fitRect, pageSize } from "../shared/labelLayout.js";
import { imagesToPDF } from "../shared/pdfWriter.js";
import { escapeHTML as h, shareFile, storage } from "./util.js";
import { icons } from "./views.js";

const DPI = 300; // output resolution; thermal printers are 203–300 dpi
const MARGIN_IN = 0.05; // keeps the edges from being clipped by the printer
const MAX_PIXELS = 16_000_000; // stay under iOS Safari's canvas limit
const BW_THRESHOLD = 170;

const saved = storage.get("labelSettings", {});
const state = {
  file: null, // { name, kind: "pdf" | "image", doc?, image?, pages }
  pageIndex: 0,
  sizeId: saved.sizeId ?? "4x6",
  custom: saved.custom ?? { width: 6, height: 4 },
  // Tall by default: Zebra, Rollo and most 4×6 thermal printers feed labels tall.
  // Saved as "layout" so a horizontal choice saved before this default changed is dropped.
  orientation: saved.layout ?? "vertical",
  trim: saved.trim ?? true,
  bw: saved.bw ?? false,
  extraRotation: 0, // the user's taps on Rotate, on top of the automatic turn
  busy: false,
  error: "",
  pageCanvas: null, // the source page, rasterized
  content: null, // pageCanvas trimmed to the ink
  output: null, // final label canvas
};

const saveSettings = () => storage.set("labelSettings", {
  sizeId: state.sizeId, custom: state.custom, layout: state.orientation, trim: state.trim, bw: state.bw,
});

function labelSize() {
  const preset = LABEL_SIZES.find((s) => s.id === state.sizeId) ?? LABEL_SIZES[0];
  return pageSize(preset.id === "custom" ? state.custom : preset, state.orientation);
}

const inches = (n) => `${+n.toFixed(2)}″`;

// ─── View ───────────────────────────────────────────────────────────────────

export function labelView() {
  return `
  <header class="bar">
    <a class="icon-btn text" href="#/">${icons.back}<span>Back</span></a>
    <h1 class="small">Label printer</h1>
    <span class="icon-btn"></span>
  </header>
  <main class="content" data-label-tool>
    <section class="card">
      <label class="button block import">${icons.file}<span>Choose label file</span>
        <input type="file" name="labelFile" accept="application/pdf,.pdf,image/*" hidden>
      </label>
      <p class="hint" data-region="file"></p>
    </section>
    <div data-region="body"></div>
  </main>`;
}

function fileHint() {
  if (!state.file) {
    return "Pick a shipping label you downloaded (PDF, PNG or JPG). It's trimmed, turned to match your label and sized to fit.";
  }
  const pages = state.file.pages > 1 ? ` · page ${state.pageIndex + 1} of ${state.file.pages}` : "";
  return `${h(state.file.name)}${pages}`;
}

function bodyHTML() {
  const size = labelSize();
  const error = state.error ? `<div class="banner warn">${icons.warn}<span>${h(state.error)}</span></div>` : "";
  const preview = state.file ? `
    <section class="card">
      <h3>Preview · ${inches(size.width)} × ${inches(size.height)} ${state.busy ? `<span class="spinner"></span>` : ""}</h3>
      <div class="label-preview" style="aspect-ratio: ${size.width} / ${size.height}" data-region="preview"></div>
      <div class="label-row">
        ${state.file.pages > 1 ? `<button data-label="page" data-delta="-1" ${state.pageIndex === 0 ? "disabled" : ""} aria-label="Previous page">‹ Page</button>` : ""}
        <button data-label="rotate">${icons.refresh}<span>Rotate</span></button>
        ${state.file.pages > 1 ? `<button data-label="page" data-delta="1" ${state.pageIndex >= state.file.pages - 1 ? "disabled" : ""} aria-label="Next page">Page ›</button>` : ""}
      </div>
    </section>` : "";

  const custom = state.sizeId === "custom" ? `
      <label class="field"><span>Width (in)</span>
        <input name="customWidth" inputmode="decimal" value="${state.custom.width}"></label>
      <label class="field"><span>Height (in)</span>
        <input name="customHeight" inputmode="decimal" value="${state.custom.height}"></label>` : "";

  return `${error}${preview}
    <section class="card form">
      <h3>Label</h3>
      <label class="field"><span>Size</span>
        <select name="sizeId">${LABEL_SIZES.map((s) =>
          `<option value="${s.id}" ${s.id === state.sizeId ? "selected" : ""}>${h(s.name)}</option>`).join("")}
        </select></label>
      ${custom}
      <label class="field"><span>Layout</span>
        <select name="orientation">
          <option value="vertical" ${state.orientation === "vertical" ? "selected" : ""}>Vertical (tall)</option>
          <option value="horizontal" ${state.orientation === "horizontal" ? "selected" : ""}>Horizontal (wide)</option>
        </select></label>
      <label class="toggle"><span>Trim white space<small>Cuts a label out of a full letter-size page.</small></span>
        <input type="checkbox" name="trim" ${state.trim ? "checked" : ""}></label>
      <label class="toggle"><span>Black &amp; white<small>Sharper barcodes on thermal label printers.</small></span>
        <input type="checkbox" name="bw" ${state.bw ? "checked" : ""}></label>
    </section>
    <section class="card">
      <button class="primary" data-label="print" ${state.output ? "" : "disabled"}>${icons.printer}<span>Print</span></button>
      <div class="label-row">
        <button data-label="pdf" ${state.output ? "" : "disabled"}>Save PDF</button>
        <button data-label="png" ${state.output ? "" : "disabled"}>Save image</button>
      </div>
      <p class="hint">Print uses the label size above; pick your label printer and set paper size to match.
        For printers with their own app (Dymo Connect, Brother iPrint&amp;Label, Rollo, Phomemo, Munbyn),
        tap Save PDF or Save image and open it in that app.</p>
    </section>`;
}

let root = null;

function renderBody() {
  if (!root?.isConnected) return;
  root.querySelector('[data-region="file"]').innerHTML = fileHint();
  root.querySelector('[data-region="body"]').innerHTML = bodyHTML();
  const preview = root.querySelector('[data-region="preview"]');
  if (preview && state.output) preview.append(state.output);
}

/** Wires up the label tool inside a freshly rendered labelView(). */
export function mountLabelTool(main) {
  root = main;
  renderBody();
  main.addEventListener("change", onChange);
  main.addEventListener("click", onClick);
}

// ─── Events ─────────────────────────────────────────────────────────────────

function onChange(event) {
  const input = event.target;
  switch (input.name) {
    case "labelFile": {
      const file = input.files?.[0];
      input.value = ""; // allow picking the same file again
      if (file) openFile(file);
      return;
    }
    case "sizeId":
    case "orientation":
      state[input.name] = input.value;
      state.extraRotation = 0;
      break;
    case "customWidth":
    case "customHeight": {
      const n = parseFloat(input.value);
      if (!(n > 0 && n <= 24)) return void (input.value = state.custom[input.name === "customWidth" ? "width" : "height"]);
      state.custom = { ...state.custom, [input.name === "customWidth" ? "width" : "height"]: n };
      break;
    }
    case "trim":
      state.trim = input.checked;
      state.content = null;
      break;
    case "bw":
      state.bw = input.checked;
      break;
    default:
      return;
  }
  saveSettings();
  refresh();
}

function onClick(event) {
  const el = event.target.closest("[data-label]");
  if (!el || el.disabled) return;
  event.preventDefault();
  const action = el.dataset.label;
  if (action === "rotate") {
    state.extraRotation = (state.extraRotation + 90) % 360;
    refresh();
  } else if (action === "page") {
    goToPage(state.pageIndex + Number(el.dataset.delta));
  } else if (action === "print") {
    printLabel();
  } else if (action === "pdf") {
    savePDF();
  } else if (action === "png") {
    savePNG();
  }
}

// ─── Pipeline: file → page canvas → trimmed content → label ────────────────

async function openFile(file) {
  state.error = "";
  state.busy = true;
  renderBody();
  try {
    const isPDF = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    state.file?.doc?.destroy();
    state.file = isPDF ? await loadPDF(file) : await loadImage(file);
    state.pageIndex = 0;
    state.extraRotation = 0;
    state.pageCanvas = state.content = state.output = null;
  } catch (err) {
    state.busy = false;
    state.error = `Couldn't open ${file.name}: ${err.message || "unsupported file"}`;
    return renderBody();
  }
  refresh();
}

async function loadPDF(file) {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.min.mjs"), // legacy = polyfilled for older iPhones
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  return { name: file.name, kind: "pdf", doc, pages: doc.numPages };
}

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { name: file.name, kind: "image", image, pages: 1 };
  } catch {
    throw new Error("this browser can't read that image");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function goToPage(index) {
  if (!state.file || index < 0 || index >= state.file.pages) return;
  state.pageIndex = index;
  state.extraRotation = 0;
  state.pageCanvas = state.content = null;
  refresh();
}

let job = 0;

/** Recomputes whatever is stale and redraws. Later calls supersede earlier ones. */
async function refresh() {
  const mine = ++job;
  if (!state.file) return renderBody();
  state.busy = true;
  renderBody();
  try {
    if (!state.pageCanvas) {
      const canvas = await rasterize(state.file, state.pageIndex);
      if (mine !== job) return;
      state.pageCanvas = canvas;
    }
    state.content ??= trimCanvas(state.pageCanvas, state.trim);
    state.output = composeLabel(state.content);
    state.error = "";
  } catch (err) {
    if (mine !== job) return;
    state.output = null;
    state.error = `Couldn't draw the label: ${err.message}`;
  }
  state.busy = false;
  renderBody();
}

const newCanvas = (width, height) => Object.assign(document.createElement("canvas"), { width, height });

function whiteCanvas(width, height) {
  const canvas = newCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

async function rasterize(file, pageIndex) {
  if (file.kind === "image") {
    const { naturalWidth: w, naturalHeight: h } = file.image;
    const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (w * h)));
    const { canvas, ctx } = whiteCanvas(Math.round(w * scale), Math.round(h * scale));
    ctx.drawImage(file.image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  const page = await file.doc.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 }); // 72 points per inch
  const scale = Math.min(DPI / 72, Math.sqrt(MAX_PIXELS / (base.width * base.height)));
  const viewport = page.getViewport({ scale });
  const { canvas, ctx } = whiteCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas;
}

function trimCanvas(source, trim) {
  if (!trim) return source;
  const { width, height } = source;
  const { data } = source.getContext("2d").getImageData(0, 0, width, height);
  // A blank strip ~4% of the page (about ½ inch on letter paper) separates the label from anything else.
  const long = Math.max(width, height);
  const box = largestBlock(data, width, height, { gap: Math.round(long * 0.04), pad: Math.round(long * 0.004) });
  if (!box || (box.width === width && box.height === height)) return source;
  const { canvas, ctx } = whiteCanvas(box.width, box.height);
  ctx.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  return canvas;
}

function composeLabel(content) {
  const size = labelSize();
  const pageW = Math.round(size.width * DPI);
  const pageH = Math.round(size.height * DPI);
  const rotation = (autoRotation(content.width, content.height, size) + state.extraRotation) % 360;
  const rect = fitRect(content.width, content.height, rotation, pageW, pageH, MARGIN_IN * DPI);

  const { canvas, ctx } = whiteCanvas(pageW, pageH);
  ctx.imageSmoothingQuality = "high";
  ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  const w = content.width * rect.scale;
  const hgt = content.height * rect.scale;
  ctx.drawImage(content, -w / 2, -hgt / 2, w, hgt);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (state.bw) {
    const image = ctx.getImageData(0, 0, pageW, pageH);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < BW_THRESHOLD ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(image, 0, 0);
  }
  canvas.className = "label-canvas";
  return canvas;
}

// ─── Output ─────────────────────────────────────────────────────────────────

function outputName(ext) {
  const base = (state.file?.name ?? "label").replace(/\.[^.]+$/, "");
  const pages = state.file?.pages > 1 ? `-p${state.pageIndex + 1}` : "";
  return `${base}${pages}-label.${ext}`;
}

async function savePNG() {
  const blob = await new Promise((resolve) => state.output.toBlob(resolve, "image/png"));
  if (blob) shareFile(new File([blob], outputName("png"), { type: "image/png" }), "Shipping label");
}

async function savePDF() {
  const canvas = state.output;
  const size = labelSize();
  const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  const bytes = await imagesToPDF([{
    widthIn: size.width, heightIn: size.height,
    pixelWidth: canvas.width, pixelHeight: canvas.height, rgba: data, gray: state.bw,
  }]);
  shareFile(new File([bytes], outputName("pdf"), { type: "application/pdf" }), "Shipping label");
}

function printLabel() {
  const size = labelSize();
  let holder = document.getElementById("print-label");
  if (!holder) {
    holder = Object.assign(document.createElement("div"), { id: "print-label" });
    document.body.append(holder);
  }
  let pageStyle = document.getElementById("print-page");
  if (!pageStyle) {
    pageStyle = Object.assign(document.createElement("style"), { id: "print-page" });
    document.head.append(pageStyle);
  }
  pageStyle.textContent = `@page { size: ${size.width}in ${size.height}in; margin: 0; }`;
  const img = new Image();
  img.style.width = `${size.width}in`;
  img.style.height = `${size.height}in`;
  img.onload = () => window.print();
  img.src = state.output.toDataURL("image/png");
  holder.replaceChildren(img);
}
