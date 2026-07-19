// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "KenosStore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "KenosStore", targets: ["KenosStore"])],
    dependencies: [
        .package(path: "../KenosContracts"),
        .package(path: "../KenosClient"),
    ],
    targets: [
        .target(name: "KenosStore", dependencies: ["KenosContracts", "KenosClient"]),
        .testTarget(name: "KenosStoreTests", dependencies: ["KenosStore", "KenosClient", "KenosContracts"]),
    ]
)
