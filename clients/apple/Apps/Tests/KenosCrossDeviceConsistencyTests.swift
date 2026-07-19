import XCTest
import KenosClient
import KenosActions
import KenosHandoff
import KenosNotifications

final class KenosCrossDeviceConsistencyTests: XCTestCase {
    @MainActor
    func testCaptureTransferIdempotencyAndEntityConsistency() async throws {
        let owner = UUID(uuidString: "20000000-0000-4000-8000-000000000001")!
        let transport = FakeCompanionTransport()
        let watch = KenosHandoffSession(transport: transport, ownerId: owner)
        let phone = KenosHandoffSession(transport: transport, ownerId: owner)

        let draft = KenosCaptureFactory.makeDraft(text: "Cross-device note", sourceContext: "watch")
        try watch.enqueueCaptureTransfer(draft)
        try watch.enqueueCaptureTransfer(draft)
        XCTAssertEqual(watch.transfers.count, 1)
        await watch.processOutgoing()
        try await phone.drainIncoming()
        XCTAssertEqual(phone.receivedCaptures.count, 1)
        XCTAssertEqual(phone.receivedCaptures.first?.id, draft.id)
    }

    @MainActor
    func testStaleWatchProjectionDoesNotOverrideFresherPhone() async throws {
        let client = MockKenosAPIClient(mode: .ready)
        let today = try await client.fetchToday(KenosRequestContext())
        let phoneFreshness = "ready"
        let watchGlance = KenosGlanceMapper.todayGlance(
            today: today,
            inbox: [],
            approvals: [],
            work: nil,
            freshness: "stale",
            lastSync: "2026-07-19T10:00:00Z",
            repositoryState: "stale",
            hasSource: true
        )
        let phoneGlance = KenosGlanceMapper.todayGlance(
            today: today,
            inbox: [],
            approvals: [],
            work: nil,
            freshness: phoneFreshness,
            lastSync: "2026-07-19T12:00:00Z",
            repositoryState: "ready",
            hasSource: true
        )
        XCTAssertEqual(watchGlance.nextPlanTitle, phoneGlance.nextPlanTitle)
        XCTAssertNotEqual(watchGlance.freshness, phoneGlance.freshness)
        // Watch stale mapping must not invent a newer sync timestamp than phone.
        XCTAssertLessThan(watchGlance.lastSync ?? "", phoneGlance.lastSync ?? "z")
    }

    func testNotificationCorrelationMatchesActivityPath() {
        let note = KenosNotificationFixtures.approvalRequested()
        XCTAssertTrue(note.deepLink.contains("approvals"))
        XCTAssertFalse(KenosNotificationSafety.containsSensitiveLeak(note.safeBody))
    }

    func testComplicationIsReadOnly() {
        let glance = TodayGlance(
            nextPlanTitle: "Review",
            pendingApprovalCount: 1,
            freshness: "ready",
            offlineStatus: "online",
            state: "ready"
        )
        XCTAssertEqual(KenosComplicationFoundation.summaryLine(for: glance), "Review")
        XCTAssertEqual(KenosComplicationFoundation.deepLink(for: glance), "kenos://approvals")
    }
}
