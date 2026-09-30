import { displayName, estimatedValue, searchQuery } from "../shared/pairs.js";
import { ebaySold, goatSearch, stockxProduct, stockxSearch } from "../shared/marketLinks.js";
import { escapeHTML as h, money, money0, timeAgo } from "./util.js";

const svg = (path, size = 22) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

export const icons = {
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  share: svg('<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>'),
  barcode: svg('<path d="M3 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14"/>', 24),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  refresh: svg('<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>', 20),
  flash: svg('<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>'),
  warn: svg('<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>', 18),
  shoe: svg('<path d="M2 17h20v2H2zM2 17l1-7 5 1 3-4 4 3 5 2 2 5"/>', 26),
};

// ─── Inventory ──────────────────────────────────────────────────────────────

export function inventoryView({ pairs, pending, health, healthError, storageFailed }) {
  const totalPairs = pairs.reduce((n, p) => n + p.quantity, 0);
  const totalValue = pairs.reduce((sum, p) => sum + (estimatedValue(p)?.amount ?? 0) * p.quantity, 0);

  return `
  <header class="bar">
    <a class="icon-btn" href="#/settings" aria-label="Settings">${icons.gear}</a>
    <h1>Scan2Sell</h1>
    <button class="icon-btn" data-action="export" aria-label="Export spreadsheet" ${pairs.length ? "" : "disabled"}>${icons.share}</button>
  </header>
  <main class="content">
    ${setupBanner(health, healthError)}
    ${storageFailed ? `<div class="banner warn">${icons.warn}<span>This browser isn't saving your list (private browsing?). Export before closing.</span></div>` : ""}
    ${pairs.length === 0 ? emptyState() : `
      <section class="summary card">
        <div><span class="label">Pairs</span><strong>${totalPairs}</strong></div>
        <div><span class="label">Est. value</span><strong>${money0(totalValue)}</strong></div>
        ${pending ? `<div class="progress"><span class="spinner"></span>Looking up ${pending}…</div>` : ""}
      </section>
      <ul class="list card">${pairs.map(pairRow).join("")}</ul>`}
  </main>
  <footer class="scanbar">
    <button class="primary big" data-action="scan">${icons.barcode}<span>Scan</span></button>
  </footer>`;
}

function setupBanner(health, healthError) {
  if (healthError) {
    return `<div class="banner warn">${icons.warn}<span>Can't reach the server: ${h(healthError)}</span></div>`;
  }
  if (!health) return "";
  if (health.authRequired && !health.authorized) {
    return `<a class="banner" href="#/settings">${icons.warn}<span>${health.keyRequests
      ? "This app needs an access key to look up shoes and prices. Tap to enter or request one."
      : "Enter your access key in Settings to look up shoes and prices."}</span></a>`;
  }
  if (!health.sources.ebay && !health.sources.stockx) {
    return `<a class="banner" href="#/settings">${icons.warn}<span>No eBay or StockX keys on the server yet, so you'll get names but no prices. See Settings.</span></a>`;
  }
  return "";
}

const emptyState = () => `
  <div class="empty">
    ${icons.barcode}
    <h2>No sneakers yet</h2>
    <p>Tap <b>Scan</b> and point your camera at the barcode on each box. Scan2Sell looks up the style code, size and comparable prices, then exports a spreadsheet.</p>
  </div>`;

