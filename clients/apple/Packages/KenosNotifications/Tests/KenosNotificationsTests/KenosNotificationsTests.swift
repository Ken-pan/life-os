import Foundation
import Testing
import KenosClient
import KenosContracts
import KenosNotifications

@Test("Notification fixtures redact and dedupe without APNs")
func notificationSafetyAndDedup() async throws {
    let provider = MockNotificationProvider()
    let first = KenosNotificationFixtures.approvalRequested()
    try await provider.schedule(first)
    try await provider.schedule(first)
    let pending = await provider.pending()
    #expect(pending.count == 1)
    #expect(KenosNotificationSafety.lockScreenBody(for: first) == first.safeBody)

    let sensitive = KenosNotificationRecord(
        type: .actionResult,
        safeTitle: "Done",
        safeBody: "ok",
        deepLink: "kenos://activity",
        risk: .r1,
        classification: .workConfidential,
        createdAt: "2026-07-19T12:00:00.000Z",
        deduplicationKey: "sens-1"
    )
    #expect(KenosNotificationSafety.lockScreenBody(for: sensitive).contains("open to review"))

    let leaky = KenosNotificationRecord(
        type: .syncFailure,
        safeTitle: "token leaked",
        safeBody: "no",
        deepLink: "kenos://system",
        risk: .r1,
        classification: .personal,
        createdAt: "2026-07-19T12:00:00.000Z",
        deduplicationKey: "bad"
    )
    await #expect(throws: KenosClientError.malformedPayload) {
        try await provider.schedule(leaky)
    }

    #expect(KenosNotificationSafety.isExpired(
        KenosNotificationRecord(
            type: .planReminder,
            safeTitle: "x",
            safeBody: "y",
            deepLink: "kenos://today",
            risk: .r0,
            classification: .personal,
            createdAt: "2026-07-19T12:00:00.000Z",
            expiresAt: "2026-07-19T11:00:00.000Z",
            deduplicationKey: "exp"
        ),
        now: "2026-07-19T12:00:00.000Z"
    ))
    #expect(KenosNotificationPreferences.default.criticalAlertsEnabled == false)
    #expect(KenosNotificationPreferences.default.isLocalDistributionPreference == true)
}

@Test("Expired notification must not drive Action execution markers")
func expiredNotificationDoesNotAutoExecute() {
    let record = KenosNotificationFixtures.planReminder()
    #expect(record.risk != .r3)
    #expect(record.deepLink.hasPrefix("kenos://"))
    // Tap navigates only — no executor field on the record.
    let mirror = Mirror(reflecting: record)
    #expect(!mirror.children.contains(where: { $0.label == "executorCommand" }))
}
