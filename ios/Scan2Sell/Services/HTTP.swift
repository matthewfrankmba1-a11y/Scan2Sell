import Foundation

struct APIError: LocalizedError {
    let message: String
    var errorDescription: String? { message }

    static func http(_ service: String, _ status: Int, _ data: Data) -> APIError {
        let body = String(decoding: data.prefix(200), as: UTF8.self)
        switch status {
        case 401: return APIError(message: "\(service): unauthorized — check credentials in Settings")
        case 403: return APIError(message: "\(service): access denied (403)")
        case 429: return APIError(message: "\(service): rate limited, try again later")
        default: return APIError(message: "\(service): HTTP \(status) \(body)")
        }
    }
}

enum HTTP {
    static func send(_ request: URLRequest, service: String) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw APIError.http(service, status, data) }
        return data
    }

    static func formBody(_ params: [String: String]) -> Data {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        let body = params.map { key, value in
            "\(key)=\(value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value)"
        }.joined(separator: "&")
        return Data(body.utf8)
    }
}

/// Decodes a price that APIs send either as a JSON number or a string ("150.00").
struct FlexibleDouble: Decodable {
    let value: Double?

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let d = try? container.decode(Double.self) {
            value = d
        } else if let s = try? container.decode(String.self) {
            value = Double(s)
        } else {
            value = nil
        }
    }
}
