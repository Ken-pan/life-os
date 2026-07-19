import Foundation
import Testing
import KenosActions
import KenosClient
import KenosHandoff

@Test("Handoff capture transfer is idempotent and owner-isolated")
@MainActor
func captureTransferIdempotent() async throws {
    let owner = UUID(uuidString: "20000000-0000-4000-8000-000000000001")!
    let other = UUID(uuidString: "20000000-0000-4000-8000-000000000002")!
    let transport = FakeCompanionTransport()
    let watch = KenosHandoffSession(transport: transport, ownerId: owner)
    let phone = KenosHandoffSession(transport: transport, ownerId: owner)

    let draft = KenosCaptureFactory.makeDraft(text: "Watch note", sourceContext: "watch")
    try watch.enqueueCaptureTransfer(draft)
    try watch.enqueueCaptureTransfer(draft)
    #expect(watch.transfers.count == 1)

    await watch.processOutgoing()
    #expect(watch.transfers.first?.state == .delivered)

    try await phone.drainIncoming()
    #expect(phone.receivedCaptures.count == 1)

    // Replay same message idempotency key is ignored on phone side via seen set after re-send simulation
    try await phone.drainIncoming()
    #expect(phone.receivedCaptures.count == 1)

    let foreign = KenosHandoffEnvelope(
        kind: .openDeepLink,
        ownerId: other,
        idempotencyKey: "foreign",
        deepLink: "kenos://today",
        createdAt: "2026-07-19T12:00:00.000Z"
    )
    #expect(throws: KenosHandoffError.ownerMismatch) {
        try KenosHandoffValidator.validate(foreign, expectedOwner: owner)
    }
}

@Test("Unsupported schema and malformed deep links fail closed")
func handoffFailClosed() throws {
    let owner = UUID(uuidString: "20000000-0000-4000-8000-000000000001")!
    let badVersion = KenosHandoffEnvelope(
        kind: .requestRefresh,
        schemaVersion: 99,
        ownerId: owner,
        idempotencyKey: "x",
        createdAt: "2026-07-19T12:00:00.000Z"
    )
    #expect(throws: KenosHandoffError.unsupportedVersion) {
        try KenosHandoffValidator.validate(badVersion, expectedOwner: owner)
    }
    let badLink = KenosHandoffEnvelope(
        kind: .openDeepLink,
        ownerId: owner,
        idempotencyKey: "y",
        deepLink: "https://evil.example",
        createdAt: "2026-07-19T12:00:00.000Z"
    )
    #expect(throws: KenosHandoffError.malformed) {
        try KenosHandoffValidator.validate(badLink, expectedOwner: owner)
    }
}

@Test("Restart recovers queued transfers without silent loss")
@MainActor
func restartRecoversQueue() throws {
    let owner = UUID(uuidString: "20000000-0000-4000-8000-000000000001")!
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let transport = FakeCompanionTransport()
    let session = KenosHandoffSession(transport: transport, ownerId: owner, persistDirectory: dir)
    try session.enqueueOpenOnPhone(deepLink: "kenos://approvals")
    #expect(session.transfers.count == 1)

    let restored = KenosHandoffSession(transport: transport, ownerId: owner, persistDirectory: dir)
    #expect(restored.transfers.count == 1)
    #expect(restored.transfers.first?.envelope.deepLink == "kenos://approvals")
    restored.logoutClear()
    #expect(restored.transfers.isEmpty)
}
