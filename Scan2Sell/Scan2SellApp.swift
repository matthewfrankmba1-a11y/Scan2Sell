import SwiftData
import SwiftUI

@main
struct Scan2SellApp: App {
    @StateObject private var lookup = LookupCoordinator()

    var body: some Scene {
        WindowGroup {
            InventoryView()
                .environmentObject(lookup)
        }
        .modelContainer(for: ScannedPair.self)
    }
}
