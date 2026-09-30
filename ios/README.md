# Scan2Sell (native iOS version)

An iPhone app for scanning a stack of sneaker boxes and turning it into a
spreadsheet with **style code, size, description, and comparable prices** from
eBay, StockX, and GOAT.

## How it works

1. **Scan.** Tap **Scan** and point the camera at box after box. The scanner
   runs continuously: each new barcode beeps, buzzes, and is added to the
   list. If you scan the same UPC again, its quantity goes up. Each scan has
   **Undo** and **+1** buttons, and you can type a UPC by hand.
2. **Label reading.** While it reads the barcode, the camera also reads the
   text on the box label, so the style code (e.g. `DZ5485-612`) and US size
   (e.g. `US 10`) are captured even when the barcode isn't in any database.
3. **Lookup.** Runs in the background, one pair at a time:
   | Source | What it provides | Setup |
   |---|---|---|
   | UPCitemdb | Barcode → product name, brand, color, sometimes style/size | None (free ~100/day), optional paid key |
   | StockX API | Exact product + size match (by barcode, then style code), clean title, colorway, retail, **lowest ask / highest bid** | Free developer account |
   | eBay API | **Median / low / high** of comps for that style + size, with outliers removed. Uses **sold** prices if eBay grants Marketplace Insights access, otherwise **active listings** | Free developer account |
   | GOAT | Link to search, plus a field to type the price by hand | GOAT has no public API |
4. **Review.** Tap any row to fix the style code or size, add notes, enter a
   GOAT price, open the eBay sold, StockX, and GOAT pages, or refresh prices.
5. **Export.** Tap the share icon to get a `.csv` file. Open it in Numbers,
   Excel, or Google Sheets, AirDrop it, or email it.

### Spreadsheet columns

Scanned · UPC · Brand · Style Code · Size · Description · Colorway · Qty ·
Retail · eBay Median · eBay Low · eBay High · eBay Comps · eBay Basis ·
StockX Lowest Ask · StockX Highest Bid · GOAT Price · Est. Value (each) ·
Value Source · Est. Value (total) · eBay Sold Link · StockX Link · GOAT Link ·
Notes · Lookup Status

"Est. Value" uses the best available number, in this order: eBay sold
median, StockX lowest ask, GOAT (manual), eBay active-listing median. The
"Value Source" column says which one was used.

## Installing on your iPhone

You need a **Mac with Xcode 16 or later** and an **iPhone on iOS 17 or later**
(iPhone XS or newer for live scanning).

1. Clone this repo and open `Scan2Sell.xcodeproj` in Xcode.
2. Select the **Scan2Sell** target, then **Signing & Capabilities**:
   - **Team:** choose your Apple ID. Add it under Xcode › Settings ›
     Accounts if needed. A free Apple ID works.
   - **Bundle Identifier:** change `com.scan2sell.app` to something unique,
     e.g. `com.yourname.scan2sell`.
3. Plug in your iPhone and select it as the run destination. On the phone,
   turn on Settings › Privacy & Security › **Developer Mode** if asked.
4. Press **Run** (⌘R). The first time, trust the developer on the phone:
   Settings › General › VPN & Device Management.

With a free Apple ID the app has to be re-run from Xcode every 7 days. A paid
Apple Developer account ($99/yr) removes that limit and lets you use
TestFlight.

## Setting up price sources (in the app's Settings ⚙︎)

Keys are stored in the iOS Keychain on your phone. The app has no server.

### eBay (recommended)
1. Create a free account at <https://developer.ebay.com>, then go to
   **Application Keys** and create a **Production** keyset.
2. Paste the **App ID (Client ID)** and **Cert ID (Client Secret)** into Settings.
3. You get **active-listing** comps right away. For real **sold** prices,
   apply for the **Marketplace Insights API** (a restricted API, so eBay has
   to approve it). Once approved, turn on *Use sold prices*. If sold data
   fails, the app falls back to active listings automatically.

Even without API access, every item's **eBay sold listings** link opens eBay's
own sold/completed search for that style code and size.

### StockX (recommended)
1. Sign up at <https://developer.stockx.com> and create an application. You
   get an **API key**, **client ID**, and **client secret**, and you choose a
   **redirect URI** (any URL you control, e.g. `https://example.com/callback`).
2. Enter all four in Settings.
3. Tap **1. Sign in to StockX** and log in. StockX then sends you to your
   redirect URI. The page may not load, which is fine. Copy the full URL from
   the address bar (it contains `?code=…`).
4. Paste it into **2.** and tap **3. Connect**. The app keeps a refresh token,
   so you only do this once.

### UPCitemdb (optional)
Works with no key. For more than about 100 scans a day, buy a key at
<https://www.upcitemdb.com> and paste it in.

## Limitations

- **GOAT** has no public API. Use the link and type the price by hand.
- **StockX** API returns the current market (lowest ask, highest bid), not
  its sales history.
- **eBay sold** prices need Marketplace Insights approval. Otherwise the
  numbers are active asking prices, and the "eBay Basis" column says which
  you got.
- **UPC databases cover sneakers unevenly.** When a barcode isn't found, the
  style code and size read off the box label are used instead. StockX's
  barcode match is the most accurate source when it's connected.
- Comps are automated. Check big-ticket pairs using the links.

## Project layout

```
Scan2Sell/
  Scan2SellApp.swift            App entry, SwiftData container
  Core/                         Platform-independent logic (unit tested)
    LabelParser.swift           Barcode normalization, style-code & size parsing
    PriceStats.swift            Median / range with outlier trimming
    CSVWriter.swift             Spreadsheet-safe CSV
    MarketLinks.swift           eBay sold / StockX / GOAT search links
  Models/ScannedPair.swift      Persisted scan record
  Services/                     UPCitemdb, StockX, eBay clients; lookup queue; CSV export
  Views/                        Inventory list, scanner, detail editor, settings
Tests/Scan2SellCoreTests/       Unit tests for Core
```

Run the core unit tests with `swift test` (macOS or Linux).
