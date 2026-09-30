import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    @AppStorage(SettingKey.ebayUseSoldData) private var ebayUseSoldData = false
    @AppStorage(SettingKey.ebayNewOnly) private var ebayNewOnly = true
    @AppStorage(SettingKey.stockxRedirectURI) private var stockxRedirectURI = ""

    @State private var upcKey = KeychainStore.get(SecretKey.upcItemDBKey)
    @State private var ebayClientID = KeychainStore.get(SecretKey.ebayClientID)
    @State private var ebayClientSecret = KeychainStore.get(SecretKey.ebayClientSecret)
    @State private var stockxAPIKey = KeychainStore.get(SecretKey.stockxAPIKey)
    @State private var stockxClientID = KeychainStore.get(SecretKey.stockxClientID)
    @State private var stockxClientSecret = KeychainStore.get(SecretKey.stockxClientSecret)
    @State private var stockxConnected = !KeychainStore.get(SecretKey.stockxRefreshToken).isEmpty

    @State private var pastedRedirect = ""
    @State private var stockxMessage: String?
    @State private var connecting = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField("UPCitemdb key (optional)", text: $upcKey)
                } header: {
                    Text("Barcode lookup")
                } footer: {
                    Text("Works without a key (about 100 lookups/day). A paid key from upcitemdb.com raises the limit.")
                }

                Section {
                    TextField("App ID (Client ID)", text: $ebayClientID)
                        .autocorrectionDisabled().textInputAutocapitalization(.never)
                    SecureField("Cert ID (Client Secret)", text: $ebayClientSecret)
                    Toggle("Use sold prices (Marketplace Insights)", isOn: $ebayUseSoldData)
                    Toggle("Only compare new condition", isOn: $ebayNewOnly)
                } header: {
                    Text("eBay")
                } footer: {
                    Text("Free keys at developer.ebay.com (production keyset). Sold-price data needs eBay to approve your app for the Marketplace Insights API. Until then leave it off and you'll get current listing prices instead. The eBay sold link on each item always shows real sold listings.")
                }

                stockxSection

                Section("GOAT") {
                    Text("GOAT has no public API. Each item has a GOAT link, and you can type the price you see into the item's GOAT price field.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { save(); dismiss() }
                }
            }
        }
    }

    private var stockxSection: some View {
        Section {
            SecureField("API key", text: $stockxAPIKey)
            TextField("Client ID", text: $stockxClientID)
                .autocorrectionDisabled().textInputAutocapitalization(.never)
            SecureField("Client secret", text: $stockxClientSecret)
            TextField("Redirect URI (from your StockX app)", text: $stockxRedirectURI)
                .autocorrectionDisabled().textInputAutocapitalization(.never).keyboardType(.URL)

            if stockxConnected {
                Label("Connected", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                Button("Disconnect", role: .destructive) {
                    KeychainStore.set("", for: SecretKey.stockxRefreshToken)
                    stockxConnected = false
                    Task { await StockXClient.shared.resetToken() }
                }
            } else {
                Button("1. Sign in to StockX") {
                    save()
                    if let url = StockXClient.authorizeURL(clientID: stockxClientID, redirectURI: stockxRedirectURI) {
                        openURL(url)
                    }
                }
                .disabled(stockxClientID.isEmpty || stockxRedirectURI.isEmpty)
                TextField("2. Paste the page URL you land on", text: $pastedRedirect, axis: .vertical)
                    .autocorrectionDisabled().textInputAutocapitalization(.never)
                Button {
                    connectStockX()
                } label: {
                    HStack {
                        Text("3. Connect")
                        if connecting { Spacer(); ProgressView() }
                    }
                }
                .disabled(pastedRedirect.isEmpty || stockxClientSecret.isEmpty || connecting)
            }
            if let stockxMessage {
                Text(stockxMessage).font(.footnote).foregroundStyle(.secondary)
            }
        } header: {
            Text("StockX")
        } footer: {
            Text("Register an app at developer.stockx.com to get an API key, client ID/secret, and a redirect URI. Then sign in once here. After you sign in, StockX sends you to your redirect URI. Copy that page's full URL (it contains ?code=…) and paste it above.")
        }
    }

    private func connectStockX() {
        save()
        let code = URLComponents(string: pastedRedirect.trimmingCharacters(in: .whitespacesAndNewlines))?
            .queryItems?.first(where: { $0.name == "code" })?.value
            ?? pastedRedirect.trimmingCharacters(in: .whitespacesAndNewlines)
        connecting = true
        stockxMessage = nil
        Task {
            do {
                let refresh = try await StockXClient.exchange(
                    code: code, redirectURI: stockxRedirectURI,
                    clientID: stockxClientID, clientSecret: stockxClientSecret
                )
                KeychainStore.set(refresh, for: SecretKey.stockxRefreshToken)
                await StockXClient.shared.resetToken()
                stockxConnected = true
                pastedRedirect = ""
                stockxMessage = "StockX connected."
            } catch {
                stockxMessage = error.localizedDescription
            }
            connecting = false
        }
    }

    private func save() {
        KeychainStore.set(upcKey, for: SecretKey.upcItemDBKey)
        KeychainStore.set(ebayClientID, for: SecretKey.ebayClientID)
        KeychainStore.set(ebayClientSecret, for: SecretKey.ebayClientSecret)
        KeychainStore.set(stockxAPIKey, for: SecretKey.stockxAPIKey)
        KeychainStore.set(stockxClientID, for: SecretKey.stockxClientID)
        KeychainStore.set(stockxClientSecret, for: SecretKey.stockxClientSecret)
        Task {
            await EbayClient.shared.resetTokens()
            await StockXClient.shared.resetToken()
        }
    }
}
