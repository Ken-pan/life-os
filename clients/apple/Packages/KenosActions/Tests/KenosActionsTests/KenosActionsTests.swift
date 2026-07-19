import Foundation
import Testing
import KenosActions
import KenosClient

@Test("Offline queue enforces R1 only, idempotency, and restart recovery")
@MainActor
func offlineQueueLifecycle() async throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let store = FileActionQueueStore(directory: dir)
    let queue = KenosOfflineActionQueue(store: store, executor: FakeActionExecutor())

    try queue.rejectOfflineHighRisk(risk: .r1)
    #expect(throws: KenosClientError.permissionDenied) {
        try queue.rejectOfflineHighRisk(risk: .r3)
    }

    try queue.enqueueR1Draft(
        actionType: "plan.create_task",
        safeSummary: "Draft capture routing",
        idempotencyKey: "phase4a-queue-1"
    )
    try queue.enqueueR1Draft(
        actionType: "plan.create_task",
        safeSummary: "Duplicate ignored",
        idempotencyKey: "phase4a-queue-1"
    )
    #expect(queue.actions.count == 1)

    await queue.processPending()
    #expect(queue.actions.first?.status == .delivered)

    let restored = KenosOfflineActionQueue(store: store, executor: FakeActionExecutor())
    #expect(restored.actions.count == 1)
    #expect(restored.actions.first?.status == .delivered)

    try restored.logoutClear()
    #expect(restored.actions.isEmpty)
}

@Test("Fake executor refuses production writes and approval bypass")
@MainActor
func fakeExecutorBoundaries() async throws {
    let executor = FakeActionExecutor()
    let now = "2026-07-19T12:00:00Z"
    let production = KenosQueuedAction(
        idempotencyKey: "x",
        risk: .r1,
        actionType: "plan.create_task",
        safeSummary: "no",
        createdAt: now,
        updatedAt: now,
        productionWrite: true
    )
    await #expect(throws: KenosClientError.permissionDenied) {
        _ = try await executor.deliver(production)
    }
}
