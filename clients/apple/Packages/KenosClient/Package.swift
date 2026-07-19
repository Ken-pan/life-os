// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "KenosClient",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "KenosClient", targets: ["KenosClient"])],
    dependencies: [
        .package(path: "../KenosContracts"),
    ],
    targets: [
        .target(
            name: "KenosClient",
            dependencies: ["KenosContracts"],
            resources: [.copy("Fixtures")]
        ),
        .testTarget(name: "KenosClientTests", dependencies: ["KenosClient", "KenosContracts"]),
    ]
)
