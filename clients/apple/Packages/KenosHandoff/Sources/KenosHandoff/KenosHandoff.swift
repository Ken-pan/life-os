import Combine
import Foundation
import KenosActions
import KenosClient
import KenosContracts

public enum KenosHandoffMessageKind: String, Codable, Sendable {
    case openDeepLink = "open_deep_link"
    case transferCapture = "transfer_capture"
    case requestRefresh = "request_refresh"
    case syncStatus = "sync_status"
}

public struct KenosHandoffEnvelope: Codable, Equatable, Sendable, Identifiable {
    public var id: UUID
    public var kind: KenosHandoffMessageKind
    public var schemaVersion: Int
    public var ownerId: UUID
    public var correlationId: UUID
    public var idempotencyKey: String
    public var deepLink: String?
    public var capture: CaptureDraft?
    public var syncLabel: String?
    public var createdAt: String

    public static let currentSchemaVersion = 1

    public init(
        id: UUID = UUID(),
        kind: KenosHandoffMessageKind,
        schemaVersion: Int = KenosHandoffEnvelope.currentSchemaVersion,
        ownerId: UUID,
        correlationId: UUID = UUID(),
        idempotencyKey: String,
        deepLink: String? = nil,
        capture: CaptureDraft? = nil,
        syncLabel: String? = nil,
        createdAt: String
    ) {
        self.id = id
        self.kind = kind
        self.schemaVersion = schemaVersion
        self.ownerId = ownerId
        self.correlationId = correlationId
        self.idempotencyKey = idempotencyKey
        self.deepLink = deepLink
        self.capture = capture
        self.syncLabel = syncLabel
        self.createdAt = createdAt
    }
}

public enum KenosHandoffError: Error, Equatable, Sendable {
    case malformed
    case unsupportedVersion
    case ownerMismatch
    case duplicateIgnored
    case unavailable
}

public protocol KenosCompanionTransporting: Sendable {
    func send(_ envelope: KenosHandoffEnvelope) async throws
    func receive() async -> [KenosHandoffEnvelope]
}

/// In-memory fake WatchConnectivity replacement for local proof.
public actor FakeCompanionTransport: KenosCompanionTransporting {
    private var inbox: [KenosHandoffEnvelope] = []
    public var failNext = false

    public init(failNext: Bool = false) {
        self.failNext = failNext
    }

    public func send(_ envelope: KenosHandoffEnvelope) async throws {
        if failNext {
            failNext = false
            throw KenosHandoffError.unavailable
        }
        inbox.append(envelope)
    }

    public func receive() async -> [KenosHandoffEnvelope] {
        let copy = inbox
        inbox.removeAll()
        return copy
    }
}

public enum KenosHandoffValidator {
    public static func validate(_ envelope: KenosHandoffEnvelope, expectedOwner: UUID) throws {
        guard envelope.schemaVersion == KenosHandoffEnvelope.currentSchemaVersion else {
            throw KenosHandoffError.unsupportedVersion
        }
        guard !envelope.idempotencyKey.isEmpty else { throw KenosHandoffError.malformed }
        guard envelope.ownerId == expectedOwner else { throw KenosHandoffError.ownerMismatch }
        switch envelope.kind {
        case .openDeepLink:
            guard let link = envelope.deepLink else { throw KenosHandoffError.malformed }
            if case .unknown = KenosDeepLinkRouter.parse(link) { throw KenosHandoffError.malformed }
        case .transferCapture:
            guard let capture = envelope.capture, !capture.text.isEmpty else { throw KenosHandoffError.malformed }
        case .requestRefresh, .syncStatus:
            break
        }
    }
}

@MainActor
public final class KenosHandoffSession: ObservableObject {
    public enum TransferState: String, Codable, Sendable {
        case queued
        case sending
        case delivered
        case retry
        case failed
    }

    public struct TrackedTransfer: Identifiable, Equatable {
        public var id: UUID
        public var envelope: KenosHandoffEnvelope
        public var state: TransferState
    }

