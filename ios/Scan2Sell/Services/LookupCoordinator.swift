import Foundation
import SwiftData

/// Runs lookups one pair at a time (keeps API rate limits happy) and writes
/// results back into the SwiftData models on the main actor.
@MainActor
final class LookupCoordinator: ObservableObject {
    @Published private(set) var queueCount = 0

    private var queue: [ScannedPair] = []
    private var isRunning = false

    func enqueue(_ pair: ScannedPair) {
        guard !queue.contains(where: { $0.id == pair.id }) else { return }
        pair.status = .pending
        queue.append(pair)
        queueCount = queue.count
        runIfNeeded()
    }

    func enqueue(_ pairs: [ScannedPair]) {
        for pair in pairs { enqueue(pair) }
    }

    private func runIfNeeded() {
        guard !isRunning else { return }
        isRunning = true
        Task {
            while !queue.isEmpty {
                let pair = queue.removeFirst()
                await lookUp(pair)
                queueCount = queue.count
            }
            isRunning = false
        }
    }

    private func lookUp(_ pair: ScannedPair) async {
        // Deleted while waiting in the queue.
        guard pair.modelContext != nil, !pair.isDeleted else { return }
        pair.status = .lookingUp
        var problems: [String] = []
        var found: [String] = []

        // 1. Barcode → name / brand / style / size
        if pair.name.isEmpty {
            do {
                let client = UPCLookupClient(apiKey: KeychainStore.get(SecretKey.upcItemDBKey))
                if let product = try await client.lookup(pair.barcode) {
                    apply(product, to: pair)
                    found.append("UPC")
                } else {
                    problems.append("Barcode not in UPC database")
                }
            } catch {
                problems.append(error.localizedDescription)
            }
        }

        // 2. StockX: exact product/size + asks and bids
        let stockx = StockXClient.Credentials(
            apiKey: KeychainStore.get(SecretKey.stockxAPIKey),
            clientID: KeychainStore.get(SecretKey.stockxClientID),
            clientSecret: KeychainStore.get(SecretKey.stockxClientSecret),
            refreshToken: KeychainStore.get(SecretKey.stockxRefreshToken)
        )
        if stockx.isComplete {
            do {
                if let match = try await StockXClient.shared.match(
                    barcode: pair.barcode, styleCode: pair.styleCode, size: pair.size, credentials: stockx
                ) {
                    apply(match, to: pair)
                    found.append("StockX")
                } else {
                    problems.append("Not found on StockX")
                }
            } catch {
                problems.append(error.localizedDescription)
            }
        }

        // 3. eBay comps
        let ebay = EbayClient.Credentials(
            clientID: KeychainStore.get(SecretKey.ebayClientID),
            clientSecret: KeychainStore.get(SecretKey.ebayClientSecret)
        )
        if ebay.isComplete {
            let defaults = UserDefaults.standard
            do {
                if let comps = try await EbayClient.shared.comps(
                    styleCode: pair.styleCode, name: pair.name, size: pair.size,
                    useSoldData: defaults.bool(forKey: SettingKey.ebayUseSoldData),
                    newOnly: defaults.object(forKey: SettingKey.ebayNewOnly) as? Bool ?? true,
                    credentials: ebay
                ) {
                    pair.ebayMedian = comps.summary.median
                    pair.ebayLow = comps.summary.low
                    pair.ebayHigh = comps.summary.high
                    pair.ebayCount = comps.summary.count
                    pair.ebayBasis = comps.basis
                    found.append("eBay")
                } else {
                    problems.append("No eBay comps")
                }
            } catch {
                problems.append(error.localizedDescription)
            }
        }

        if !stockx.isComplete && !ebay.isComplete {
            problems.append("Add eBay/StockX keys in Settings for prices")
        }

        guard !pair.isDeleted else { return }
        pair.lastLookup = Date()
        pair.statusMessage = problems.joined(separator: " · ")
        if problems.isEmpty {
            pair.status = .done
        } else {
            pair.status = found.isEmpty && pair.name.isEmpty && pair.styleCode.isEmpty ? .failed : .partial
        }
        try? pair.modelContext?.save()
    }

    private func apply(_ product: UPCProduct, to pair: ScannedPair) {
        pair.name = product.title
        if pair.brand.isEmpty { pair.brand = product.brand }
        if pair.colorway.isEmpty { pair.colorway = product.color }
        if pair.imageURL == nil { pair.imageURL = product.imageURL }
        // A database style code beats a label-OCR guess, except a Nike-style
        // "XXXXXX-XXX" read off the label, which is reliable.
        if let dbStyle = LabelParser.styleCode(in: product.model) ?? LabelParser.styleCode(in: product.title),
           pair.styleCode.isEmpty || !pair.styleCode.contains("-") {
            pair.styleCode = dbStyle
        }
        if pair.size.isEmpty {
            pair.size = LabelParser.usSize(in: "Size \(product.size)")
                ?? LabelParser.usSize(in: product.title) ?? ""
        }
    }

    private func apply(_ match: StockXMatch, to pair: ScannedPair) {
        // StockX titles are clean and consistent, so prefer them.
        if !match.title.isEmpty { pair.name = match.title }
        if !match.brand.isEmpty { pair.brand = match.brand }
        if !match.colorway.isEmpty { pair.colorway = match.colorway }
        if !match.styleId.isEmpty, match.matchedByBarcode || pair.styleCode.isEmpty {
            pair.styleCode = match.styleId
        }
        if match.matchedByBarcode, !match.size.isEmpty { pair.size = match.size }
        if let retail = match.retailPrice, retail > 0 { pair.retailPrice = retail }
        pair.stockxURLKey = match.urlKey
        pair.stockxLowestAsk = match.lowestAsk
        pair.stockxHighestBid = match.highestBid
    }
}
