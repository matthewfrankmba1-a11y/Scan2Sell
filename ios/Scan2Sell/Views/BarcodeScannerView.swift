import SwiftUI
import Vision
import VisionKit

/// Live camera scanner. Recognizes retail barcodes and, at the same time, the
/// printed text on the box label so style code / size can be read directly.
struct BarcodeScannerView: UIViewControllerRepresentable {
    /// Called with the normalized barcode and the text visible on the label.
    var onScan: (_ barcode: String, _ labelText: [String]) -> Void

    static var isAvailable: Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [
                .barcode(symbologies: [.ean13, .ean8, .upce, .code128]),
                .text(),
            ],
            qualityLevel: .balanced,
            recognizesMultipleItems: true,
            isHighFrameRateTrackingEnabled: false,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: false
        )
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
        context.coordinator.onScan = onScan
        if !scanner.isScanning { try? scanner.startScanning() }
    }

    static func dismantleUIViewController(_ scanner: DataScannerViewController, coordinator: Coordinator) {
        scanner.stopScanning()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onScan: onScan) }

    @MainActor
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        var onScan: (String, [String]) -> Void
        /// Ignore the same barcode re-entering the frame for this long.
        private let cooldown: TimeInterval = 4
        private var lastSeen: [String: Date] = [:]
        private var visibleItems: [RecognizedItem] = []

        init(onScan: @escaping (String, [String]) -> Void) {
            self.onScan = onScan
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            visibleItems = allItems
            for item in addedItems {
                guard case .barcode(let code) = item,
                      let payload = code.payloadStringValue,
                      let barcode = LabelParser.normalizeBarcode(payload) else { continue }
                let now = Date()
                if let last = lastSeen[barcode], now.timeIntervalSince(last) < cooldown { continue }
                lastSeen[barcode] = now
                // Give text recognition a moment to catch up with the label.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
                    guard let self else { return }
                    self.onScan(barcode, self.visibleText())
                }
            }
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didUpdate updatedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            visibleItems = allItems
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didRemove removedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            visibleItems = allItems
        }

        private func visibleText() -> [String] {
            visibleItems.compactMap { item in
                if case .text(let text) = item { return text.transcript }
                return nil
            }
        }
    }
}
