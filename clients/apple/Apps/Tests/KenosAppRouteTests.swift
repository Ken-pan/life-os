import XCTest
import KenosClient

final class KenosAppRouteTests: XCTestCase {
    func testDeepLinkCoverageForShell() {
        XCTAssertEqual(KenosDeepLinkRouter.parse("kenos://today"), .today)
        XCTAssertEqual(KenosDeepLinkRouter.parse("kenos://assistant"), .assistant)
        XCTAssertEqual(KenosDeepLinkRouter.parse("kenos://work"), .work)
        XCTAssertEqual(KenosDeepLinkRouter.parse("kenos://inbox"), .inbox)
        XCTAssertEqual(KenosDeepLinkRouter.parse("kenos://approvals"), .approvals)
        XCTAssertEqual(KenosDeepLinkRouter.parse("kenos://activity"), .activity)
        XCTAssertEqual(KenosDeepLinkRouter.parse("kenos://capture"), .capture)
        XCTAssertEqual(KenosDeepLinkRouter.parse("kenos://system"), .system)
        XCTAssertEqual(
            KenosDeepLinkRouter.parse("kenos://deliverable/not-a-uuid"),
            .unknown("kenos://deliverable/not-a-uuid")
        )
        for route in KenosDeepLinkRouter.coveredRoutes {
            if case .unknown = KenosDeepLinkRouter.parse(route) {
                XCTFail("covered route unknown: \(route)")
            }
        }
    }

    func testAccessibilityIdentifiersDocumented() {
        let ids = [
            "kenos.brand",
            "kenos.today",
            "kenos.assistant",
            "kenos.work",
            "kenos.inbox",
            "kenos.approvals",
            "kenos.activity",
            "kenos.capture",
            "kenos.system",
            "kenos.approvals.actions.disabled",
        ]
        XCTAssertEqual(ids.count, 10)
    }
}
