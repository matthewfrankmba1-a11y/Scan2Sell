import Foundation

/// Deep links for checking comps by hand. GOAT has no public API, so its link
/// is the only way the app reaches it.
public enum MarketLinks {
    public static func searchQuery(styleCode: String, name: String, size: String) -> String {
        let base = styleCode.isEmpty ? name : styleCode
        guard !base.isEmpty else { return "" }
        return size.isEmpty ? base : "\(base) size \(size)"
    }

    public static func ebaySold(query: String) -> URL? {
        url("https://www.ebay.com/sch/i.html", [
            "_nkw": query, "LH_Sold": "1", "LH_Complete": "1", "_sop": "13",
        ])
    }

    public static func stockxSearch(query: String) -> URL? {
        url("https://stockx.com/search", ["s": query])
    }

    public static func stockxProduct(urlKey: String) -> URL? {
        URL(string: "https://stockx.com/\(urlKey)")
    }

    public static func goatSearch(query: String) -> URL? {
        url("https://www.goat.com/search", ["query": query])
    }

    private static func url(_ base: String, _ params: [String: String]) -> URL? {
        guard var components = URLComponents(string: base) else { return nil }
        components.queryItems = params.sorted { $0.key < $1.key }
            .map { URLQueryItem(name: $0.key, value: $0.value) }
        return components.url
    }
}
