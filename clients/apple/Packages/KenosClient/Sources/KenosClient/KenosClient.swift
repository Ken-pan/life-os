import Foundation
import KenosContracts

public enum KenosClientError: Error, Equatable, Sendable {
    case timeout
    case cancelled
    case unauthorized
    case permissionDenied
    case unavailable
    case malformedPayload
    case unsupportedVersion
    case server(String)
    case offline
}

public enum KenosRetryClass: String, Sendable {
    case none
    case transient
    case permanent
}

public struct KenosRequestContext: Sendable {
    public var correlationId: UUID
    public var timeoutNanoseconds: UInt64
    public var idempotencyKey: String?

    public init(
        correlationId: UUID = UUID(),
        timeoutNanoseconds: UInt64 = 15_000_000_000,
        idempotencyKey: String? = nil
    ) {
        self.correlationId = correlationId
        self.timeoutNanoseconds = timeoutNanoseconds
        self.idempotencyKey = idempotencyKey
    }
}

public protocol KenosSessionProviding: Sendable {
    func accessToken() async throws -> String?
    func ownerId() async throws -> UUID?
    func markExpired() async
}

public actor MockSessionProvider: KenosSessionProviding {
    private var token: String?
    private var owner: UUID?
    private var expired = false

    public init(
        token: String? = "mock-session-token",
        owner: UUID? = UUID(uuidString: "20000000-0000-4000-8000-000000000001")
    ) {
        self.token = token
        self.owner = owner
    }

    public func accessToken() async throws -> String? {
        if expired { throw KenosClientError.unauthorized }
        return token
    }

    public func ownerId() async throws -> UUID? {
        if expired { throw KenosClientError.unauthorized }
        return owner
    }

    public func markExpired() async {
        expired = true
        token = nil
    }

    public func clearSession() async {
        expired = true
        token = nil
        owner = nil
    }
}

public protocol KenosSecureStore: Sendable {
    func writeSecret(_ value: Data, account: String) throws
    func readSecret(account: String) throws -> Data?
    func deleteSecret(account: String) throws
}

public final class InMemorySecureStore: KenosSecureStore, @unchecked Sendable {
    /// Local/mock only. Production builds must inject a SecItem-backed store (P4A-004).
    public static let isProductionCapable = false
    private var values: [String: Data] = [:]
    private let lock = NSLock()

    public init() {}

    public func writeSecret(_ value: Data, account: String) throws {
        lock.lock(); defer { lock.unlock() }
        values[account] = value
    }

    public func readSecret(account: String) throws -> Data? {
        lock.lock(); defer { lock.unlock() }
        return values[account]
    }

    public func deleteSecret(account: String) throws {
        lock.lock(); defer { lock.unlock() }
        values.removeValue(forKey: account)
    }
}

/// Session materials must only live behind `KenosSecureStore`.
/// Current apps inject `InMemorySecureStore` (mock). SecItem Keychain is a distribution gate (P4A-004).
/// Never write tokens into UserDefaults, SwiftData, logs, or crash diagnostics.
public final class KenosKeychainSessionStore: @unchecked Sendable {
    public static let tokenAccount = "kenos.session.accessToken"
    public static let ownerAccount = "kenos.session.ownerId"

    private let secureStore: KenosSecureStore

    public init(secureStore: KenosSecureStore) {
        self.secureStore = secureStore
    }

    public func save(token: String, ownerId: UUID) throws {
        try secureStore.writeSecret(Data(token.utf8), account: Self.tokenAccount)
        try secureStore.writeSecret(Data(ownerId.uuidString.utf8), account: Self.ownerAccount)
    }

    public func loadToken() throws -> String? {
        guard let data = try secureStore.readSecret(account: Self.tokenAccount) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    public func loadOwnerId() throws -> UUID? {
        guard let data = try secureStore.readSecret(account: Self.ownerAccount),
              let raw = String(data: data, encoding: .utf8) else { return nil }
        return UUID(uuidString: raw)
    }

    public func clear() throws {
        try secureStore.deleteSecret(account: Self.tokenAccount)
        try secureStore.deleteSecret(account: Self.ownerAccount)
    }
}

public struct KenosReadState: Codable, Equatable, Sendable {
    public var status: String
    public var freshness: String
    public var lastUpdated: String?
    public var classification: KenosDataClassification
    public var deepLink: String?
    public var ownerDomain: KenosDomain
    public var source: String

