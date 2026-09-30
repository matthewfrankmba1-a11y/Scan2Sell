import Foundation

struct StockXMatch {
    var productId: String
    var urlKey: String
    var title: String
    var brand: String
    var styleId: String
    var colorway: String
    var retailPrice: Double?
    var size: String
    var lowestAsk: Double?
    var highestBid: Double?
    var matchedByBarcode: Bool
}

/// StockX public API v2 (developer.stockx.com). Needs an API key plus an OAuth
/// refresh token obtained once through the Settings screen.
actor StockXClient {
    struct Credentials {
        var apiKey: String
        var clientID: String
        var clientSecret: String
        var refreshToken: String

        var isComplete: Bool {
            ![apiKey, clientID, clientSecret, refreshToken].contains(where: \.isEmpty)
        }
    }

    static let shared = StockXClient()

    private let base = "https://api.stockx.com/v2"
    private static let tokenURL = URL(string: "https://accounts.stockx.com/oauth/token")!
    private var accessToken: String?
    private var tokenExpiry = Date.distantPast
    private var lastRequest = Date.distantPast

    // MARK: Models

    private struct SearchResponse: Decodable {
        var products: [Product]?
    }

    private struct Product: Decodable {
        struct Attributes: Decodable {
            var colorway: String?
            var retailPrice: FlexibleDouble?
        }
        var productId: String
        var urlKey: String?
        var styleId: String?
        var title: String?
        var brand: String?
        var productAttributes: Attributes?
    }

    private struct Variant: Decodable {
        struct GTIN: Decodable { var identifier: String? }
        var variantId: String
        var variantValue: String?
        var gtins: [GTIN]?
    }

    private struct MarketData: Decodable {
        var lowestAskAmount: FlexibleDouble?
        var highestBidAmount: FlexibleDouble?
    }

    struct TokenResponse: Decodable {
        var access_token: String
        var refresh_token: String?
        var expires_in: Double?
    }

    // MARK: Lookup

    /// Finds the StockX product + size variant for a pair: first by exact
    /// barcode (GTIN), then by style code + size.
    func match(barcode: String, styleCode: String, size: String, credentials: Credentials) async throws -> StockXMatch? {
        if let hit = try await matchByBarcode(barcode, credentials) { return hit }
        guard !styleCode.isEmpty else { return nil }
        return try await matchByStyle(styleCode, size: size, credentials)
    }

    private func matchByBarcode(_ barcode: String, _ creds: Credentials) async throws -> StockXMatch? {
        let products = try await searchProducts(barcode, creds)
        for product in products.prefix(3) {
            let productVariants = try await fetchVariants(product.productId, creds)
            if let variant = productVariants.first(where: { v in
                v.gtins?.contains { LabelParser.barcodesMatch($0.identifier ?? "", barcode) } == true
            }) {
                return try await buildMatch(product, variant, byBarcode: true, creds)
            }
        }
        return nil
    }

    private func matchByStyle(_ styleCode: String, size: String, _ creds: Credentials) async throws -> StockXMatch? {
        let wanted = LabelParser.normalizeStyleCode(styleCode)
        let products = try await searchProducts(styleCode, creds)
        guard let product = products.first(where: { p in
            (p.styleId ?? "").split(separator: "/").contains {
                LabelParser.normalizeStyleCode(String($0)) == wanted
            }
        }) else { return nil }

        let productVariants = try await fetchVariants(product.productId, creds)
        let wantedSize = LabelParser.normalizeSize(size)
        let variant = size.isEmpty ? nil : productVariants.first(where: {
            LabelParser.normalizeSize($0.variantValue ?? "") == wantedSize
        })
        guard let variant else {
            return StockXMatch(
                productId: product.productId, urlKey: product.urlKey ?? "", title: product.title ?? "",
                brand: product.brand ?? "", styleId: product.styleId ?? styleCode,
                colorway: product.productAttributes?.colorway ?? "",
                retailPrice: product.productAttributes?.retailPrice?.value,
                size: size, lowestAsk: nil, highestBid: nil, matchedByBarcode: false
            )
        }
        return try await buildMatch(product, variant, byBarcode: false, creds)
    }

    private func buildMatch(_ product: Product, _ variant: Variant, byBarcode: Bool, _ creds: Credentials) async throws -> StockXMatch {
        let market = try? await fetchMarketData(product.productId, variant.variantId, creds)
        return StockXMatch(
            productId: product.productId,
            urlKey: product.urlKey ?? "",
            title: product.title ?? "",
            brand: product.brand ?? "",
            styleId: product.styleId ?? "",
            colorway: product.productAttributes?.colorway ?? "",
            retailPrice: product.productAttributes?.retailPrice?.value,
            size: variant.variantValue ?? "",
            lowestAsk: market?.lowestAskAmount?.value,
            highestBid: market?.highestBidAmount?.value,
            matchedByBarcode: byBarcode
        )
    }

    // MARK: Endpoints

    private func searchProducts(_ query: String, _ creds: Credentials) async throws -> [Product] {
        var components = URLComponents(string: "\(base)/catalog/search")!
        components.queryItems = [
            URLQueryItem(name: "query", value: query),
            URLQueryItem(name: "pageNumber", value: "1"),
            URLQueryItem(name: "pageSize", value: "10"),
        ]
        let data = try await get(components.url!, creds)
        return try JSONDecoder().decode(SearchResponse.self, from: data).products ?? []
    }

    private func fetchVariants(_ productId: String, _ creds: Credentials) async throws -> [Variant] {
        let data = try await get(URL(string: "\(base)/catalog/products/\(productId)/variants")!, creds)
        return try JSONDecoder().decode([Variant].self, from: data)
    }

    private func fetchMarketData(_ productId: String, _ variantId: String, _ creds: Credentials) async throws -> MarketData {
        var components = URLComponents(string: "\(base)/catalog/products/\(productId)/variants/\(variantId)/market-data")!
        components.queryItems = [URLQueryItem(name: "currencyCode", value: "USD")]
        let data = try await get(components.url!, creds)
        return try JSONDecoder().decode(MarketData.self, from: data)
    }

    private func get(_ url: URL, _ creds: Credentials) async throws -> Data {
        // StockX allows roughly one request per second.
        let wait = 1.1 - Date().timeIntervalSince(lastRequest)
        if wait > 0 { try await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
        lastRequest = Date()

        var request = URLRequest(url: url)
        request.setValue(creds.apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("Bearer \(try await token(creds))", forHTTPHeaderField: "Authorization")
        return try await HTTP.send(request, service: "StockX")
    }

    // MARK: OAuth

    private func token(_ creds: Credentials) async throws -> String {
        if let accessToken, Date() < tokenExpiry { return accessToken }
        let response = try await Self.requestToken(creds, params: [
            "grant_type": "refresh_token",
            "refresh_token": creds.refreshToken,
        ])
        if let newRefresh = response.refresh_token, !newRefresh.isEmpty {
            KeychainStore.set(newRefresh, for: SecretKey.stockxRefreshToken)
        }
        accessToken = response.access_token
        tokenExpiry = Date().addingTimeInterval((response.expires_in ?? 3600) - 120)
        return response.access_token
    }

    func resetToken() {
        accessToken = nil
        tokenExpiry = .distantPast
    }

    static func authorizeURL(clientID: String, redirectURI: String) -> URL? {
        var components = URLComponents(string: "https://accounts.stockx.com/authorize")!
        components.queryItems = [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "scope", value: "offline_access openid"),
            URLQueryItem(name: "audience", value: "gateway.stockx.com"),
            URLQueryItem(name: "state", value: UUID().uuidString),
        ]
        return components.url
    }

    /// Exchanges the one-time authorization code (from the redirect URL after
    /// signing in) for a long-lived refresh token.
    static func exchange(code: String, redirectURI: String, clientID: String, clientSecret: String) async throws -> String {
        let creds = Credentials(apiKey: "", clientID: clientID, clientSecret: clientSecret, refreshToken: "")
        let response = try await requestToken(creds, params: [
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirectURI,
        ])
        guard let refresh = response.refresh_token else {
            throw APIError(message: "StockX didn't return a refresh token (is offline_access enabled for your app?)")
        }
        return refresh
    }

    private static func requestToken(_ creds: Credentials, params: [String: String]) async throws -> TokenResponse {
        var request = URLRequest(url: tokenURL)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var body = params
        body["client_id"] = creds.clientID
        body["client_secret"] = creds.clientSecret
        body["audience"] = "gateway.stockx.com"
        request.httpBody = HTTP.formBody(body)
        let data = try await HTTP.send(request, service: "StockX login")
        return try JSONDecoder().decode(TokenResponse.self, from: data)
    }
}
