import Foundation

struct UPCProduct {
    var title: String
    var brand: String
    var model: String
    var color: String
    var size: String
    var imageURL: String?
}

/// Barcode → product name via UPCitemdb. Works with no key on the free trial
/// endpoint (about 100 lookups/day); a paid key raises the limit.
struct UPCLookupClient {
    var apiKey: String

    private struct Response: Decodable {
        struct Item: Decodable {
            var title: String?
            var brand: String?
            var model: String?
            var color: String?
            var size: String?
            var images: [String]?
        }
        var code: String?
        var items: [Item]?
    }

    func lookup(_ barcode: String) async throws -> UPCProduct? {
        let endpoint = apiKey.isEmpty
            ? "https://api.upcitemdb.com/prod/trial/lookup"
            : "https://api.upcitemdb.com/prod/v1/lookup"
        var components = URLComponents(string: endpoint)!
        components.queryItems = [URLQueryItem(name: "upc", value: barcode)]
        var request = URLRequest(url: components.url!)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if !apiKey.isEmpty {
            request.setValue(apiKey, forHTTPHeaderField: "user_key")
            request.setValue("3scale", forHTTPHeaderField: "key_type")
        }

        let data: Data
        do {
            data = try await HTTP.send(request, service: "UPCitemdb")
        } catch let error as APIError where error.message.contains("HTTP 404") {
            return nil
        }
        let response = try JSONDecoder().decode(Response.self, from: data)
        guard let item = response.items?.first, let title = item.title, !title.isEmpty else {
            return nil
        }
        return UPCProduct(
            title: title,
            brand: item.brand ?? "",
            model: item.model ?? "",
            color: item.color ?? "",
            size: item.size ?? "",
            imageURL: item.images?.first
        )
    }
}
