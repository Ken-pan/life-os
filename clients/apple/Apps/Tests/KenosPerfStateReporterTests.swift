import XCTest
@testable import KenosIOS

#if os(iOS)
@MainActor
final class KenosPerfStateReporterTests: XCTestCase {
    func testEnterDomainUpdatesCrashContextAndSpace() {
        let url = URL(string: "http://kens-m5-max-macbook-pro.tail04e0e6.ts.net:5189/?iosNativeShell=1")!
        KenosPerfStateReporter.enterDomain(url: url)
        let snap = KenosCrashContextStore.load()
        XCTAssertEqual(snap?.shellMode, "domain")
        XCTAssertEqual(snap?.domainId, "music")
        XCTAssertEqual(snap?.lastSpace, "music")
        XCTAssertEqual(snap?.continuityHost, "kens-m5-max-macbook-pro.tail04e0e6.ts.net")
    }

    func testReturnToKenosFlipsShell() {
        KenosPerfStateReporter.enterDomain(
            url: URL(string: "http://127.0.0.1:5189/")!
        )
        KenosPerfStateReporter.returnToKenos()
        XCTAssertEqual(KenosCrashContextStore.load()?.shellMode, "kenos")
    }

    func testOpenSpaceRecordsId() {
        KenosPerfStateReporter.openSpace("plan")
        XCTAssertEqual(KenosCrashContextStore.load()?.lastSpace, "plan")
    }
}
#endif
