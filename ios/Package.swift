// swift-tools-version:5.9
// Lets the platform-independent parsing/pricing/CSV code be unit tested with
// `swift test` (on a Mac or Linux) without building the iOS app.
import PackageDescription

let package = Package(
    name: "Scan2SellCore",
    platforms: [.macOS(.v13), .iOS(.v17)],
    products: [.library(name: "Scan2SellCore", targets: ["Scan2SellCore"])],
    targets: [
        .target(name: "Scan2SellCore", path: "Scan2Sell/Core"),
        .testTarget(name: "Scan2SellCoreTests", dependencies: ["Scan2SellCore"], path: "Tests/Scan2SellCoreTests"),
    ]
)
