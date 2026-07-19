import Combine
import Foundation
import KenosClient
import KenosContracts

public enum KenosCacheFreshness: String, Codable, Sendable {
    case ready
    case stale
    case unavailable
    case partial
}

public struct KenosCacheMeta: Codable, Equatable, Sendable {
    public var schemaVersion: Int
    public var ownerId: UUID?
    public var lastSuccessfulSync: String?
    public var freshness: KenosCacheFreshness
    public var sourceAvailability: [String: Bool]
    public var classification: KenosDataClassification

    public init(
        schemaVersion: Int = 1,
        ownerId: UUID? = nil,
        lastSuccessfulSync: String? = nil,
        freshness: KenosCacheFreshness = .unavailable,
        sourceAvailability: [String: Bool] = [:],
        classification: KenosDataClassification = .personal
    ) {
        self.schemaVersion = schemaVersion
        self.ownerId = ownerId
        self.lastSuccessfulSync = lastSuccessfulSync
        self.freshness = freshness
        self.sourceAvailability = sourceAvailability
        self.classification = classification
    }
}

public struct KenosProjectionSnapshot: Codable, Equatable, Sendable {
    public var today: TodayProjection?
    public var inbox: [InboxItem]
    public var approvals: [ApprovalRecord]
    public var activity: [ActivityItem]
    public var work: WorkOverview?
    public var meta: KenosCacheMeta

    public init(
        today: TodayProjection? = nil,
        inbox: [InboxItem] = [],
        approvals: [ApprovalRecord] = [],
        activity: [ActivityItem] = [],
        work: WorkOverview? = nil,
        meta: KenosCacheMeta = KenosCacheMeta()
    ) {
        self.today = today
        self.inbox = inbox
        self.approvals = approvals
        self.activity = activity
        self.work = work
        self.meta = meta
    }
}

public protocol KenosProjectionStoring: Sendable {
    func load(ownerId: UUID?) throws -> KenosProjectionSnapshot
    func save(_ snapshot: KenosProjectionSnapshot) throws
    func clear(ownerId: UUID?) throws
}

/// File-backed projection cache. R3/R4 payloads must not be persisted (caller responsibility).
public final class FileProjectionStore: KenosProjectionStoring, @unchecked Sendable {
    private let directory: URL
    private let lock = NSLock()
    public static let currentSchemaVersion = 1

    public init(directory: URL) {
        self.directory = directory
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private func fileURL(ownerId: UUID?) -> URL {
        let leaf = ownerId?.uuidString ?? "anonymous"
        return directory.appendingPathComponent("projection-\(leaf).json")
    }

    public func load(ownerId: UUID?) throws -> KenosProjectionSnapshot {
        lock.lock(); defer { lock.unlock() }
        let url = fileURL(ownerId: ownerId)
        guard FileManager.default.fileExists(atPath: url.path) else {
            return KenosProjectionSnapshot(meta: KenosCacheMeta(ownerId: ownerId, freshness: .unavailable))
        }
        let data = try Data(contentsOf: url)
        let snapshot = try JSONDecoder().decode(KenosProjectionSnapshot.self, from: data)
        if snapshot.meta.schemaVersion != Self.currentSchemaVersion {
            try? FileManager.default.removeItem(at: url)
            return KenosProjectionSnapshot(meta: KenosCacheMeta(ownerId: ownerId, freshness: .unavailable))
        }
        if let ownerId, let cachedOwner = snapshot.meta.ownerId, cachedOwner != ownerId {
            return KenosProjectionSnapshot(meta: KenosCacheMeta(ownerId: ownerId, freshness: .unavailable))
        }
        return snapshot
    }

    public func save(_ snapshot: KenosProjectionSnapshot) throws {
        lock.lock(); defer { lock.unlock() }
        if !snapshot.meta.classification.allowsDiskProjectionCache {
            // Fail closed for elevated classifications (sensitive / workConfidential / restrictedLocalOnly).
            throw KenosClientError.permissionDenied
        }
        var copy = snapshot
        copy.meta.schemaVersion = Self.currentSchemaVersion
        let data = try JSONEncoder().encode(copy)
        try data.write(to: fileURL(ownerId: snapshot.meta.ownerId), options: .atomic)
    }

    public func clear(ownerId: UUID?) throws {
        lock.lock(); defer { lock.unlock() }
        let url = fileURL(ownerId: ownerId)
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
    }
}

@MainActor
public final class KenosReadRepository: ObservableObject {
    public enum SurfaceState: Equatable {
        case loading
        case ready
        case stale
        case unavailable
        case permissionDenied
        case sessionExpired
        case malformed
        case empty
        case partial
    }

