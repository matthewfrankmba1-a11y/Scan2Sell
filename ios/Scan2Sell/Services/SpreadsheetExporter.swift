import Foundation

enum SpreadsheetExporter {
    static let header = [
        "Scanned", "UPC", "Brand", "Style Code", "Size", "Description", "Colorway", "Qty",
        "Retail", "eBay Median", "eBay Low", "eBay High", "eBay Comps", "eBay Basis",
        "StockX Lowest Ask", "StockX Highest Bid", "GOAT Price",
        "Est. Value (each)", "Value Source", "Est. Value (total)",
        "eBay Sold Link", "StockX Link", "GOAT Link", "Notes", "Lookup Status",
    ]

    static func csv(for pairs: [ScannedPair]) -> String {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd HH:mm"

        let rows = pairs.map { p -> [String] in
            let query = p.searchQuery
            let estimate = p.estimatedValue
            let stockxLink = p.stockxURLKey.isEmpty
                ? MarketLinks.stockxSearch(query: p.styleCode.isEmpty ? p.name : p.styleCode)
                : MarketLinks.stockxProduct(urlKey: p.stockxURLKey)
            return [
                dateFormatter.string(from: p.scannedAt),
                CSVWriter.textFormula(p.barcode),
                p.brand,
                p.styleCode,
                p.size,
                p.name,
                p.colorway,
                String(p.quantity),
                money(p.retailPrice),
                money(p.ebayMedian),
                money(p.ebayLow),
                money(p.ebayHigh),
                p.ebayCount.map(String.init) ?? "",
                p.ebayBasis,
                money(p.stockxLowestAsk),
                money(p.stockxHighestBid),
                money(p.goatPrice),
                money(estimate?.amount),
                estimate?.source ?? "",
                money(estimate.map { $0.amount * Double(p.quantity) }),
                query.isEmpty ? "" : MarketLinks.ebaySold(query: query)?.absoluteString ?? "",
                query.isEmpty ? "" : stockxLink?.absoluteString ?? "",
                query.isEmpty ? "" : MarketLinks.goatSearch(query: p.styleCode.isEmpty ? p.name : p.styleCode)?.absoluteString ?? "",
                p.notes,
                p.statusMessage.isEmpty ? p.status.rawValue : p.statusMessage,
            ]
        }
        return CSVWriter.make(header: header, rows: rows)
    }

    /// Writes the CSV to a temp file named with today's date, ready to share.
    static func writeFile(for pairs: [ScannedPair]) throws -> URL {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd-HHmm"
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("Scan2Sell-\(formatter.string(from: Date())).csv")
        try CSVWriter.data(for: csv(for: pairs)).write(to: url, options: .atomic)
        return url
    }

    private static func money(_ value: Double?) -> String {
        guard let value else { return "" }
        return String(format: "%.2f", value)
    }
}
