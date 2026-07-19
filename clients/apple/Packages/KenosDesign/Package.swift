// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "KenosDesign",
    platforms: [.iOS(.v17), .macOS(.v14), .watchOS(.v10)],
    products: [.library(name: "KenosDesign", targets: ["KenosDesign"])],
    targets: [
        .target(name: "KenosDesign"),
        .testTarget(name: "KenosDesignTests", dependencies: ["KenosDesign"]),
    ]
)
