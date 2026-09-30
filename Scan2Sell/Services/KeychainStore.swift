import Foundation
import Security

/// Tiny wrapper for storing API credentials in the iOS Keychain.
enum KeychainStore {
    private static let service = "Scan2Sell"

    static func get(_ key: String) -> String {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return "" }
        return String(decoding: data, as: UTF8.self)
    }

    static func set(_ value: String, for key: String) {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(base as CFDictionary)
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        var add = base
        add[kSecValueData as String] = Data(trimmed.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }
}

enum SecretKey {
    static let upcItemDBKey = "upcitemdb.key"
    static let ebayClientID = "ebay.clientId"
    static let ebayClientSecret = "ebay.clientSecret"
    static let stockxAPIKey = "stockx.apiKey"
    static let stockxClientID = "stockx.clientId"
    static let stockxClientSecret = "stockx.clientSecret"
    static let stockxRefreshToken = "stockx.refreshToken"
}

enum SettingKey {
    static let ebayUseSoldData = "ebay.useSoldData"
    static let ebayNewOnly = "ebay.newOnly"
    static let stockxRedirectURI = "stockx.redirectURI"
}