    public init(
        status: String,
        freshness: String,
        lastUpdated: String? = nil,
        classification: KenosDataClassification,
        deepLink: String? = nil,
        ownerDomain: KenosDomain,
        source: String
    ) {
        self.status = status
        self.freshness = freshness
        self.lastUpdated = lastUpdated
        self.classification = classification
        self.deepLink = deepLink
        self.ownerDomain = ownerDomain
        self.source = source
    }
}

public struct TodayProjection: Codable, Equatable, Sendable {
    public var cards: [TodayCard]
    public var meta: KenosReadState

    public init(cards: [TodayCard], meta: KenosReadState) {
        self.cards = cards
        self.meta = meta
    }
}

public struct TodayCard: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var kind: String
    public var title: String
    public var summary: String
    public var ownerDomain: KenosDomain
    public var deepLink: String
    public var classification: KenosDataClassification
    public var freshness: String
    public var actionCapability: String

    public init(
        id: String,
        kind: String,
        title: String,
        summary: String,
        ownerDomain: KenosDomain,
        deepLink: String,
        classification: KenosDataClassification,
        freshness: String,
        actionCapability: String
    ) {
        self.id = id
        self.kind = kind
        self.title = title
        self.summary = summary
        self.ownerDomain = ownerDomain
        self.deepLink = deepLink
        self.classification = classification
        self.freshness = freshness
        self.actionCapability = actionCapability
    }
}

public struct InboxItem: Codable, Equatable, Sendable, Identifiable {
    public var id: UUID
    public var title: String
    public var safeSummary: String
    public var ownerDomain: KenosDomain
    public var source: String
    public var deepLink: String
    public var freshness: String
    public var classification: KenosDataClassification

    public init(
        id: UUID,
        title: String,
        safeSummary: String,
        ownerDomain: KenosDomain,
        source: String,
        deepLink: String,
        freshness: String,
        classification: KenosDataClassification
    ) {
        self.id = id
        self.title = title
        self.safeSummary = safeSummary
        self.ownerDomain = ownerDomain
        self.source = source
        self.deepLink = deepLink
        self.freshness = freshness
        self.classification = classification
    }
}

public struct ActivityItem: Codable, Equatable, Sendable, Identifiable {
    public var id: UUID
    public var safeSummary: String
    public var result: String
    public var ownerDomain: KenosDomain
    public var correlationId: UUID
    public var occurredAt: String
    public var undoAvailable: Bool
    public var deepLink: String?

    public init(
        id: UUID,
        safeSummary: String,
        result: String,
        ownerDomain: KenosDomain,
        correlationId: UUID,
        occurredAt: String,
        undoAvailable: Bool,
        deepLink: String?
    ) {
        self.id = id
        self.safeSummary = safeSummary
        self.result = result
        self.ownerDomain = ownerDomain
        self.correlationId = correlationId
        self.occurredAt = occurredAt
        self.undoAvailable = undoAvailable
        self.deepLink = deepLink
    }
}

public struct WorkOverview: Codable, Equatable, Sendable {
    public var projects: [WorkProject]
    public var deliverables: [WorkDeliverable]
    public var meetings: [WorkMeeting]
    public var decisions: [WorkDecision]
    public var proposals: [WorkActionProposal]
    public var library: [WorkLibraryProjection]
    public var meta: KenosReadState

    public init(
        projects: [WorkProject],
        deliverables: [WorkDeliverable],
        meetings: [WorkMeeting],
        decisions: [WorkDecision],
        proposals: [WorkActionProposal],
        library: [WorkLibraryProjection],
        meta: KenosReadState
    ) {
        self.projects = projects
        self.deliverables = deliverables
        self.meetings = meetings
        self.decisions = decisions
        self.proposals = proposals
        self.library = library
        self.meta = meta
    }
}

