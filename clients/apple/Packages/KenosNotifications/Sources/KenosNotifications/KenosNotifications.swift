import Foundation
import KenosClient
import KenosContracts

public enum KenosNotificationType: String, Codable, Sendable, CaseIterable {
    case planReminder = "plan_reminder"
    case workDeliverableDue = "work_deliverable_due"
    case approvalRequested = "approval_requested"
    case actionResult = "action_result"
    case inboxItem = "inbox_item"
    case syncFailure = "sync_failure"
    case queuedActionTerminalFailure = "queued_action_terminal_failure"
}

public struct KenosNotificationRecord: Codable, Equatable, Sendable, Identifiable {
    public var id: UUID
    public var type: KenosNotificationType
    public var safeTitle: String
    public var safeBody: String
    public var entityRef: EntityRef?
    public var deepLink: String
    public var risk: KenosRisk
    public var classification: KenosDataClassification
    public var createdAt: String
    public var expiresAt: String?
    public var deduplicationKey: String
    public var correlationId: UUID

    public init(
        id: UUID = UUID(),
        type: KenosNotificationType,
        safeTitle: String,
        safeBody: String,
        entityRef: EntityRef? = nil,
        deepLink: String,
        risk: KenosRisk,
        classification: KenosDataClassification,
        createdAt: String,
        expiresAt: String? = nil,
        deduplicationKey: String,
        correlationId: UUID = UUID()
    ) {
        self.id = id
        self.type = type
        self.safeTitle = safeTitle
        self.safeBody = safeBody
        self.entityRef = entityRef
        self.deepLink = deepLink
        self.risk = risk
        self.classification = classification
        self.createdAt = createdAt
        self.expiresAt = expiresAt
        self.deduplicationKey = deduplicationKey
        self.correlationId = correlationId
    }
}

public enum KenosNotificationSafety {
    public static let forbiddenMarkers = ["token", "secret", "password", "authorization", "cookie", "bearer"]

    public static func containsSensitiveLeak(_ text: String) -> Bool {
        let lowered = text.lowercased()
        for marker in forbiddenMarkers {
            if lowered.range(of: #"\b"# + marker + #"\b"#, options: .regularExpression) != nil {
                return true
            }
        }
        return false
    }

    public static func validate(_ record: KenosNotificationRecord) throws {
        if containsSensitiveLeak(record.safeTitle) || containsSensitiveLeak(record.safeBody) {
            throw KenosClientError.malformedPayload
        }
        if record.safeTitle.isEmpty || record.deduplicationKey.isEmpty {
            throw KenosClientError.malformedPayload
        }
        if let expiresAt = record.expiresAt, expiresAt <= record.createdAt {
            throw KenosClientError.malformedPayload
        }
    }

    /// Lock Screen / watch glance preview — sensitive classes get a generic body.
    public static func lockScreenBody(for record: KenosNotificationRecord) -> String {
        switch record.classification {
        case .sensitive, .restrictedLocalOnly, .workConfidential:
            return "Kenos has an update · open to review"
        case .public, .personal, .ephemeral:
            return record.safeBody
        }
    }

    public static func isExpired(_ record: KenosNotificationRecord, now: String) -> Bool {
        guard let expiresAt = record.expiresAt else { return false }
        return expiresAt <= now
    }
}

public struct KenosNotificationPreferences: Codable, Equatable, Sendable {
    public var categoryEnabled: [KenosNotificationType: Bool]
    public var quietHoursStart: Int?
    public var quietHoursEnd: Int?
    public var sensitivePreviewAllowed: Bool
    public var watchDeliveryEnabled: Bool
    public var criticalAlertsEnabled: Bool
    public var domainEnabled: [KenosDomain: Bool]
    public var syncFailureVisible: Bool
    /// Local distribution preference only — not a server preference truth.
    public var isLocalDistributionPreference: Bool

    public static let `default` = KenosNotificationPreferences(
        categoryEnabled: Dictionary(uniqueKeysWithValues: KenosNotificationType.allCases.map { ($0, true) }),
        quietHoursStart: nil,
        quietHoursEnd: nil,
        sensitivePreviewAllowed: false,
        watchDeliveryEnabled: true,
        criticalAlertsEnabled: false,
        domainEnabled: [:],
        syncFailureVisible: true,
        isLocalDistributionPreference: true
    )

    public init(
        categoryEnabled: [KenosNotificationType: Bool],
        quietHoursStart: Int?,
        quietHoursEnd: Int?,
        sensitivePreviewAllowed: Bool,
        watchDeliveryEnabled: Bool,
        criticalAlertsEnabled: Bool,
        domainEnabled: [KenosDomain: Bool],
        syncFailureVisible: Bool,
        isLocalDistributionPreference: Bool
    ) {
        self.categoryEnabled = categoryEnabled
        self.quietHoursStart = quietHoursStart
        self.quietHoursEnd = quietHoursEnd
        self.sensitivePreviewAllowed = sensitivePreviewAllowed
        self.watchDeliveryEnabled = watchDeliveryEnabled
        self.criticalAlertsEnabled = criticalAlertsEnabled
        self.domainEnabled = domainEnabled
        self.syncFailureVisible = syncFailureVisible
        self.isLocalDistributionPreference = isLocalDistributionPreference
    }
}

public protocol KenosNotificationProviding: Sendable {
    func schedule(_ record: KenosNotificationRecord) async throws
    func pending() async -> [KenosNotificationRecord]
    func clear() async
}

/// Fixture/mock provider — never talks to APNs.
public actor MockNotificationProvider: KenosNotificationProviding {
    private var records: [KenosNotificationRecord] = []
    private var seenKeys: Set<String> = []

    public init() {}

    public func schedule(_ record: KenosNotificationRecord) async throws {
        try KenosNotificationSafety.validate(record)
        if seenKeys.contains(record.deduplicationKey) {
            return
        }
        seenKeys.insert(record.deduplicationKey)
        records.append(record)
    }

    public func pending() async -> [KenosNotificationRecord] { records }

    public func clear() async {
        records.removeAll()
        seenKeys.removeAll()
    }
}

public enum KenosNotificationFixtures {
    public static func planReminder(now: String = "2026-07-19T12:00:00.000Z") -> KenosNotificationRecord {
        KenosNotificationRecord(
            type: .planReminder,
            safeTitle: "Plan reminder",
            safeBody: "Review Phase 4B",
            deepLink: "kenos://plan/task/50000000-0000-4000-8000-000000000001",
            risk: .r1,
            classification: .personal,
            createdAt: now,
            expiresAt: "2099-07-19T12:00:00.000Z",
            deduplicationKey: "plan-reminder-50000000"
        )
    }

    public static func approvalRequested(now: String = "2026-07-19T12:00:00.000Z") -> KenosNotificationRecord {
        KenosNotificationRecord(
            type: .approvalRequested,
            safeTitle: "Approval requested",
            safeBody: "Preview one Plan change",
            deepLink: "kenos://approvals/81000000-0000-4000-8000-000000000001",
            risk: .r2,
            classification: .personal,
            createdAt: now,
            expiresAt: "2099-07-19T12:30:00.000Z",
            deduplicationKey: "approval-81000000"
        )
    }
}
