import XCTest
import KenosActions
import KenosClient
import KenosHandoff

final class KenosWatchGlanceTests: XCTestCase {
    func testUnavailableDoesNotMasqueradeAsZero() {
        let glance = KenosGlanceMapper.todayGlance(
            today: nil,
            inbox: [],
            approvals: [],
            work: nil,
            freshness: "unavailable",
            lastSync: nil,
            repositoryState: "unavailable",
            hasSource: false
        )
        XCTAssertNil(glance.pendingInboxCount)
        XCTAssertNil(glance.pendingApprovalCount)
        XCTAssertEqual(glance.state, "unavailable")
    }

    func testApprovalGlanceDecisionUnavailable() async throws {
        let approvals = try await MockKenosAPIClient().fetchApprovals(KenosRequestContext())
        let glances = KenosGlanceMapper.approvalGlances(from: approvals)
        XCTAssertFalse(glances.isEmpty)
        XCTAssertFalse(glances[0].decisionAvailable)
        XCTAssertTrue(glances[0].handoffDeepLink.hasPrefix("kenos://approvals/"))
    }

    @MainActor
    func testWatchCaptureQueuesWithoutCanonicalWrite() throws {
        let owner = UUID(uuidString: "20000000-0000-4000-8000-000000000001")!
        let session = KenosHandoffSession(transport: FakeCompanionTransport(), ownerId: owner)
        let draft = KenosCaptureFactory.makeDraft(text: "dictation preview", sourceContext: "watch")
        let glance = KenosGlanceMapper.captureGlance(from: draft)
        XCTAssertEqual(glance.safePreview, "dictation preview")
        try session.enqueueCaptureTransfer(draft)
        XCTAssertEqual(session.transfers.first?.state, .queued)
    }

    func testAccessibilityIdentifiersDocumentedForWatch() {
        let ids = [
            "kenos.watch.root",
            "kenos.watch.today",
            "kenos.watch.capture",
            "kenos.watch.inbox",
            "kenos.watch.approvals",
            "kenos.watch.activity",
        ]
        XCTAssertEqual(ids.count, 6)
    }
}
