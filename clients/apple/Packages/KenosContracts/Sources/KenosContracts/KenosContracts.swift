import Foundation

public enum KenosContractError: Error, Equatable, Sendable {
    case invalidTimestamp(String)
    case invalidEntityType(String)
    case targetOwnerMismatch
    case invalidExpiry
    case invalidOutboxState
    case invalidOutboxTransition
    case invalidApprovalState
    case invalidApprovalTransition
    case approvalOwnerMismatch
    case approvalActionMismatch
    case unredactedSensitivePayload
    case unsupportedCreateTaskBoundary
}

public enum JSONValue: Codable, Equatable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    public init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if value.decodeNil() { self = .null }
        else if let decoded = try? value.decode(Bool.self) { self = .bool(decoded) }
        else if let decoded = try? value.decode(Double.self) { self = .number(decoded) }
        else if let decoded = try? value.decode(String.self) { self = .string(decoded) }
        else if let decoded = try? value.decode([String: JSONValue].self) { self = .object(decoded) }
        else { self = .array(try value.decode([JSONValue].self)) }
    }

    public func encode(to encoder: Encoder) throws {
        var value = encoder.singleValueContainer()
        switch self {
        case let .string(decoded): try value.encode(decoded)
        case let .number(decoded): try value.encode(decoded)
        case let .bool(decoded): try value.encode(decoded)
        case let .object(decoded): try value.encode(decoded)
        case let .array(decoded): try value.encode(decoded)
        case .null: try value.encodeNil()
        }
    }
}

public struct KenosTimestamp: Codable, Equatable, Hashable, Sendable {
    public let rawValue: String

    public init(_ rawValue: String) throws {
        guard Self.isValid(rawValue) else { throw KenosContractError.invalidTimestamp(rawValue) }
        self.rawValue = rawValue
    }

    public init(from decoder: Decoder) throws {
        try self.init(decoder.singleValueContainer().decode(String.self))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    private static func isValid(_ value: String) -> Bool {
        let pattern = #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$"#
        guard value.range(of: pattern, options: .regularExpression) != nil else { return false }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = value.contains(".")
            ? [.withInternetDateTime, .withFractionalSeconds]
            : [.withInternetDateTime]
        return formatter.date(from: value) != nil
    }
}

public enum KenosSchemaVersion: String, Codable, Sendable { case v1 = "1" }
public enum KenosDomain: String, Codable, CaseIterable, Sendable {
    case core, assistant, work, plan, library, memory, training, money, health, home, music, paper, system, automation, notifications, integration
}
public enum KenosSecurityDomain: String, Codable, CaseIterable, Sendable { case personal, work, household, system }
public enum KenosDataClassification: String, Codable, CaseIterable, Sendable { case `public`, personal, sensitive, workConfidential = "work_confidential", restrictedLocalOnly = "restricted_local_only", ephemeral }
public enum KenosRisk: String, Codable, CaseIterable, Sendable { case r0 = "R0", r1 = "R1", r2 = "R2", r3 = "R3", r4 = "R4" }
public enum KenosActorType: String, Codable, CaseIterable, Sendable { case user, assistant, automation, connector, system }
public enum KenosActionType: String, Codable, CaseIterable, Sendable { case planCreateTask = "plan.create_task" }
public enum KenosActionDecisionOutcome: String, Codable, CaseIterable, Sendable { case allow, requireApproval = "require_approval", deny, expired }
public enum KenosActionResultStatus: String, Codable, CaseIterable, Sendable { case succeeded, failed, queued, conflict, cancelled }
public enum KenosActivityResult: String, Codable, CaseIterable, Sendable { case succeeded, failed, queued, undone, cancelled }
public enum KenosApprovalStatus: String, Codable, CaseIterable, Sendable { case pending, approved, rejected, expired, cancelled, superseded }
public enum KenosOutboxStatus: String, Codable, CaseIterable, Sendable { case pending, processing, published, retry, deadLetter = "dead_letter" }
public enum KenosErrorClass: String, Codable, CaseIterable, Sendable { case transient, permanent }

public struct KenosActor: Codable, Equatable, Sendable {
    public let type: KenosActorType
    public let id: UUID
}

public struct EntityRef: Codable, Equatable, Sendable {
    public let id: UUID
    public let type: String
    public let ownerDomain: KenosDomain
    public let ownerId: UUID
    public let version: Int?

