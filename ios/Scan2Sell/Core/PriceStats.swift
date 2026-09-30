import Foundation

public struct PriceSummary: Equatable, Sendable {
    public var count: Int
    public var median: Double
    public var low: Double
    public var high: Double
}

public enum PriceStats {
    /// Summarizes comparable prices. With five or more comps, outliers outside
    /// 1.5×IQR are dropped so a mislabeled listing (a lot of 3 pairs, a used
    /// beater, a replica) doesn't skew the result.
    public static func summarize(_ prices: [Double]) -> PriceSummary? {
        var values = prices.filter { $0 > 0 && $0.isFinite }.sorted()
        guard !values.isEmpty else { return nil }

        if values.count >= 5 {
            let q1 = quantile(values, 0.25), q3 = quantile(values, 0.75)
            let iqr = q3 - q1
            let trimmed = values.filter { $0 >= q1 - 1.5 * iqr && $0 <= q3 + 1.5 * iqr }
            if !trimmed.isEmpty { values = trimmed }
        }

        return PriceSummary(
            count: values.count,
            median: quantile(values, 0.5),
            low: values.first!,
            high: values.last!
        )
    }

    /// Linear-interpolated quantile of an already sorted array.
    static func quantile(_ sorted: [Double], _ q: Double) -> Double {
        guard sorted.count > 1 else { return sorted[0] }
        let pos = q * Double(sorted.count - 1)
        let lower = Int(pos.rounded(.down))
        let upper = min(lower + 1, sorted.count - 1)
        let frac = pos - Double(lower)
        return sorted[lower] + (sorted[upper] - sorted[lower]) * frac
    }
}