function pairRow(p) {
  const details = [p.styleCode, p.size ? `Size ${p.size}` : "Size ?", p.quantity > 1 ? `×${p.quantity}` : ""]
    .filter(Boolean).join(" · ");
  const chips = [
    p.ebayMedian != null && chip(p.ebayBasis.startsWith("sold") ? "eBay sold" : "eBay", p.ebayMedian),
    p.stockxLowestAsk != null && chip("StockX", p.stockxLowestAsk),
    p.goatPrice != null && chip("GOAT", p.goatPrice),
  ].filter(Boolean).join("");
  return `
  <li>
    <a class="row" href="#/item/${encodeURIComponent(p.id)}">
      <div class="thumb">${p.imageURL ? `<img src="${h(p.imageURL)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : icons.shoe}</div>
      <div class="row-main">
        <div class="row-title">${h(displayName(p))}</div>
        <div class="row-sub">${h(details)}</div>
        ${chips ? `<div class="chips">${chips}</div>` : ""}
      </div>
      <div class="row-status">${statusIcon(p)}</div>
    </a>
  </li>`;
}

const chip = (label, value) => `<span class="chip">${h(label)} ${money0(value)}</span>`;

function statusIcon(p) {
  if (p.status === "pending" || p.status === "lookingUp") return `<span class="spinner" aria-label="Looking up"></span>`;
  if (p.status === "failed") return `<span class="warn-icon" aria-label="Lookup failed">${icons.warn}</span>`;
  return "";
}

// ─── Item detail ────────────────────────────────────────────────────────────

const field = (label, name, value, attrs = "") => `
  <label class="field"><span>${label}</span>
    <input name="${name}" value="${h(value)}" autocomplete="off" autocorrect="off" spellcheck="false" ${attrs}>
  </label>`;

export function detailView(p) {
  return `
  <header class="bar">
    <a class="icon-btn text" href="#/">${icons.back}<span>Back</span></a>
    <h1 class="small">${h(p.styleCode || "Sneaker")}</h1>
    <button class="icon-btn" data-action="refresh" aria-label="Refresh prices">${icons.refresh}</button>
  </header>
  <main class="content" data-pair="${h(p.id)}">
    <section class="card form">
      <h3>Item</h3>
      <label class="field stack"><span>Description</span>
        <textarea name="name" rows="2" autocomplete="off" spellcheck="false">${h(p.name)}</textarea>
      </label>
      ${field("Brand", "brand", p.brand)}
      ${field("Style code", "styleCode", p.styleCode, 'autocapitalize="characters"')}
      ${field("Size (US)", "size", p.size)}
      ${field("Colorway", "colorway", p.colorway)}
      <div class="field"><span>Quantity</span>
        <div class="stepper">
          <button data-action="qty" data-delta="-1" aria-label="Decrease">−</button>
          <output data-live="quantity">${p.quantity}</output>
          <button data-action="qty" data-delta="1" aria-label="Increase">+</button>
        </div>
      </div>
      <div class="field"><span>UPC</span><span class="mono">${h(p.barcode)}</span></div>
      <p class="hint">Changed the style code or size? Tap ${icons.refresh} to re-run the price lookup.</p>
    </section>
    <section class="card" data-live="prices">${pricesSection(p)}</section>
    <section class="card form">
      <h3>GOAT</h3>
      <label class="field"><span>GOAT price</span>
        <input name="goatPrice" inputmode="decimal" placeholder="Enter from GOAT" value="${p.goatPrice ?? ""}">
      </label>
      <p class="hint">GOAT has no public API. Open the GOAT link below and type the price you see.</p>
    </section>
    <section class="card" data-live="links">${linksSection(p)}</section>
    <section class="card form">
      <h3>Notes</h3>
      <textarea name="notes" rows="3" placeholder="Condition, box damage, where it's stored…">${h(p.notes)}</textarea>
    </section>
    <div data-live="status">${statusSection(p)}</div>
    <button class="danger block" data-action="delete">Delete item</button>
  </main>`;
}

export function pricesSection(p) {
  const est = estimatedValue(p);
  const busy = p.status === "pending" || p.status === "lookingUp";
  return `
    <h3>Comparable prices ${busy ? `<span class="spinner"></span>` : ""}</h3>
    <dl class="kv">
      ${p.ebayMedian != null ? `
        <dt>eBay median</dt><dd>${money(p.ebayMedian)}</dd>
        <dt>eBay range</dt><dd>${money(p.ebayLow)} – ${money(p.ebayHigh)}</dd>
        <dt>Based on</dt><dd>${p.ebayCount ?? 0} ${h(p.ebayBasis)}</dd>` : `<dt>eBay</dt><dd>—</dd>`}
      <dt>StockX lowest ask</dt><dd>${money(p.stockxLowestAsk)}</dd>
      <dt>StockX highest bid</dt><dd>${money(p.stockxHighestBid)}</dd>
      <dt>GOAT</dt><dd>${money(p.goatPrice)}</dd>
      ${p.retailPrice ? `<dt>Retail</dt><dd>${money(p.retailPrice)}</dd>` : ""}
      ${est ? `<dt class="strong">Est. value</dt><dd class="strong">${money(est.amount)}<small>${h(est.source)}</small></dd>` : ""}
    </dl>
    ${p.lastLookup ? `<p class="hint">Updated ${timeAgo(p.lastLookup)}</p>` : ""}`;
}

export function linksSection(p) {
  const query = searchQuery(p);
  if (!query) return `<h3>Check comps yourself</h3><p class="hint">Add a style code or description to get links.</p>`;
  const styleOrName = p.styleCode || p.name;
  const stockx = p.stockxURLKey ? stockxProduct(p.stockxURLKey) : stockxSearch(styleOrName);
  return `
    <h3>Check comps yourself</h3>
    <div class="links">
      <a href="${h(ebaySold(query))}" target="_blank" rel="noopener">eBay sold listings ↗</a>
      <a href="${h(stockx)}" target="_blank" rel="noopener">StockX ↗</a>
      <a href="${h(goatSearch(styleOrName))}" target="_blank" rel="noopener">GOAT ↗</a>
    </div>`;
}

export const statusSection = (p) =>
  p.statusMessage ? `<section class="card"><h3>Lookup notes</h3><p class="hint">${h(p.statusMessage)}</p></section>` : "";

// ─── Settings ───────────────────────────────────────────────────────────────

const status = (ok, yes, no) => `<span class="${ok ? "ok" : "off"}">${ok ? "✓ " + yes : no}</span>`;

export function settingsView({ settings, health, healthError, count }) {
  const s = health?.sources;
  return `
  <header class="bar">
    <a class="icon-btn text" href="#/">${icons.back}<span>Back</span></a>
    <h1 class="small">Settings</h1>
    <span class="icon-btn"></span>
  </header>
  <main class="content">
    <section class="card form">
      <h3>Access key</h3>
      <label class="field"><span>Key</span>
        <input name="accessCode" type="password" value="${h(settings.accessCode)}" placeholder="S2S-XXXX-XXXX-…" autocomplete="current-password" autocapitalize="characters" spellcheck="false">
      </label>
      <p class="hint">${healthError ? `Can't reach the server: ${h(healthError)}`
        : !health ? "Checking…"
        : !health.authRequired ? "This server doesn't require a key."
        : health.authorized ? "✓ Key accepted." : settings.accessCode ? "That key isn't valid." : "Enter your key, or request one below."}</p>
      ${health?.authRequired && !health.authorized && health.keyRequests ? `
      <form class="request" data-action="request-key" novalidate>
        <p class="request-title">Don't have a key? Request one</p>
        <div class="manual">
          <input name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" aria-label="Your email" required>
          <button class="primary" type="submit">Request</button>
        </div>
        <input name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
        <p class="hint" data-live="request-status">We'll email you a key once your request is approved.</p>
      </form>` : ""}
    </section>

    <section class="card">
      <h3>Price sources on the server</h3>
      ${s ? `
      <dl class="kv">
        <dt>Barcode database</dt><dd>${status(true, s.upcPaidKey ? "UPCitemdb (paid)" : "UPCitemdb (free)", "")}</dd>
        <dt>eBay</dt><dd>${status(s.ebay, s.ebaySold ? "sold prices" : "active listings", "not set up")}</dd>
        <dt>StockX</dt><dd>${status(s.stockx, "connected", s.stockxAppKeys ? "needs sign-in" : "not set up")}</dd>
        <dt>GOAT</dt><dd><span class="off">links + manual price</span></dd>
      </dl>
      ${s.stockxAppKeys && !s.stockx ? `
        <a class="button block" href="/api/stockx-login?key=${encodeURIComponent(settings.accessCode)}">Connect StockX account</a>
        <p class="hint">Sign in to StockX, then copy the token it shows into the server's STOCKX_REFRESH_TOKEN setting and redeploy.</p>` : ""}
      <p class="hint">API keys are set as server environment variables. See the README.</p>` : `<p class="hint">—</p>`}
    </section>

    <section class="card form">
      <h3>Options</h3>
      <label class="toggle"><span>Read box labels with the camera<small>Grabs style code and size from the label text. Downloads about 5 MB the first time.</small></span>
        <input type="checkbox" name="ocr" ${settings.ocr ? "checked" : ""}></label>
      <label class="toggle"><span>Only compare new-condition eBay listings</span>
        <input type="checkbox" name="newOnly" ${settings.newOnly ? "checked" : ""}></label>
    </section>

    <section class="card">
      <h3>Data (${count} item${count === 1 ? "" : "s"} on this device)</h3>
      <label class="button block import">Import spreadsheet (CSV)
        <input type="file" name="import" accept=".csv,text/csv,text/comma-separated-values" hidden>
      </label>
      <p class="hint">Merges a Scan2Sell spreadsheet into this list by UPC. Filled-in cells update your items, blank cells leave them alone, and new UPCs are added.</p>
      <button class="block" data-action="refresh-all" ${count ? "" : "disabled"}>Refresh all prices</button>
      <button class="danger block" data-action="clear" ${count ? "" : "disabled"}>Delete all items</button>
      <p class="hint">Your list is saved only in this browser. Export regularly to keep a copy.</p>
    </section>
  </main>`;
}

// ─── Scanner overlay ────────────────────────────────────────────────────────

export function scannerPanel({ last, error }) {
  const lastHTML = last ? `
    <div class="last">
      <div class="last-text">
        <small>${last.duplicate ? `Added another (×${last.pair.quantity})` : "Added"}</small>
        <strong>${h(displayName(last.pair))}</strong>
        <span>${h([last.pair.styleCode, last.pair.size && `Size ${last.pair.size}`].filter(Boolean).join(" · ") || "Looking up…")}</span>
      </div>
      <div class="last-actions">
        <button data-action="undo">Undo</button>
        <button data-action="plus-one">+1</button>
      </div>
    </div>` : `<p class="hint center">Point the camera at the barcode on the box label</p>`;
  return `${error ? `<p class="error">${h(error)}</p>` : ""}${lastHTML}`;
}