    public func validate() throws {
        guard type.range(of: #"^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$"#, options: .regularExpression) != nil else {
            throw KenosContractError.invalidEntityType(type)
        }
        if let version, version < 0 { throw KenosContractError.invalidOutboxState }
    }
}

public struct ActionRequest: Codable, Equatable, Sendable {
    public let schemaVersion: KenosSchemaVersion
    public let id: UUID
    public let actionType: KenosActionType
    public let producer: KenosDomain
    public let targetDomain: KenosDomain
    public let target: EntityRef?
    public let actor: KenosActor
    public let deviceId: UUID
    public let securityDomain: KenosSecurityDomain
    public let dataClassification: KenosDataClassification
    public let requestedRisk: KenosRisk?
    public let payload: [String: JSONValue]
    public let reason: String?
    public let evidenceRefs: [EntityRef]?
    public let idempotencyKey: String
    public let expectedVersion: Int?
    public let requestedAt: KenosTimestamp
    public let expiresAt: KenosTimestamp?
    public let correlationId: UUID
    public let causationId: UUID?

    public func validate() throws {
        try target?.validate()
        if let target, target.ownerDomain != targetDomain { throw KenosContractError.targetOwnerMismatch }
        if let expiresAt, expiresAt.rawValue <= requestedAt.rawValue { throw KenosContractError.invalidExpiry }
    }

    public func validateCreateTaskBoundary() throws {
        try validate()
        guard actionType == .planCreateTask,
              targetDomain == .plan,
              securityDomain == .personal,
              dataClassification == .personal,
              requestedRisk == .r1,
              producer == .assistant || producer == .plan,
              !(producer == .work || payload["workSource"] != nil)
        else { throw KenosContractError.unsupportedCreateTaskBoundary }
    }
}

public struct ActionDecision: Codable, Equatable, Sendable {
    public struct RequiredApproval: Codable, Equatable, Sendable {
        public enum Level: String, Codable, Sendable { case confirm, strongConfirm = "strong_confirm" }
        public let level: Level
        public let expiresAt: KenosTimestamp
    }
    public let requestId: UUID
    public let outcome: KenosActionDecisionOutcome
    public let evaluatedRisk: KenosRisk
    public let policyVersion: String
    public let reasons: [String]
    public let requiredApproval: RequiredApproval?
    public let decidedAt: KenosTimestamp
}

public struct ActionError: Codable, Equatable, Sendable {
    public let code: String
    public let message: String
    public let retryable: Bool
    public let userAction: String?
}

public struct ActionResult: Codable, Equatable, Sendable {
    public let requestId: UUID
    public let status: KenosActionResultStatus
    public let result: JSONValue?
    public let affectedEntities: [EntityRef]
    public let activityId: UUID
    public let undoAction: ActionRequest?
    public let error: ActionError?
    public let completedAt: KenosTimestamp?
}

public struct ApprovalRequest: Codable, Equatable, Sendable {
    public let id: UUID
    public let actionRequestId: UUID
    public let risk: KenosRisk
    public let summary: String
    public let impact: [String]
    public let sensitiveFieldsRedacted: Bool
    public let reversible: Bool
    public let expiresAt: KenosTimestamp
    public let createdAt: KenosTimestamp
}

public struct ApprovalDecision: Codable, Equatable, Sendable {
    public enum Decision: String, Codable, Sendable { case approved, rejected, expired }
    public enum AuthStrength: String, Codable, Sendable { case session, reauthenticated, biometricOrDevice = "biometric_or_device" }
    public let approvalId: UUID
    public let decision: Decision
    public let decidedBy: UUID
    public let authStrength: AuthStrength
    public let constraints: [String: JSONValue]?
    public let decidedAt: KenosTimestamp
}

public struct ApprovalRecord: Codable, Equatable, Sendable {
    public let id: UUID
    public let version: KenosSchemaVersion
    public let ownerId: UUID
    public let actionId: UUID
    public let correlationId: UUID
    public let requestingActor: KenosActor
    public let requestingDomain: KenosDomain
    public let actionType: String
    public let risk: KenosRisk
    public let status: KenosApprovalStatus
    public let reasonCode: String
    public let safeSummary: String
    public let dataClassification: KenosDataClassification
    public let requestedAt: KenosTimestamp
    public let expiresAt: KenosTimestamp
    public let decidedAt: KenosTimestamp?
    public let decidedBy: UUID?
    public let decisionReason: String?
    public let supersedesApprovalId: UUID?
    public let entityRefs: [EntityRef]
    public let createdAt: KenosTimestamp
    public let updatedAt: KenosTimestamp

