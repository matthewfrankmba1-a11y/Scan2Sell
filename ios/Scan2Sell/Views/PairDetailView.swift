import SwiftData
import SwiftUI

struct PairDetailView: View {
    @Bindable var pair: ScannedPair
    @EnvironmentObject private var lookup: LookupCoordinator

    var body: some View {
        Form {
            Section("Item") {
                field("Description", text: $pair.name)
                field("Brand", text: $pair.brand)
                field("Style code", text: $pair.styleCode)
                    .textInputAutocapitalization(.characters)
                field("Size (US)", text: $pair.size)
                field("Colorway", text: $pair.colorway)
                Stepper("Quantity: \(pair.quantity)", value: $pair.quantity, in: 1...999)
                LabeledContent("UPC", value: pair.barcode)
                if let retail = pair.retailPrice {
                    LabeledContent("Retail", value: currency(retail))
                }
            }

            Section {
                if let median = pair.ebayMedian {
                    LabeledContent("eBay median", value: currency(median))
                    if let low = pair.ebayLow, let high = pair.ebayHigh {
                        LabeledContent("Range", value: "\(currency(low)) – \(currency(high))")
                    }
                    LabeledContent("Based on", value: "\(pair.ebayCount ?? 0) \(pair.ebayBasis)")
                } else {
                    LabeledContent("eBay", value: "—")
                }
                LabeledContent("StockX lowest ask", value: pair.stockxLowestAsk.map(currency) ?? "—")
                LabeledContent("StockX highest bid", value: pair.stockxHighestBid.map(currency) ?? "—")
                HStack {
                    Text("GOAT price")
                    TextField("Enter from GOAT", value: $pair.goatPrice, format: .currency(code: "USD"))
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                }
                if let estimate = pair.estimatedValue {
                    LabeledContent("Est. value", value: currency(estimate.amount))
                        .fontWeight(.semibold)
                }
            } header: {
                Text("Comparable prices")
            } footer: {
                if let date = pair.lastLookup {
                    Text("Updated \(date.formatted(.relative(presentation: .named)))")
                }
            }

            if !pair.searchQuery.isEmpty {
                Section("Check comps yourself") {
                    let query = pair.searchQuery
                    let styleOrName = pair.styleCode.isEmpty ? pair.name : pair.styleCode
                    if let url = MarketLinks.ebaySold(query: query) {
                        Link("eBay sold listings", destination: url)
                    }
                    if let url = pair.stockxURLKey.isEmpty
                        ? MarketLinks.stockxSearch(query: styleOrName)
                        : MarketLinks.stockxProduct(urlKey: pair.stockxURLKey) {
                        Link("StockX", destination: url)
                    }
                    if let url = MarketLinks.goatSearch(query: styleOrName) {
                        Link("GOAT", destination: url)
                    }
                }
            }

            Section("Notes") {
                TextField("Condition, box damage, where it's stored…", text: $pair.notes, axis: .vertical)
            }

            if !pair.statusMessage.isEmpty {
                Section("Lookup issues") {
                    Text(pair.statusMessage).font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle(pair.styleCode.isEmpty ? "Sneaker" : pair.styleCode)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if pair.status == .pending || pair.status == .lookingUp {
                    ProgressView()
                } else {
                    Button {
                        lookup.enqueue(pair)
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                }
            }
        }
    }

    private func field(_ label: String, text: Binding<String>) -> some View {
        LabeledContent(label) {
            TextField(label, text: text)
                .multilineTextAlignment(.trailing)
                .autocorrectionDisabled()
        }
    }

    private func currency(_ value: Double) -> String {
        value.formatted(.currency(code: "USD"))
    }
}