    @Published public private(set) var transfers: [TrackedTransfer] = []
    @Published public private(set) var lastReceivedDeepLink: String?
    @Published public private(set) var receivedCaptures: [CaptureDraft] = []

    private let transport: any KenosCompanionTransporting
    private let ownerId: UUID
    private var seenIdempotency: Set<String> = []
    private let storeURL: URL?

    public init(transport: any KenosCompanionTransporting, ownerId: UUID, persistDirectory: URL? = nil) {
        self.transport = transport
        self.ownerId = ownerId
        if let persistDirectory {
            try? FileManager.default.createDirectory(at: persistDirectory, withIntermediateDirectories: true)
            self.storeURL = persistDirectory.appendingPathComponent("handoff-queue.json")
            if let data = try? Data(contentsOf: storeURL!),
               let decoded = try? JSONDecoder().decode([TrackedTransfer].self, from: data) {
                self.transfers = decoded
                self.seenIdempotency = Set(decoded.map(\.envelope.idempotencyKey))
            }
        } else {
            self.storeURL = nil
        }
    }

    public func enqueueOpenOnPhone(deepLink: String, correlationId: UUID = UUID()) throws {
        let envelope = KenosHandoffEnvelope(
            kind: .openDeepLink,
            ownerId: ownerId,
            correlationId: correlationId,
            idempotencyKey: "open-\(deepLink)-\(correlationId.uuidString)",
            deepLink: deepLink,
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
        try KenosHandoffValidator.validate(envelope, expectedOwner: ownerId)
        try enqueue(envelope)
    }

    public func enqueueCaptureTransfer(_ draft: CaptureDraft) throws {
        let envelope = KenosHandoffEnvelope(
            kind: .transferCapture,
            ownerId: ownerId,
            correlationId: draft.correlationId,
            idempotencyKey: "capture-\(draft.id.uuidString)",
            capture: draft,
            createdAt: draft.capturedAt
        )
        try KenosHandoffValidator.validate(envelope, expectedOwner: ownerId)
        try enqueue(envelope)
    }

    public func processOutgoing() async {
        for index in transfers.indices {
            guard transfers[index].state == .queued || transfers[index].state == .retry || transfers[index].state == .failed else {
                continue
            }
            transfers[index].state = .sending
            do {
                try await transport.send(transfers[index].envelope)
                transfers[index].state = .delivered
            } catch {
                transfers[index].state = .retry
            }
        }
        persist()
    }

    public func drainIncoming() async throws {
        let messages = await transport.receive()
        for message in messages {
            try KenosHandoffValidator.validate(message, expectedOwner: ownerId)
            if seenIdempotency.contains(message.idempotencyKey) {
                continue
            }
            seenIdempotency.insert(message.idempotencyKey)
            switch message.kind {
            case .openDeepLink:
                lastReceivedDeepLink = message.deepLink
            case .transferCapture:
                if let capture = message.capture {
                    receivedCaptures.append(capture)
                }
            case .requestRefresh, .syncStatus:
                break
            }
        }
    }

    public func logoutClear() {
        transfers.removeAll()
        receivedCaptures.removeAll()
        lastReceivedDeepLink = nil
        seenIdempotency.removeAll()
        if let storeURL, FileManager.default.fileExists(atPath: storeURL.path) {
            try? FileManager.default.removeItem(at: storeURL)
        }
    }

    private func enqueue(_ envelope: KenosHandoffEnvelope) throws {
        if seenIdempotency.contains(envelope.idempotencyKey) {
            return
        }
        seenIdempotency.insert(envelope.idempotencyKey)
        transfers.append(TrackedTransfer(id: envelope.id, envelope: envelope, state: .queued))
        persist()
    }

    private func persist() {
        guard let storeURL else { return }
        if let data = try? JSONEncoder().encode(transfers) {
            try? data.write(to: storeURL, options: .atomic)
        }
    }
}

extension KenosHandoffSession.TrackedTransfer: Codable {}
