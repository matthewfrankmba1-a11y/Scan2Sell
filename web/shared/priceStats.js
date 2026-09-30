/** Linear-interpolated quantile of an already sorted array. */
export function quantile(sorted, q) {
  if (sorted.length === 1) return sorted[0];
  const pos = q * (sorted.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.min(lower + 1, sorted.length - 1);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

/**
 * Median / low / high of comparable prices. With five or more comps, values
 * outside 1.5×IQR are dropped so a lot-of-3 listing, a beat-up pair or a
 * replica doesn't skew the result.
 */
export function summarize(prices) {
  let values = prices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  if (values.length === 0) return null;

  if (values.length >= 5) {
    const q1 = quantile(values, 0.25);
    const q3 = quantile(values, 0.75);
    const iqr = q3 - q1;
    const trimmed = values.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
    if (trimmed.length) values = trimmed;
  }

  return {
    count: values.length,
    median: quantile(values, 0.5),
    low: values[0],
    high: values[values.length - 1],
  };
}