public struct CaptureDraft: Codable, Equatable, Sendable, Identifiable {
    public var id: UUID
    public var text: String
    public var sourceContext: String?
    public var targetHint: String?
    public var classification: KenosDataClassification
    public var capturedAt: String
    public var correlationId: UUID
    public var queueStatus: String

    public init(
        id: UUID = UUID(),
        text: String,
        sourceContext: String? = nil,
        targetHint: String? = nil,
        classification: KenosDataClassification = .personal,
        capturedAt: String,
        correlationId: UUID = UUID(),
        queueStatus: String = "draft"
    ) {
        self.id = id
        self.text = text
        self.sourceContext = sourceContext
        self.targetHint = targetHint
        self.classification = classification
        self.capturedAt = capturedAt
        self.correlationId = correlationId
        self.queueStatus = queueStatus
    }
}

public protocol KenosAPIClient: Sendable {
    func fetchToday(_ context: KenosRequestContext) async throws -> TodayProjection
    func fetchInbox(_ context: KenosRequestContext) async throws -> [InboxItem]
    func fetchApprovals(_ context: KenosRequestContext) async throws -> [ApprovalRecord]
    func fetchActivity(_ context: KenosRequestContext) async throws -> [ActivityItem]
    func fetchWork(_ context: KenosRequestContext) async throws -> WorkOverview
}

public enum KenosFixtureLoader {
    public static func data(named name: String) throws -> Data {
        guard let url = Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
                ?? Bundle.module.url(forResource: name, withExtension: "json")
        else { throw KenosClientError.malformedPayload }
        return try Data(contentsOf: url)
    }

    public static func decode<T: Decodable>(_ type: T.Type, named name: String) throws -> T {
        do {
            return try JSONDecoder().decode(type, from: data(named: name))
        } catch {
            throw KenosClientError.malformedPayload
        }
    }
}

public struct MockKenosAPIClient: KenosAPIClient {
    public enum Mode: Sendable {
        case ready
        case offline
        case permissionDenied
        case malformed
        case unsupportedVersion
        case unauthorized
        case unavailable
    }

    public var mode: Mode

    public init(mode: Mode = .ready) {
        self.mode = mode
    }

    public func fetchToday(_ context: KenosRequestContext) async throws -> TodayProjection {
        try await gate(context)
        let project = try KenosFixtureLoader.decode(WorkProject.self, named: "work-project")
        let now = "2026-07-19T12:00:00.000Z"
        return TodayProjection(
            cards: [
                TodayCard(
                    id: "plan-1",
                    kind: "plan_task",
                    title: "Review Phase 4A",
                    summary: "Native daily loop",
                    ownerDomain: .plan,
                    deepLink: "kenos://plan/task/50000000-0000-4000-8000-000000000001",
                    classification: .personal,
                    freshness: "ready",
                    actionCapability: "open_plan_task"
                ),
                TodayCard(
                    id: "work-1",
                    kind: "active_project",
                    title: project.title,
                    summary: project.safeSummary,
                    ownerDomain: .work,
                    deepLink: "kenos://work/project/\(project.id.uuidString)",
                    classification: project.dataClassification,
                    freshness: "ready",
                    actionCapability: "open_work_project"
                ),
                TodayCard(
                    id: "inbox-1",
                    kind: "pending_inbox",
                    title: "1 pending inbox item",
                    summary: "Captured note awaiting routing",
                    ownerDomain: .plan,
                    deepLink: "kenos://inbox",
                    classification: .personal,
                    freshness: "ready",
                    actionCapability: "open_inbox"
                ),
                TodayCard(
                    id: "approval-1",
                    kind: "pending_approval",
                    title: "1 pending approval",
                    summary: "Read-only · production Executor off",
                    ownerDomain: .system,
                    deepLink: "kenos://approvals",
                    classification: .personal,
                    freshness: "ready",
                    actionCapability: "open_approvals"
                ),
            ],
            meta: KenosReadState(
                status: "ready",
                freshness: "ready",
                lastUpdated: now,
                classification: .personal,
                deepLink: "kenos://today",
                ownerDomain: .assistant,
                source: "mock_today"
            )
        )
    }

