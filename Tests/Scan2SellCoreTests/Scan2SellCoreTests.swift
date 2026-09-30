import XCTest
@testable import Scan2SellCore

final class LabelParserTests: XCTestCase {
    func testNormalizeBarcode() {
        XCTAssertEqual(LabelParser.normalizeBarcode("0196153853891"), "196153853891")
        XCTAssertEqual(LabelParser.normalizeBarcode("196153853891"), "196153853891")
        XCTAssertEqual(LabelParser.normalizeBarcode("4066748895213"), "4066748895213")
        XCTAssertEqual(LabelParser.normalizeBarcode("00196153853891"), "196153853891")
        XCTAssertNil(LabelParser.normalizeBarcode("12345"))
    }

    func testBarcodesMatch() {
        XCTAssertTrue(LabelParser.barcodesMatch("0196153853891", "196153853891"))
        XCTAssertFalse(LabelParser.barcodesMatch("196153853891", "196153853892"))
    }

    func testNikeStyleCodes() {
        XCTAssertEqual(LabelParser.styleCode(in: "Air Jordan 1 Retro High OG DZ5485-612"), "DZ5485-612")
        XCTAssertEqual(LabelParser.styleCode(in: "STYLE 555088-134 US 10"), "555088-134")
        XCTAssertEqual(LabelParser.styleCode(in: "gel-kayano 14 1201a019-107"), "1201A019-107")
    }

    func testAdidasStyleCodes() {
        XCTAssertEqual(LabelParser.styleCode(in: "adidas Samba OG Cloud White IE3439"), "IE3439")
        XCTAssertEqual(LabelParser.styleCode(in: "Yeezy Boost 350 V2 B75806"), "B75806")
    }

    func testNoStyleCode() {
        XCTAssertNil(LabelParser.styleCode(in: "Nike Dunk Low Panda Size 10"))
    }

    func testSizesFromLabels() {
        XCTAssertEqual(LabelParser.usSize(in: "US 10  UK 9  EUR 44  CM 28"), "10")
        XCTAssertEqual(LabelParser.usSize(in: "US 5.5Y UK 5 EUR 38"), "5.5Y")
        XCTAssertEqual(LabelParser.usSize(in: "US W 8"), "8W")
        XCTAssertEqual(LabelParser.usSize(in: "US M 11.5"), "11.5")
    }

    func testSizesFromTitles() {
        XCTAssertEqual(LabelParser.usSize(in: "Nike Dunk Low Panda Size 10 DD1391-100"), "10")
        XCTAssertEqual(LabelParser.usSize(in: "Jordan 4 Bred Reimagined Sz 9.5"), "9.5")
        XCTAssertEqual(LabelParser.usSize(in: "Nike Air Force 1 Women's 8"), "8W")
        XCTAssertEqual(LabelParser.usSize(in: "Dunk Low size 7 Womens"), "7W")
        XCTAssertEqual(LabelParser.usSize(in: "Size: Men's 12"), "12")
        XCTAssertNil(LabelParser.usSize(in: "Nike Air Max 90"))
        XCTAssertNil(LabelParser.usSize(in: "Size 105"))
    }

    func testNormalizeSize() {
        XCTAssertEqual(LabelParser.normalizeSize("US M 10"), "10")
        XCTAssertEqual(LabelParser.normalizeSize("10M"), "10")
        XCTAssertEqual(LabelParser.normalizeSize("W 8"), "8W")
        XCTAssertEqual(LabelParser.normalizeSize("5.5 Y"), "5.5Y")
    }
}

final class PriceStatsTests: XCTestCase {
    func testMedianAndOutlierTrim() throws {
        let summary = try XCTUnwrap(PriceStats.summarize([120, 130, 125, 140, 135, 900]))
        XCTAssertEqual(summary.count, 5)
        XCTAssertEqual(summary.median, 130)
        XCTAssertEqual(summary.high, 140)
    }

    func testSmallSample() throws {
        let summary = try XCTUnwrap(PriceStats.summarize([100, 200]))
        XCTAssertEqual(summary.median, 150)
        XCTAssertNil(PriceStats.summarize([]))
    }
}

final class CSVWriterTests: XCTestCase {
    func testEscaping() {
        let csv = CSVWriter.make(header: ["A", "B"], rows: [["Jordan 1 \"Chicago\"", "x,y"]])
        XCTAssertEqual(csv, "A,B\r\n\"Jordan 1 \"\"Chicago\"\"\",\"x,y\"\r\n")
    }

    func testTextFormula() {
        XCTAssertEqual(CSVWriter.escape(CSVWriter.textFormula("012345678905")), "\"=\"\"012345678905\"\"\"")
    }
}

final class MarketLinksTests: XCTestCase {
    func testEbaySoldLink() throws {
        let url = try XCTUnwrap(MarketLinks.ebaySold(query: "DZ5485-612 size 10"))
        XCTAssertTrue(url.absoluteString.contains("LH_Sold=1"))
        XCTAssertTrue(url.absoluteString.contains("_nkw=DZ5485-612%20size%2010"))
    }
}
