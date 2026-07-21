import XCTest
#if canImport(UIKit)
@testable import KenosIOS
#endif

#if os(iOS)
final class KenosAppIntentsTests: XCTestCase {
    func testContinuityURLResolvesPlanAndTrainingSession() {
        let plan = KenosDomainRegistry.continuityURL(for: "plan")
        XCTAssertNotNil(plan)
        XCTAssertTrue(plan?.path == "/" || plan?.path.isEmpty == true || plan?.absoluteString.contains("5188") == true)

        let trainingSession = KenosDomainRegistry.continuityURL(for: "training", path: "/session")
        XCTAssertNotNil(trainingSession)
        XCTAssertTrue(trainingSession?.path.hasSuffix("/session") == true)

        let deepWork = KenosDomainRegistry.continuityURL(for: "work", path: "/spaces/work")
        XCTAssertNotNil(deepWork)
        XCTAssertTrue(deepWork?.path.contains("spaces/work") == true)
    }

    func testShellDestinationDeepLinks() {
        XCTAssertEqual(KenosShellDestination.today.deepLink.absoluteString, "kenos://today")
        XCTAssertEqual(KenosShellDestination.compose.deepLink.absoluteString, "kenos://compose")
        XCTAssertEqual(KenosShellDestination.shelf.deepLink.absoluteString, "kenos://shelf")
    }

    func testContinuityDomainCasesMatchRegistry() {
        for domain in KenosContinuityDomain.allCases {
            XCTAssertNotNil(
                KenosDomainRegistry.definition(for: domain.rawValue),
                "Missing registry entry for \(domain.rawValue)"
            )
            XCTAssertNotNil(KenosDomainRegistry.continuityURL(for: domain.rawValue))
        }
    }

    func testPushFoundationLocalReadyRemoteGated() {
        XCTAssertFalse(KenosPushFoundation.isEnabled)
        XCTAssertFalse(KenosPushFoundation.remotePushEnabled)
        XCTAssertTrue(KenosPushFoundation.localSchedulingEnabled)
        XCTAssertEqual(KenosPushFoundation.statusSummary, "local_notifications_ready")
    }
}
#endif
