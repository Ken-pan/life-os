// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "KenosContracts",
    platforms: [.iOS(.v17), .macOS(.v14), .watchOS(.v10)],
    products: [.library(name: "KenosContracts", targets: ["KenosContracts"])],
    targets: [
        .target(name: "KenosContracts"),
        .testTarget(name: "KenosContractsTests", dependencies: ["KenosContracts"]),
    ]
)
