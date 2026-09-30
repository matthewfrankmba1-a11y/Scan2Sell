import SwiftData
import SwiftUI

struct InventoryView: View {
    @Environment(\.modelContext) private var context
    @EnvironmentObject private var lookup: LookupCoordinator
    @Query(sort: \ScannedPair.scannedAt, order: .reverse) private var pairs: [ScannedPair]

    @State private var showScanner = false
    @State private var showSettings = false
    @State private var confirmClear = false
    @State private var shareItem: ShareItem?
    @State private var exportError: String?

    var body: some View {
        NavigationStack {
            Group {
                if pairs.isEmpty {
                    ContentUnavailableView {
                        Label("No sneakers yet", systemImage: "barcode.viewfinder")
                    } description: {
                        Text("Tap Scan and point your camera at the barcode on each box. Scan2Sell looks up the style code, size and comps, then exports a spreadsheet.")
                    }
                } else {
                    list
                }
            }
            .navigationTitle("Scan2Sell")
            .navigationDestination(for: ScannedPair.self) { PairDetailView(pair: $0) }
            .toolbar { toolbar }
            .task {
                // Resume lookups interrupted by the app being closed.
                lookup.enqueue(pairs.filter { $0.status == .pending || $0.status == .lookingUp })
            }
            .safeAreaInset(edge: .bottom) { scanButton }
            .fullScreenCover(isPresented: $showScanner) { ScannerScreen() }
            .sheet(isPresented: $showSettings) { SettingsView() }
            .sheet(item: $shareItem) { item in
                ActivityView(items: [item.url]).presentationDetents([.medium, .large])
            }
            .confirmationDialog("Delete all \(pairs.count) scanned items?", isPresented: $confirmClear,
                                titleVisibility: .visible) {
                Button("Delete All", role: .destructive, action: clearAll)
            }
            .alert("Export failed", isPresented: Binding(
                get: { exportError != nil },
                set: { if !$0 { exportError = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(exportError ?? "")
            }
        }
    }

    private var list: some View {
        List {
            Section {
                summary
            }
            Section {
                ForEach(pairs) { pair in
                    NavigationLink(value: pair) { PairRow(pair: pair) }
                }
                .onDelete { offsets in
                    for index in offsets { context.delete(pairs[index]) }
                    try? context.save()
                }
            }
        }
    }

    private var summary: some View {
        let totalPairs = pairs.reduce(0) { $0 + $1.quantity }
        let totalValue = pairs.reduce(0.0) { sum, p in sum + (p.estimatedValue?.amount ?? 0) * Double(p.quantity) }
        return VStack(alignment: .leading, spacing: 6) {
            LabeledContent("Pairs", value: "\(totalPairs)")
            LabeledContent("Est. total value", value: totalValue.formatted(.currency(code: "USD")))
            if lookup.queueCount > 0 {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Looking up \(lookup.queueCount) more…").foregroundStyle(.secondary)
                }
                .font(.footnote)
            }
        }
    }

    private var scanButton: some View {
        Button {
            showScanner = true
        } label: {
            Label("Scan", systemImage: "barcode.viewfinder")
                .font(.title3.bold())
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent)
        .padding(.horizontal)
        .padding(.bottom, 8)
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button { showSettings = true } label: { Image(systemName: "gearshape") }
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button(action: export) {
                Label("Export", systemImage: "square.and.arrow.up")
            }
            .disabled(pairs.isEmpty)
        }
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button {
                    lookup.enqueue(Array(pairs.reversed()))
                } label: {
                    Label("Refresh All Prices", systemImage: "arrow.clockwise")
                }
                Button(role: .destructive) {
                    confirmClear = true
                } label: {
                    Label("Delete All", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .disabled(pairs.isEmpty)
        }
    }

    private func export() {
        do {
            // Oldest first reads naturally in a spreadsheet.
            shareItem = ShareItem(url: try SpreadsheetExporter.writeFile(for: pairs.reversed()))
        } catch {
            exportError = error.localizedDescription
        }
    }

    private func clearAll() {
        for pair in pairs { context.delete(pair) }
        try? context.save()
    }
}

struct PairRow: View {
    let pair: ScannedPair

    var body: some View {
        HStack(spacing: 12) {
            AsyncImage(url: pair.imageURL.flatMap(URL.init(string:))) { image in
                image.resizable().scaledToFit()
            } placeholder: {
                Image(systemName: "shoeprints.fill").foregroundStyle(.tertiary)
            }
            .frame(width: 52, height: 52)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
            .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 3) {
                Text(pair.displayName).font(.subheadline.weight(.semibold)).lineLimit(2)
                Text(details).font(.caption).foregroundStyle(.secondary)
                HStack(spacing: 6) {
                    if let v = pair.ebayMedian { chip("eBay", v) }
                    if let v = pair.stockxLowestAsk { chip("StockX", v) }
                    if let v = pair.goatPrice { chip("GOAT", v) }
                }
            }
            Spacer(minLength: 0)
            statusIcon
        }
    }

    private var details: String {
        var parts: [String] = []
        if !pair.styleCode.isEmpty { parts.append(pair.styleCode) }
        parts.append(pair.size.isEmpty ? "Size ?" : "Size \(pair.size)")
        if pair.quantity > 1 { parts.append("×\(pair.quantity)") }
        return parts.joined(separator: " · ")
    }

    private func chip(_ label: String, _ value: Double) -> some View {
        Text("\(label) \(value.formatted(.currency(code: "USD").precision(.fractionLength(0))))")
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(Color.accentColor.opacity(0.12), in: Capsule())
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch pair.status {
        case .pending, .lookingUp: ProgressView()
        case .failed: Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
        case .partial, .done: EmptyView()
        }
    }
}

struct ShareItem: Identifiable {
    let id = UUID()
    let url: URL
}

struct ActivityView: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
