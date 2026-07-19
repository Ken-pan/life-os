// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "KenosNotifications",
    platforms: [.iOS(.v17), .macOS(.v14), .watchOS(.v10)],
    products: [.library(name: "KenosNotifications", targets: ["KenosNotifications"])],
    dependencies: [
        .package(path: "../KenosContracts"),
        .package(path: "../KenosClient"),
    ],
    targets: [
        .target(name: "KenosNotifications", dependencies: ["KenosContracts", "KenosClient"]),
        .testTarget(name: "KenosNotificationsTests", dependencies: ["KenosNotifications", "KenosContracts", "KenosClient"]),
    ]
)
