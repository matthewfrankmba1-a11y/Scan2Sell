import { env, fetchJSON, UpstreamError } from "./http.js";

/**
 * Barcode → product via UPCitemdb. The free trial endpoint needs no key
 * (about 100 lookups/day); UPCITEMDB_KEY switches to the paid endpoint.
 */
export async function lookupUPC(barcode) {
  const key = env("UPCITEMDB_KEY");
  const base = key
    ? "https://api.upcitemdb.com/prod/v1/lookup"
    : "https://api.upcitemdb.com/prod/trial/lookup";
  const headers = { Accept: "application/json" };
  if (key) Object.assign(headers, { user_key: key, key_type: "3scale" });

  let data;
  try {
    data = await fetchJSON("UPCitemdb", `${base}?upc=${encodeURIComponent(barcode)}`, { headers });
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 404 || err.status === 400)) return null;
    throw err;
  }
  const item = data?.items?.[0];
  if (!item?.title) return null;
  return {
    title: item.title,
    brand: item.brand ?? "",
    model: item.model ?? "",
    color: item.color ?? "",
    size: item.size ?? "",
    imageURL: item.images?.[0] ?? null,
  };
}
