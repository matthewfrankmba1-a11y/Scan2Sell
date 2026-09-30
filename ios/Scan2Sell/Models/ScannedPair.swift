import Foundation
import SwiftData

enum LookupStatus: String, Codable {
    case pending, lookingUp, done, partial, failed
}

@Model
final class ScannedPair {
    var id: UUID = UUID()
    var barcode: String = ""
    var scannedAt: Date = Date()
    var quantity: Int = 1

    var brand: String = ""
    var styleCode: String = ""
    var size: String = ""
    var name: String = ""
    var colorway: String = ""
    var retailPrice: Double?
    var imageURL: String?

    /// Style code / size read off the box label by the camera, used as a
    /// fallback when the barcode isn't in any database.
    var labelStyleHint: String = ""
    var labelSizeHint: String = ""

    var ebayMedian: Double?
    var ebayLow: Double?
    var ebayHigh: Double?
    var ebayCount: Int?
    /// e.g. "sold, size 10" or "active listings, all sizes"
    var ebayBasis: String = ""

    var stockxLowestAsk: Double?
    var stockxHighestBid: Double?
    var stockxURLKey: String = ""

    /// GOAT has no public API, so this is entered by hand from the GOAT link.
    var goatPrice: Double?

    var notes: String = ""
    var statusRaw: String = LookupStatus.pending.rawValue
    var statusMessage: String = ""
    var lastLookup: Date?

    init(barcode: String, styleHint: String = "", sizeHint: String = "") {
        self.barcode = barcode
        self.labelStyleHint = styleHint
        self.labelSizeHint = sizeHint
        self.styleCode = styleHint
        self.size = sizeHint
    }

    var status: LookupStatus {
        get { LookupStatus(rawValue: statusRaw) ?? .pending }
        set { statusRaw = newValue.rawValue }
    }

    var displayName: String {
        if !name.isEmpty { return name }
        if !styleCode.isEmpty { return styleCode }
        return "UPC \(barcode)"
    }

    var searchQuery: String {
        MarketLinks.searchQuery(styleCode: styleCode, name: name, size: size)
    }

    /// Best single number for "what is this pair worth": real eBay sales first,
    /// then StockX asks, then a manually entered GOAT price.
    var estimatedValue: (amount: Double, source: String)? {
        if let v = ebayMedian, ebayBasis.hasPrefix("sold") { return (v, "eBay sold median") }
        if let v = stockxLowestAsk { return (v, "StockX lowest ask") }
        if let v = goatPrice { return (v, "GOAT") }
        if let v = ebayMedian { return (v, "eBay active median") }
        return nil
    }
}