    public func validate() throws {
        guard actionType.range(of: #"^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$"#, options: .regularExpression) != nil,
              reasonCode.range(of: #"^[a-z][a-z0-9_]*$"#, options: .regularExpression) != nil,
              !safeSummary.isEmpty,
              safeSummary.count <= 500,
              expiresAt.rawValue > requestedAt.rawValue,
              updatedAt.rawValue >= createdAt.rawValue,
              supersedesApprovalId != id
        else { throw KenosContractError.invalidApprovalState }
        for entity in entityRefs { try entity.validate() }
        let completeDecision = decidedAt != nil && decidedBy != nil && decisionReason?.isEmpty == false
        let anyDecision = decidedAt != nil || decidedBy != nil || decisionReason != nil
        if status == .pending, anyDecision { throw KenosContractError.invalidApprovalState }
        if status != .pending, !completeDecision { throw KenosContractError.invalidApprovalState }
        let lowered = safeSummary.lowercased()
        for marker in ["token", "secret", "password", "authorization", "cookie", "bearer"] {
            if lowered.range(of: #"\b"# + marker + #"\b"#, options: .regularExpression) != nil {
                throw KenosContractError.unredactedSensitivePayload
            }
        }
    }

    public static func validateTransition(from: KenosApprovalStatus, to: KenosApprovalStatus) throws {
        let allowed: [KenosApprovalStatus: Set<KenosApprovalStatus>] = [
            .pending: [.approved, .rejected, .expired, .cancelled, .superseded],
            .approved: [], .rejected: [], .expired: [], .cancelled: [], .superseded: [],
        ]
        guard allowed[from]?.contains(to) == true else { throw KenosContractError.invalidApprovalTransition }
    }
}

public struct MutationEnvelope: Codable, Equatable, Sendable {
    public let schemaVersion: KenosSchemaVersion
    public let mutationId: UUID
    public let idempotencyKey: String
    public let entity: EntityRef
    public let actorId: UUID
    public let deviceId: UUID
    public let baseVersion: Int?
    public let operation: String
    public let payload: [String: JSONValue]
    public let occurredAt: KenosTimestamp
}

public struct CommandError: Codable, Equatable, Sendable {
    public let code: String
    public let message: String
    public let `class`: KenosErrorClass
    public let retryable: Bool
    public let userAction: String?
}

public struct CommandFailure: Codable, Equatable, Sendable {
    public let ok: Bool
    public let error: CommandError
}

public struct ActivityRecord: Codable, Equatable, Sendable {
    public struct Change: Codable, Equatable, Sendable {
        public let path: String
        public let before: JSONValue?
        public let after: JSONValue?
        public let redacted: Bool?
    }
    public struct Undo: Codable, Equatable, Sendable {
        public let supported: Bool
        public let actionType: String?
    }
    public let schemaVersion: KenosSchemaVersion
    public let id: UUID
    public let eventType: String
    public let actor: KenosActor
    public let actionRequestId: UUID?
    public let approvalId: UUID?
    public let targetRefs: [EntityRef]
    public let securityDomain: KenosSecurityDomain
    public let summary: String
    public let reason: String?
    public let result: KenosActivityResult
    public let policy: ActionDecision?
    public let changes: [Change]?
    public let redactedPayload: [String: JSONValue]?
    public let undo: Undo?
    public let undoUntil: KenosTimestamp?
    public let correlationId: UUID
    public let causationId: UUID?
    public let occurredAt: KenosTimestamp

    public func validate() throws {
        for target in targetRefs { try target.validate() }
        if Self.hasUnredactedSensitiveValue(redactedPayload.map(JSONValue.object)) {
            throw KenosContractError.unredactedSensitivePayload
        }
    }

    private static let sensitiveKeys = ["token", "secret", "password", "authorization", "cookie", "rawconversation", "connectorpayload"]
    private static func hasUnredactedSensitiveValue(_ value: JSONValue?) -> Bool {
        guard let value else { return false }
        switch value {
        case let .object(object):
            return object.contains { key, nested in
                let sensitive = sensitiveKeys.contains { key.lowercased().contains($0) }
                if sensitive, nested != .string("[REDACTED]"), nested != .string("[REDACTED_NOTES]") { return true }
                return hasUnredactedSensitiveValue(nested)
            }
        case let .array(array): return array.contains(where: hasUnredactedSensitiveValue)
        default: return false
        }
    }
}

public struct OutboxRecord: Codable, Equatable, Sendable {
    public let id: UUID
    public let topic: String
    public let aggregate: EntityRef
    public let payload: [String: JSONValue]
    public let schemaVersion: KenosSchemaVersion
    public let actionRequestId: UUID?
    public let idempotencyKey: String
    public let correlationId: UUID
    public let causationId: UUID?
    public let occurredAt: KenosTimestamp
    public let availableAt: KenosTimestamp
    public let attempts: Int
    public let maxAttempts: Int?
    public let status: KenosOutboxStatus
    public let lastErrorClass: KenosErrorClass?
    public let failureReason: String?
    public let updatedAt: KenosTimestamp?

    public func validate() throws {
        try aggregate.validate()
        guard attempts >= 0, maxAttempts.map({ $0 > 0 }) ?? true else { throw KenosContractError.invalidOutboxState }
        if status == .deadLetter, failureReason?.isEmpty != false { throw KenosContractError.invalidOutboxState }
    }

    public static func validateTransition(from: KenosOutboxStatus, to: KenosOutboxStatus) throws {
        let allowed: [KenosOutboxStatus: Set<KenosOutboxStatus>] = [
            .pending: [.processing, .deadLetter],
            .processing: [.published, .retry, .deadLetter],
            .retry: [.processing, .deadLetter],
            .published: [],
            .deadLetter: [],
        ]
        guard allowed[from]?.contains(to) == true else { throw KenosContractError.invalidOutboxTransition }
    }
}

public struct CaptureEnvelope: Codable, Equatable, Sendable {
    public struct Source: Codable, Equatable, Sendable {
        public let client: String
        public let deviceId: UUID
        public let connectorId: UUID?
        public let externalUrl: URL?
        public let externalId: String?
    }
    public let schemaVersion: KenosSchemaVersion
    public let id: UUID
    public let kind: String
    public let payload: [String: JSONValue]
    public let source: Source
    public let actorId: UUID
    public let securityDomain: KenosSecurityDomain
    public let dataClassification: KenosDataClassification
    public let suggestedDomains: [KenosDomain]?
    public let contextRefs: [EntityRef]?
    public let contentHash: String?
    public let capturedAt: KenosTimestamp
    public let expiresAt: KenosTimestamp?
    public let idempotencyKey: String
}
