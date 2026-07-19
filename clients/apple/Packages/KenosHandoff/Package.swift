// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "KenosHandoff",
    platforms: [.iOS(.v17), .macOS(.v14), .watchOS(.v10)],
    products: [.library(name: "KenosHandoff", targets: ["KenosHandoff"])],
    dependencies: [
        .package(path: "../KenosContracts"),
        .package(path: "../KenosClient"),
        .package(path: "../KenosActions"),
    ],
    targets: [
        .target(name: "KenosHandoff", dependencies: ["KenosContracts", "KenosClient", "KenosActions"]),
        .testTarget(name: "KenosHandoffTests", dependencies: ["KenosHandoff", "KenosContracts", "KenosClient", "KenosActions"]),
    ]
)
