import XCTest
#if canImport(UIKit)
@testable import KenosIOS
#endif

#if os(iOS)
final class KenosHomeScanBridgeTests: XCTestCase {
    func testMorePathMapsToCompanionDestinations() {
        XCTAssertEqual(
            KenosHomeScanBridge.destination(fromMorePath: "homescan://scan"),
            .scan
        )
        XCTAssertEqual(
            KenosHomeScanBridge.destination(fromMorePath: "homescan://find"),
            .find
        )
        XCTAssertEqual(
            KenosHomeScanBridge.destination(fromMorePath: "homescan://container"),
            .container
        )
        XCTAssertNil(KenosHomeScanBridge.destination(fromMorePath: "/settings"))
        XCTAssertNil(KenosHomeScanBridge.destination(fromMorePath: "https://home.kenos.space/plan"))
    }

    func testHomeManifestWiresCompanionMorePaths() {
        let more = KenosDomainRegistry.navigationManifest(for: "home")?.more ?? []
        let paths = more.map(\.path)
        XCTAssertTrue(paths.contains("homescan://scan"))
        XCTAssertTrue(paths.contains("homescan://find"))
        XCTAssertTrue(paths.contains("homescan://container"))
        XCTAssertEqual(KenosDomainRegistry.definition(for: "home")?.homePath, "/plan")
    }

    func testImmersiveHomeOrganizePath() {
        // Mirror KenosDomainModeShell.isImmersiveWebPath rules for Home focus.
        func immersive(_ raw: String) -> Bool {
            let path = raw.lowercased()
            if path == "/session" || path == "/focus" { return true }
            if path == "/tidy/go" || path.hasSuffix("/tidy/go") { return true }
            if path.hasSuffix("/focus") || path.hasSuffix("/summary") { return true }
            return false
        }
        XCTAssertTrue(immersive("/tidy/go"))
        XCTAssertFalse(immersive("/tidy"))
        XCTAssertFalse(immersive("/plan"))
    }
}
#endif