    public func fetchInbox(_ context: KenosRequestContext) async throws -> [InboxItem] {
        try await gate(context)
        return [
            InboxItem(
                id: UUID(uuidString: "c1000000-0000-4000-8000-000000000001")!,
                title: "Captured note",
                safeSummary: "Route later · draft only",
                ownerDomain: .plan,
                source: "capture",
                deepLink: "kenos://inbox/c1000000-0000-4000-8000-000000000001",
                freshness: "ready",
                classification: .personal
            ),
        ]
    }

    public func fetchApprovals(_ context: KenosRequestContext) async throws -> [ApprovalRecord] {
        try await gate(context)
        return [try KenosFixtureLoader.decode(ApprovalRecord.self, named: "approval-pending")]
    }

    public func fetchActivity(_ context: KenosRequestContext) async throws -> [ActivityItem] {
        try await gate(context)
        return [
            ActivityItem(
                id: UUID(uuidString: "d1000000-0000-4000-8000-000000000001")!,
                safeSummary: "Listed Approvals",
                result: "succeeded",
                ownerDomain: .system,
                correlationId: UUID(uuidString: "40000000-0000-4000-8000-000000000001")!,
                occurredAt: "2026-07-19T12:00:00.000Z",
                undoAvailable: false,
                deepLink: "kenos://activity/d1000000-0000-4000-8000-000000000001"
            ),
        ]
    }

    public func fetchWork(_ context: KenosRequestContext) async throws -> WorkOverview {
        try await gate(context)
        let project = try KenosFixtureLoader.decode(WorkProject.self, named: "work-project")
        let libraryProject = try KenosFixtureLoader.decode(WorkProject.self, named: "work-project-library")
        return WorkOverview(
            projects: [project],
            deliverables: [try KenosFixtureLoader.decode(WorkDeliverable.self, named: "work-deliverable")],
            meetings: [try KenosFixtureLoader.decode(WorkMeeting.self, named: "work-meeting")],
            decisions: [try KenosFixtureLoader.decode(WorkDecision.self, named: "work-decision")],
            proposals: [try KenosFixtureLoader.decode(WorkActionProposal.self, named: "work-action-proposal")],
            library: libraryProject.libraryRefs,
            meta: KenosReadState(
                status: "ready",
                freshness: "ready",
                lastUpdated: project.updatedAt.rawValue,
                classification: .workConfidential,
                deepLink: "kenos://work",
                ownerDomain: .work,
                source: "mock_work"
            )
        )
    }

    private func gate(_ context: KenosRequestContext) async throws {
        try Task.checkCancellation()
        _ = context
        switch mode {
        case .ready: return
        case .offline: throw KenosClientError.offline
        case .permissionDenied: throw KenosClientError.permissionDenied
        case .malformed: throw KenosClientError.malformedPayload
        case .unsupportedVersion: throw KenosClientError.unsupportedVersion
        case .unauthorized: throw KenosClientError.unauthorized
        case .unavailable: throw KenosClientError.unavailable
        }
    }
}

public enum KenosErrorMapper {
    public static func retryClass(for error: KenosClientError) -> KenosRetryClass {
        switch error {
        case .timeout, .unavailable, .offline, .server: return .transient
        case .cancelled, .unauthorized, .permissionDenied, .malformedPayload, .unsupportedVersion: return .permanent
        }
    }

    public static func displayStatus(for error: KenosClientError, hasCache: Bool) -> String {
        switch error {
        case .offline, .unavailable, .timeout:
            return hasCache ? "stale" : "unavailable"
        case .unauthorized:
            return "session_expired"
        case .permissionDenied:
            return "permission_denied"
        case .malformedPayload, .unsupportedVersion:
            return "malformed"
        case .cancelled:
            return "cancelled"
        case .server:
            return hasCache ? "stale" : "unavailable"
        }
    }
}

