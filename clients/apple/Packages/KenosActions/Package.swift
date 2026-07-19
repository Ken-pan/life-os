// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "KenosActions",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "KenosActions", targets: ["KenosActions"])],
    dependencies: [
        .package(path: "../KenosContracts"),
        .package(path: "../KenosClient"),
    ],
    targets: [
        .target(name: "KenosActions", dependencies: ["KenosContracts", "KenosClient"]),
        .testTarget(name: "KenosActionsTests", dependencies: ["KenosActions", "KenosClient", "KenosContracts"]),
    ]
)
