import Foundation

struct EbayComps {
    var summary: PriceSummary
    /// e.g. "sold, size 10" or "active listings, all sizes"
    var basis: String
}

/// eBay comps via the official Buy APIs.
/// - Marketplace Insights (real *sold* prices, last 90 days) needs eBay to grant
///   your app access; enable it in Settings once approved.
/// - Browse (current *active* listings) works for any developer key and is the fallback.
actor EbayClient {
    struct Credentials {
        var clientID: String
        var clientSecret: String
        var isComplete: Bool { !clientID.isEmpty && !clientSecret.isEmpty }
    }

    static let shared = EbayClient()

    private static let athleticShoesCategory = "15709"
    private static let baseScope = "https://api.ebay.com/oauth/api_scope"
    private static let insightsScope = "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights"

    private var tokens: [String: (token: String, expiry: Date)] = [:]

    private struct Price: Decodable { var value: FlexibleDouble? }
    private struct BrowseResponse: Decodable {
        struct Item: Decodable { var title: String?; var price: Price? }
        var itemSummaries: [Item]?
    }
    private struct InsightsResponse: Decodable {
        struct Sale: Decodable { var title: String?; var lastSoldPrice: Price? }
        var itemSales: [Sale]?
    }
    private struct TokenResponse: Decodable {
        var access_token: String
        var expires_in: Double?
    }

    private struct Listing { var title: String; var price: Double }

    func comps(styleCode: String, name: String, size: String, useSoldData: Bool, newOnly: Bool,
               credentials: Credentials) async throws -> EbayComps? {
        let query = styleCode.isEmpty ? name : styleCode
        guard !query.isEmpty else { return nil }

        var soldError: Error?
        if useSoldData {
            do {
                if let result = try await bestComps(query: query, styleCode: styleCode, size: size, sold: true,
                                                    newOnly: newOnly, credentials) {
                    return result
                }
            } catch {
                soldError = error
            }
        }
        let active = try await bestComps(query: query, styleCode: styleCode, size: size, sold: false,
                                         newOnly: newOnly, credentials)
        if active == nil, let soldError { throw soldError }
        return active
    }

    /// Tries a size-filtered search first, then an all-sizes search filtered
    /// by the size in each listing title, then all sizes.
    private func bestComps(query: String, styleCode: String, size: String, sold: Bool, newOnly: Bool,
                           _ creds: Credentials) async throws -> EbayComps? {
        let kind = sold ? "sold" : "active listings"

        if !size.isEmpty {
            let fetched = try await fetch(query: query, size: size, sold: sold, newOnly: newOnly, creds)
            let sized = relevant(fetched, styleCode: styleCode)
            if let summary = PriceStats.summarize(sized.map(\.price)) {
                return EbayComps(summary: summary, basis: "\(kind), size \(size)")
            }
        }

        let fetched = try await fetch(query: query, size: nil, sold: sold, newOnly: newOnly, creds)
        let all = relevant(fetched, styleCode: styleCode)
        if !size.isEmpty {
            let wanted = LabelParser.normalizeSize(size)
            let titleMatched = all.filter {
                LabelParser.usSize(in: $0.title).map(LabelParser.normalizeSize) == wanted
            }
            if let summary = PriceStats.summarize(titleMatched.map(\.price)) {
                return EbayComps(summary: summary, basis: "\(kind), size \(size)")
            }
        }
        guard let summary = PriceStats.summarize(all.map(\.price)) else { return nil }
        return EbayComps(summary: summary, basis: "\(kind), all sizes")
    }

    /// When most results mention the style code, drop the ones that don't
    /// (keyword search pulls in lookalikes and accessories).
    private func relevant(_ listings: [Listing], styleCode: String) -> [Listing] {
        guard !styleCode.isEmpty else { return listings }
        let wanted = LabelParser.normalizeStyleCode(styleCode)
        let matching = listings.filter { LabelParser.normalizeStyleCode($0.title).contains(wanted) }
        return matching.count >= 3 ? matching : listings
    }

    private func fetch(query: String, size: String?, sold: Bool, newOnly: Bool, _ creds: Credentials) async throws -> [Listing] {
        let endpoint = sold
            ? "https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search"
            : "https://api.ebay.com/buy/browse/v1/item_summary/search"
        var items = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "limit", value: "50"),
        ]
        var filters: [String] = []
        if !sold { filters.append("buyingOptions:{FIXED_PRICE|AUCTION}") }
        if newOnly { filters.append("conditionIds:{1000}") }
        if !filters.isEmpty { items.append(URLQueryItem(name: "filter", value: filters.joined(separator: ","))) }
        if let size {
            let ebaySize = LabelParser.normalizeSize(size).filter { $0.isNumber || $0 == "." }
            items.append(URLQueryItem(name: "category_ids", value: Self.athleticShoesCategory))
            items.append(URLQueryItem(name: "aspect_filter",
                                      value: "categoryId:\(Self.athleticShoesCategory),US Shoe Size:{\(ebaySize)}"))
        }

        var components = URLComponents(string: endpoint)!
        components.queryItems = items
        var request = URLRequest(url: components.url!)
        request.setValue("EBAY_US", forHTTPHeaderField: "X-EBAY-C-MARKETPLACE-ID")
        request.setValue("Bearer \(try await token(sold ? Self.insightsScope : Self.baseScope, creds))",
                         forHTTPHeaderField: "Authorization")

        let data = try await HTTP.send(request, service: sold ? "eBay sold data" : "eBay")
        if sold {
            let sales = try JSONDecoder().decode(InsightsResponse.self, from: data).itemSales ?? []
            return sales.compactMap { s in
                s.lastSoldPrice?.value?.value.map { Listing(title: s.title ?? "", price: $0) }
            }
        } else {
            let listings = try JSONDecoder().decode(BrowseResponse.self, from: data).itemSummaries ?? []
            return listings.compactMap { l in
                l.price?.value?.value.map { Listing(title: l.title ?? "", price: $0) }
            }
        }
    }

    private func token(_ scope: String, _ creds: Credentials) async throws -> String {
        if let cached = tokens[scope], Date() < cached.expiry { return cached.token }
        var request = URLRequest(url: URL(string: "https://api.ebay.com/identity/v1/oauth2/token")!)
        request.httpMethod = "POST"
        let basic = Data("\(creds.clientID):\(creds.clientSecret)".utf8).base64EncodedString()
        request.setValue("Basic \(basic)", forHTTPHeaderField: "Authorization")
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = HTTP.formBody(["grant_type": "client_credentials", "scope": scope])
        let data = try await HTTP.send(request, service: "eBay login")
        let response = try JSONDecoder().decode(TokenResponse.self, from: data)
        tokens[scope] = (response.access_token, Date().addingTimeInterval((response.expires_in ?? 7200) - 120))
        return response.access_token
    }

    func resetTokens() { tokens = [:] }
}
