import AudioToolbox
import SwiftData
import SwiftUI

/// Full-screen continuous scanning: point at box after box, each barcode is
/// added (or its quantity bumped) and looked up in the background.
struct ScannerScreen: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @EnvironmentObject private var lookup: LookupCoordinator

    @State private var lastPair: ScannedPair?
    @State private var lastWasDuplicate = false
    @State private var sessionCount = 0
    @State private var manualCode = ""
    @FocusState private var manualFocused: Bool

    var body: some View {
        ZStack {
            if BarcodeScannerView.isAvailable {
                BarcodeScannerView { barcode, text in
                    handleScan(barcode, labelText: text)
                }
                .ignoresSafeArea()
            } else {
                unavailableView
            }
        }
        .overlay(alignment: .top) { topBar }
        .overlay(alignment: .bottom) { bottomPanel }
    }

    // MARK: Pieces

    private var topBar: some View {
        HStack {
            Text(sessionCount == 1 ? "1 scan" : "\(sessionCount) scans")
                .font(.headline)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(.ultraThinMaterial, in: Capsule())
            Spacer()
            Button("Done") { dismiss() }
                .font(.headline)
                .padding(.horizontal, 16).padding(.vertical, 8)
                .background(.ultraThinMaterial, in: Capsule())
        }
        .padding()
    }

    private var bottomPanel: some View {
        VStack(spacing: 12) {
            if let pair = lastPair, !pair.isDeleted {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(lastWasDuplicate ? "Added another (×\(pair.quantity))" : "Added")
                            .font(.caption).foregroundStyle(.secondary)
                        Text(pair.displayName).font(.headline).lineLimit(2)
                        Text([pair.styleCode, pair.size.isEmpty ? "" : "Size \(pair.size)"]
                            .filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(spacing: 8) {
                        Button("Undo", role: .destructive) { undo(pair) }
                        Button("+1") { pair.quantity += 1 }
                    }
                    .buttonStyle(.bordered)
                    .font(.subheadline)
                }
            } else {
                Text("Point the camera at the barcode on the box label")
                    .font(.subheadline).foregroundStyle(.secondary)
            }

            HStack {
                TextField("Type a UPC instead", text: $manualCode)
                    .keyboardType(.numberPad)
                    .focused($manualFocused)
                    .textFieldStyle(.roundedBorder)
                Button("Add") {
                    if let code = LabelParser.normalizeBarcode(manualCode) {
                        handleScan(code, labelText: [])
                        manualCode = ""
                        manualFocused = false
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(LabelParser.normalizeBarcode(manualCode) == nil)
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
        .padding()
    }

    private var unavailableView: some View {
        VStack(spacing: 12) {
            Image(systemName: "camera.fill").font(.largeTitle)
            Text("Camera scanning unavailable").font(.headline)
            Text("Allow camera access in Settings › Scan2Sell. Live scanning needs an iPhone XS or newer on iOS 17+. You can still type UPCs below.")
                .font(.subheadline).multilineTextAlignment(.center).foregroundStyle(.secondary)
            if let url = URL(string: UIApplication.openSettingsURLString) {
                Link("Open Settings", destination: url)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

    // MARK: Actions

    private func handleScan(_ barcode: String, labelText: [String]) {
        let label = labelText.joined(separator: "\n")
        let styleHint = LabelParser.styleCode(in: label) ?? ""
        let sizeHint = LabelParser.usSize(in: label) ?? ""

        let code = barcode
        let descriptor = FetchDescriptor<ScannedPair>(predicate: #Predicate<ScannedPair> { $0.barcode == code })
        if let existing = try? context.fetch(descriptor).first {
            existing.quantity += 1
            if existing.styleCode.isEmpty { existing.styleCode = styleHint }
            if existing.size.isEmpty { existing.size = sizeHint }
            lastPair = existing
            lastWasDuplicate = true
        } else {
            let pair = ScannedPair(barcode: barcode, styleHint: styleHint, sizeHint: sizeHint)
            context.insert(pair)
            try? context.save()
            lookup.enqueue(pair)
            lastPair = pair
            lastWasDuplicate = false
        }
        sessionCount += 1
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        AudioServicesPlaySystemSound(1057)
    }

    private func undo(_ pair: ScannedPair) {
        if lastWasDuplicate, pair.quantity > 1 {
            pair.quantity -= 1
        } else {
            context.delete(pair)
            try? context.save()
        }
        lastPair = nil
        sessionCount = max(0, sessionCount - 1)
    }
}
