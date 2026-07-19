import Combine
import Foundation
import KenosClient
import KenosContracts

public enum KenosQueuedActionStatus: String, Codable, Sendable, CaseIterable {
    case pending
    case sending
    case retry
    case delivered
    case failed
    case cancelled
    case terminal
}

public struct KenosQueuedAction: Codable, Equatable, Sendable, Identifiable {
    public var id: UUID
    public var idempotencyKey: String
    public var correlationId: UUID
    public var risk: KenosRisk
    public var actionType: String
    public var safeSummary: String
    public var status: KenosQueuedActionStatus
    public var attemptCount: Int
    public var lastError: String?
    public var createdAt: String
    public var updatedAt: String
    public var requiresApproval: Bool
    public var productionWrite: Bool

    public init(
        id: UUID = UUID(),
        idempotencyKey: String,
        correlationId: UUID = UUID(),
        risk: KenosRisk,
        actionType: String,
        safeSummary: String,
        status: KenosQueuedActionStatus = .pending,
        attemptCount: Int = 0,
        lastError: String? = nil,
        createdAt: String,
        updatedAt: String,
        requiresApproval: Bool = false,
        productionWrite: Bool = false
    ) {
        self.id = id
        self.idempotencyKey = idempotencyKey
        self.correlationId = correlationId
        self.risk = risk
        self.actionType = actionType
        self.safeSummary = safeSummary
        self.status = status
        self.attemptCount = attemptCount
        self.lastError = lastError
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.requiresApproval = requiresApproval
        self.productionWrite = productionWrite
    }
}

public protocol KenosActionExecuting: Sendable {
    func deliver(_ action: KenosQueuedAction) async throws -> KenosQueuedActionStatus
}

/// Fake executor for local proof only. Never treats delivery as a canonical domain write.
public struct FakeActionExecutor: KenosActionExecuting {
    public var failNext = false
    public init(failNext: Bool = false) { self.failNext = failNext }

    public func deliver(_ action: KenosQueuedAction) async throws -> KenosQueuedActionStatus {
        if action.productionWrite { throw KenosClientError.permissionDenied }
        if action.requiresApproval { throw KenosClientError.permissionDenied }
        if action.risk == .r3 || action.risk == .r4 { throw KenosClientError.permissionDenied }
        if failNext { throw KenosClientError.unavailable }
        return .delivered
    }
}

public protocol KenosActionQueuePersisting: Sendable {
    func load() throws -> [KenosQueuedAction]
    func save(_ actions: [KenosQueuedAction]) throws
    func clear() throws
}

public final class FileActionQueueStore: KenosActionQueuePersisting, @unchecked Sendable {
    private let url: URL
    private let lock = NSLock()

    public init(directory: URL) {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        self.url = directory.appendingPathComponent("offline-actions.json")
    }

    public func load() throws -> [KenosQueuedAction] {
        lock.lock(); defer { lock.unlock() }
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        return try JSONDecoder().decode([KenosQueuedAction].self, from: Data(contentsOf: url))
    }

    public func save(_ actions: [KenosQueuedAction]) throws {
        lock.lock(); defer { lock.unlock() }
        try JSONEncoder().encode(actions).write(to: url, options: .atomic)
    }

    public func clear() throws {
        lock.lock(); defer { lock.unlock() }
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
    }
}

@MainActor
public final class KenosOfflineActionQueue: ObservableObject {
    public static let maxAttempts = 5

    @Published public private(set) var actions: [KenosQueuedAction] = []

    private let store: any KenosActionQueuePersisting
    private let executor: any KenosActionExecuting
    private var seenIdempotency: Set<String> = []

    public init(store: any KenosActionQueuePersisting, executor: any KenosActionExecuting = FakeActionExecutor()) {
        self.store = store
        self.executor = executor
        self.actions = (try? store.load()) ?? []
        seenIdempotency = Set(actions.map(\.idempotencyKey))
    }

    public func enqueueR1Draft(
        actionType: String,
        safeSummary: String,
        idempotencyKey: String,
        correlationId: UUID = UUID()
    ) throws {
        guard !idempotencyKey.isEmpty else { throw KenosClientError.malformedPayload }
        if seenIdempotency.contains(idempotencyKey) {
            return // server-style idempotency: no duplicate enqueue
        }
        let now = ISO8601DateFormatter().string(from: Date())
        let action = KenosQueuedAction(
            idempotencyKey: idempotencyKey,
            correlationId: correlationId,
            risk: .r1,
            actionType: actionType,
            safeSummary: safeSummary,
            status: .pending,
            createdAt: now,
            updatedAt: now,
            requiresApproval: false,
            productionWrite: false
        )
        actions.append(action)
        seenIdempotency.insert(idempotencyKey)
        try persist()
    }

    public func rejectOfflineHighRisk(risk: KenosRisk) throws {
        if risk == .r3 || risk == .r4 {
            throw KenosClientError.permissionDenied
        }
    }

    public func cancel(_ id: UUID) throws {
        guard let index = actions.firstIndex(where: { $0.id == id }) else { return }
        guard actions[index].status == .pending || actions[index].status == .retry || actions[index].status == .failed else {
            return
        }
        actions[index].status = .cancelled
        actions[index].updatedAt = ISO8601DateFormatter().string(from: Date())
        try persist()
    }

    public func processPending(manual: Bool = false) async {
        _ = manual
        for index in actions.indices {
            let status = actions[index].status
            guard status == .pending || status == .retry || status == .failed else { continue }
            if actions[index].attemptCount >= Self.maxAttempts {
                actions[index].status = .terminal
                actions[index].lastError = "max_attempts"
                continue
            }
            actions[index].status = .sending
            actions[index].attemptCount += 1
            actions[index].updatedAt = ISO8601DateFormatter().string(from: Date())
            do {
                let result = try await executor.deliver(actions[index])
                actions[index].status = result
                actions[index].lastError = nil
            } catch {
                actions[index].status = .retry
                actions[index].lastError = String(describing: error)
            }
        }
        try? persist()
    }

    public func failedActions() -> [KenosQueuedAction] {
        actions.filter { $0.status == .failed || $0.status == .retry || $0.status == .terminal }
    }

    public func logoutClear() throws {
        actions.removeAll()
        seenIdempotency.removeAll()
        try store.clear()
    }

    private func persist() throws {
        try store.save(actions)
    }
}

public enum KenosCaptureFactory {
    public static func makeDraft(text: String, sourceContext: String? = nil, targetHint: String? = nil) -> CaptureDraft {
        CaptureDraft(
            text: text,
            sourceContext: sourceContext,
            targetHint: targetHint,
            classification: .personal,
            capturedAt: ISO8601DateFormatter().string(from: Date()),
            queueStatus: "draft"
        )
    }
}
