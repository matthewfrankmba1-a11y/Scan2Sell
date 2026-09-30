import Foundation

/// Pulls sneaker identifiers (barcode, style code, US size) out of raw text:
/// box-label OCR, marketplace listing titles, UPC database titles.
public enum LabelParser {

    // MARK: Barcodes

    /// Normalizes a scanned barcode into a canonical GTIN string.
    /// UPC-A codes are often reported as 13-digit EAN with a leading zero;
    /// those are collapsed back to 12 digits so lookups and de-duping agree.
    public static func normalizeBarcode(_ raw: String) -> String? {
        var digits = raw.filter(\.isNumber)
        if digits.count == 14, digits.hasPrefix("00") { digits.removeFirst(2) }
        if digits.count == 13, digits.hasPrefix("0") { digits.removeFirst() }
        guard [8, 12, 13].contains(digits.count) else { return nil }
        return digits
    }

    /// True when two GTINs refer to the same item, ignoring leading-zero padding.
    public static func barcodesMatch(_ a: String, _ b: String) -> Bool {
        let strip: (String) -> Substring = { $0.filter(\.isNumber).drop(while: { $0 == "0" }) }
        let lhs = strip(a), rhs = strip(b)
        return !lhs.isEmpty && lhs == rhs
    }

    // MARK: Style codes

    private static let stylePatterns: [NSRegularExpression] = [
        // Nike / Jordan: DZ5485-612, 555088-134, CT8527-100. ASICS: 1201A789-020
        #"\b(?=[A-Z0-9]*\d[A-Z0-9]*\d[A-Z0-9]*\d)[A-Z0-9]{6,8}-\d{3}\b"#,
        // adidas / Yeezy: GW2871, IE0421, B75806
        #"\b(?:[A-Z]{2}\d{4}|[A-Z]\d{5})\b"#,
    ].map { try! NSRegularExpression(pattern: $0) }

    /// Finds likely manufacturer style codes, most specific pattern first.
    public static func styleCodes(in text: String) -> [String] {
        let upper = text.uppercased()
        let range = NSRange(upper.startIndex..., in: upper)
        var found: [String] = []
        for pattern in stylePatterns {
            for match in pattern.matches(in: upper, range: range) {
                guard let r = Range(match.range, in: upper) else { continue }
                let code = String(upper[r])
                if !found.contains(code) { found.append(code) }
            }
        }
        return found
    }

    public static func styleCode(in text: String) -> String? {
        styleCodes(in: text).first
    }

    /// Canonical form for comparing style codes ("DZ5485 612" == "dz5485-612").
    public static func normalizeStyleCode(_ code: String) -> String {
        code.uppercased().filter { $0.isLetter || $0.isNumber }
    }

    // MARK: Sizes

    private static let sizePatterns: [NSRegularExpression] = [
        // "US 10", "US M 10", "US Men's 10.5", "US 5.5Y", "US W 8"
        #"\bUS\s*(?:M(?:EN'?S)?|(W)(?:OMEN'?S)?)?\s*(\d{1,2}(?:\.5)?)\s*([CYW])?(?![\d.])"#,
        // "Size 10", "Sz. 9.5", "Size: US 11", "Size 8W", "Size 7 Women's"
        #"\b(?:SIZE|SZ)\.?\s*:?\s*(?:US\s*)?(?:M(?:EN'?S)?\s*|(W)(?:OMEN'?S)?\s*)?(\d{1,2}(?:\.5)?)\s*([CYW](?![A-Z])|WOMEN'?S|WMNS)?(?![\d.])"#,
        // "Men's 10", "Mens Size 10" handled above; "Women's 8"
        #"\b(?:MEN'?S|(WOMEN'?S|WMNS))\s+(\d{1,2}(?:\.5)?)(?![\d.])"#,
    ].map { try! NSRegularExpression(pattern: $0, options: [.caseInsensitive]) }

    /// Extracts a US size like "10", "10.5", "5.5Y", "8W" or "10C".
    public static func usSize(in text: String) -> String? {
        let range = NSRange(text.startIndex..., in: text)
        for pattern in sizePatterns {
            for match in pattern.matches(in: text, range: range) {
                let groups = (0..<match.numberOfRanges).map { idx -> String? in
                    guard let r = Range(match.range(at: idx), in: text) else { return nil }
                    return String(text[r])
                }
                // Group layout: 1 = women's marker (leading), 2 = number, 3 = suffix (if present)
                guard groups.count > 2, let number = groups[2], let value = Double(number),
                      (1...18).contains(value) else { continue }
                var suffix = ""
                if groups.count > 3, let s = groups[3]?.uppercased() {
                    suffix = s.hasPrefix("W") ? "W" : s
                }
                if suffix.isEmpty, groups[1] != nil { suffix = "W" }
                return number + suffix
            }
        }
        return nil
    }

    /// Canonical form for comparing sizes ("US M 10" == "10", "5.5 Y" == "5.5Y").
    public static func normalizeSize(_ size: String) -> String {
        var s = size.uppercased()
            .replacingOccurrences(of: "US", with: "")
            .replacingOccurrences(of: "MEN'S", with: "")
            .replacingOccurrences(of: "MENS", with: "")
            .filter { !$0.isWhitespace }
        if s.hasPrefix("M"), s.dropFirst().first?.isNumber == true { s.removeFirst() }
        if s.hasPrefix("W"), s.dropFirst().first?.isNumber == true { s = String(s.dropFirst()) + "W" }
        if s.hasSuffix("M") { s.removeLast() }
        return s
    }
}
