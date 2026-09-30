// Deep links for checking comps by hand. GOAT has no public API, so its link
// is the only way the app reaches it.

export function searchQuery({ styleCode, name, size }) {
  const base = styleCode || name || "";
  if (!base) return "";
  return size ? `${base} size ${size}` : base;
}

const withParams = (base, params) => `${base}?${new URLSearchParams(params)}`;

export const ebaySold = (query) =>
  withParams("https://www.ebay.com/sch/i.html", { _nkw: query, LH_Sold: "1", LH_Complete: "1", _sop: "13" });

export const stockxSearch = (query) => withParams("https://stockx.com/search", { s: query });

export const stockxProduct = (urlKey) => `https://stockx.com/${encodeURIComponent(urlKey)}`;

export const goatSearch = (query) => withParams("https://www.goat.com/search", { query });
