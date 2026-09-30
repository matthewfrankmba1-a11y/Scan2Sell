import Foundation

public enum CSVWriter {
    /// Builds RFC 4180 CSV text (CRLF line endings) that opens cleanly in
    /// Numbers, Excel and Google Sheets.
    public static func make(header: [String], rows: [[String]]) -> String {
        ([header] + rows)
            .map { $0.map(escape).joined(separator: ",") }
            .joined(separator: "\r\n") + "\r\n"
    }

    public static func escape(_ field: String) -> String {
        let needsQuotes = field.contains { $0 == "," || $0 == "\"" || $0 == "\n" || $0 == "\r" }
        guard needsQuotes else { return field }
        return "\"" + field.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }

    /// Wraps a digit string so spreadsheets keep it as text instead of
    /// dropping leading zeros or switching to scientific notation.
    public static func textFormula(_ value: String) -> String {
        value.isEmpty ? "" : "=\"\(value)\""
    }

    /// UTF-8 with a BOM so Excel detects the encoding.
    public static func data(for csv: String) -> Data {
        Data([0xEF, 0xBB, 0xBF]) + Data(csv.utf8)
    }
}