public enum KenosDeepLink: Equatable, Sendable, Hashable {
    case today
    case assistant
    case inbox
    case inboxItem(UUID)
    case approvals
    case approval(UUID)
    case activity
    case activityItem(UUID)
    case work
    case workProject(UUID)
    case deliverable(UUID)
    case meeting(UUID)
    case decision(UUID)
    case planTask(UUID)
    case library(UUID)
    case capture
    case system
    case unknown(String)
}

public enum KenosDeepLinkRouter {
    public static func parse(_ raw: String) -> KenosDeepLink {
        guard let url = URL(string: raw), url.scheme == "kenos" else { return .unknown(raw) }
        let host = (url.host ?? "").lowercased()
        let parts = url.pathComponents.filter { $0 != "/" }

        func uuidAt(_ index: Int) -> UUID? {
            guard parts.indices.contains(index) else { return nil }
            return UUID(uuidString: parts[index])
        }

        switch host {
        case "today": return .today
        case "assistant": return .assistant
        case "inbox":
            if let id = uuidAt(0) { return .inboxItem(id) }
            return .inbox
        case "approvals":
            if let id = uuidAt(0) { return .approval(id) }
            return .approvals
        case "activity":
            if let id = uuidAt(0) { return .activityItem(id) }
            return .activity
        case "work":
            if parts.first == "project", let id = uuidAt(1) { return .workProject(id) }
            return .work
        case "deliverable":
            guard let id = uuidAt(0) else { return .unknown(raw) }
            return .deliverable(id)
        case "meeting":
            guard let id = uuidAt(0) else { return .unknown(raw) }
            return .meeting(id)
        case "decision":
            guard let id = uuidAt(0) else { return .unknown(raw) }
            return .decision(id)
        case "plan":
            if parts.first == "task", let id = uuidAt(1) { return .planTask(id) }
            return .unknown(raw)
        case "library":
            guard let id = parts.last.flatMap(UUID.init(uuidString:)) else { return .unknown(raw) }
            return .library(id)
        case "capture": return .capture
        case "system": return .system
        default: return .unknown(raw)
        }
    }

    public static func href(_ link: KenosDeepLink) -> String {
        switch link {
        case .today: return "kenos://today"
        case .assistant: return "kenos://assistant"
        case .inbox: return "kenos://inbox"
        case let .inboxItem(id): return "kenos://inbox/\(id.uuidString)"
        case .approvals: return "kenos://approvals"
        case let .approval(id): return "kenos://approvals/\(id.uuidString)"
        case .activity: return "kenos://activity"
        case let .activityItem(id): return "kenos://activity/\(id.uuidString)"
        case .work: return "kenos://work"
        case let .workProject(id): return "kenos://work/project/\(id.uuidString)"
        case let .deliverable(id): return "kenos://deliverable/\(id.uuidString)"
        case let .meeting(id): return "kenos://meeting/\(id.uuidString)"
        case let .decision(id): return "kenos://decision/\(id.uuidString)"
        case let .planTask(id): return "kenos://plan/task/\(id.uuidString)"
        case let .library(id): return "kenos://library/document/\(id.uuidString)"
        case .capture: return "kenos://capture"
        case .system: return "kenos://system"
        case let .unknown(raw): return raw
        }
    }

    public static let coveredRoutes: [String] = [
        "kenos://today",
        "kenos://assistant",
        "kenos://inbox",
        "kenos://approvals",
        "kenos://activity",
        "kenos://work",
        "kenos://work/project/a1000000-0000-4000-8000-000000000001",
        "kenos://deliverable/a2000000-0000-4000-8000-000000000001",
        "kenos://meeting/a3000000-0000-4000-8000-000000000001",
        "kenos://decision/a4000000-0000-4000-8000-000000000001",
        "kenos://plan/task/50000000-0000-4000-8000-000000000001",
        "kenos://library/document/b1000000-0000-4000-8000-000000000001",
        "kenos://capture",
        "kenos://system",
    ]
}