    @Published public private(set) var snapshot: KenosProjectionSnapshot
    @Published public private(set) var state: SurfaceState = .loading
    @Published public private(set) var lastError: KenosClientError?

    private let client: any KenosAPIClient
    private let store: any KenosProjectionStoring
    private let session: any KenosSessionProviding

    public init(client: any KenosAPIClient, store: any KenosProjectionStoring, session: any KenosSessionProviding) {
        self.client = client
        self.store = store
        self.session = session
        self.snapshot = KenosProjectionSnapshot()
    }

    public func bootstrap() async {
        let owner = try? await session.ownerId()
        if let cached = try? store.load(ownerId: owner),
           cached.today != nil || !cached.inbox.isEmpty || cached.work != nil {
            snapshot = cached
            state = cached.meta.freshness == .ready ? .ready : .stale
        }
        await refresh()
    }

    public func refresh() async {
        state = snapshot.today == nil ? .loading : state
        let context = KenosRequestContext()
        do {
            let owner = try await session.ownerId()
            _ = try await session.accessToken()
            async let today = client.fetchToday(context)
            async let inbox = client.fetchInbox(context)
            async let approvals = client.fetchApprovals(context)
            async let activity = client.fetchActivity(context)
            async let work = client.fetchWork(context)
            let fetched = KenosProjectionSnapshot(
                today: try await today,
                inbox: try await inbox,
                approvals: try await approvals,
                activity: try await activity,
                work: try await work,
                meta: KenosCacheMeta(
                    ownerId: owner,
                    lastSuccessfulSync: ISO8601DateFormatter().string(from: Date()),
                    freshness: .ready,
                    sourceAvailability: [
                        "today": true,
                        "inbox": true,
                        "approvals": true,
                        "activity": true,
                        "work": true,
                    ],
                    classification: .personal
                )
            )
            let prepared = KenosProjectionClassifier.prepareForPersistence(fetched, fallbackOwnerId: owner)
            snapshot = prepared.display
            if let disk = prepared.persistable {
                try? store.save(disk)
            }
            if prepared.strippedConfidentialWork {
                state = .partial
            } else {
                state = snapshot.today?.cards.isEmpty == true ? .empty : .ready
            }
            lastError = nil
        } catch let error as KenosClientError {
            lastError = error
            let hasCache = snapshot.today != nil || snapshot.work != nil
            let display = KenosErrorMapper.displayStatus(for: error, hasCache: hasCache)
            switch display {
            case "stale": state = .stale
            case "unavailable": state = .unavailable
            case "session_expired": state = .sessionExpired
            case "permission_denied": state = .permissionDenied
            case "malformed": state = .malformed
            default: state = hasCache ? .stale : .unavailable
            }
            if hasCache {
                var meta = snapshot.meta
                meta.freshness = .stale
                snapshot.meta = meta
            }
        } catch is CancellationError {
            lastError = .cancelled
        } catch {
            lastError = .server(String(describing: error))
            state = snapshot.today == nil ? .unavailable : .stale
        }
    }

    public func logoutClear() async {
        let owner = try? await session.ownerId()
        try? store.clear(ownerId: owner)
        // Also clear anonymous / other owner files when session already expired.
        try? store.clear(ownerId: nil)
        snapshot = KenosProjectionSnapshot()
        state = .sessionExpired
    }
}
