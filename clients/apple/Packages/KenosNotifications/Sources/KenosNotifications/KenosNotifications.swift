import Foundation
import KenosClient
import KenosContracts

public enum KenosNotificationType: String, Codable, Sendable, CaseIterable {
    case planReminder = "plan_reminder"
    case trainingRestEnd = "training_rest_end"
    case kenosDailyBrief = "kenos_daily_brief"
    case moneyBillDue = "money_bill_due"
    case healthFocusWarn = "health_focus_warn"
    case healthWindDown = "health_wind_down"
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
    /// Absolute fire time (ISO8601). Nil means inbox-only / immediate local trigger.
    public var fireAt: String?

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
        correlationId: UUID = UUID(),
        fireAt: String? = nil
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
        self.fireAt = fireAt
    }
}

/// Optional schedule metadata for local UN delivery.
public struct KenosNotificationSchedule: Codable, Equatable, Sendable {
    public var fireAt: String
    public var threadId: String?
    public var badgeDelta: Int?

    public init(fireAt: String, threadId: String? = nil, badgeDelta: Int? = nil) {
        self.fireAt = fireAt
        self.threadId = threadId
        self.badgeDelta = badgeDelta
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

    /// Strip forbidden markers from user-authored display text (task titles, etc.).
    public static func sanitizeDisplayText(_ text: String, maxLength: Int = 120) -> String {
        var result = text
        for marker in forbiddenMarkers {
            if let regex = try? NSRegularExpression(
                pattern: #"\b"# + NSRegularExpression.escapedPattern(for: marker) + #"\b"#,
                options: [.caseInsensitive]
            ) {
                let range = NSRange(result.startIndex..<result.endIndex, in: result)
                result = regex.stringByReplacingMatches(in: result, options: [], range: range, withTemplate: "•••")
            }
        }
        let trimmed = result.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "Reminder" }
        if trimmed.count <= maxLength { return trimmed }
        let idx = trimmed.index(trimmed.startIndex, offsetBy: maxLength - 1)
        return String(trimmed[..<idx]) + "…"
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

    /// Stable UN request id from dedupe key.
    public static func requestIdentifier(forDeduplicationKey key: String) -> String {
        let sanitized = key
            .lowercased()
            .map { character -> Character in
                if character.isLetter || character.isNumber || character == "-" || character == "_" {
                    return character
                }
                return "-"
            }
        return "kenos.local.\(String(sanitized))"
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

    public func isCategoryEnabled(_ type: KenosNotificationType) -> Bool {
        categoryEnabled[type] ?? true
    }

    public func isDomainEnabled(_ domain: KenosDomain?) -> Bool {
        guard let domain else { return true }
        return domainEnabled[domain] ?? true
    }

    /// Quiet hours use local calendar hour (0–23). Wrap across midnight supported.
    public func isInQuietHours(at date: Date = Date(), calendar: Calendar = .current) -> Bool {
        guard let start = quietHoursStart, let end = quietHoursEnd else { return false }
        guard (0...23).contains(start), (0...23).contains(end), start != end else { return false }
        let hour = calendar.component(.hour, from: date)
        if start < end {
            return hour >= start && hour < end
        }
        return hour >= start || hour < end
    }

    /// First local instant at `quietHoursEnd` that is strictly after `date`.
    public func nextQuietHoursEnd(after date: Date = Date(), calendar: Calendar = .current) -> Date? {
        guard let end = quietHoursEnd, isInQuietHours(at: date, calendar: calendar) else { return nil }
        var comps = calendar.dateComponents([.year, .month, .day], from: date)
        comps.hour = end
        comps.minute = 0
        comps.second = 0
        guard var candidate = calendar.date(from: comps) else { return nil }
        if candidate <= date {
            candidate = calendar.date(byAdding: .day, value: 1, to: candidate) ?? candidate
        }
        return candidate
    }

    /// Category / domain / sync-failure gate only (quiet hours handled by deferral).
    public func allowsCategoryDelivery(
        for record: KenosNotificationRecord,
        domain: KenosDomain? = nil
    ) -> Bool {
        if !isCategoryEnabled(record.type) { return false }
        if record.type == .syncFailure, !syncFailureVisible { return false }
        if !isDomainEnabled(domain) { return false }
        return true
    }

    /// Banner/UN delivery allowed at `date`. Inbox can still keep the record when this is false.
    public func allowsSystemDelivery(
        for record: KenosNotificationRecord,
        domain: KenosDomain? = nil,
        at date: Date = Date(),
        calendar: Calendar = .current
    ) -> Bool {
        guard allowsCategoryDelivery(for: record, domain: domain) else { return false }
        if isInQuietHours(at: date, calendar: calendar) { return false }
        return true
    }

    /// Preferred fire time for UN: nil when category/domain blocked; deferred past quiet hours when needed.
    public func systemDeliveryFireDate(
        for record: KenosNotificationRecord,
        domain: KenosDomain? = nil,
        preferred: Date,
        calendar: Calendar = .current
    ) -> Date? {
        guard allowsCategoryDelivery(for: record, domain: domain) else { return nil }
        if let deferred = nextQuietHoursEnd(after: preferred, calendar: calendar) {
            return deferred
        }
        return preferred
    }
}

public protocol KenosNotificationProviding: Sendable {
    func schedule(_ record: KenosNotificationRecord) async throws
    func schedule(_ record: KenosNotificationRecord, at fireAt: Date?) async throws
    func cancel(id: UUID) async
    func cancel(deduplicationKey: String) async
    func cancelAll(type: KenosNotificationType?) async
    func replace(deduplicationKey: String, with record: KenosNotificationRecord, at fireAt: Date?) async throws
    func pending() async -> [KenosNotificationRecord]
    func delivered() async -> [KenosNotificationRecord]
    func clear() async
    func currentPreferences() async -> KenosNotificationPreferences
    func updatePreferences(_ preferences: KenosNotificationPreferences) async
}

public extension KenosNotificationProviding {
    func schedule(_ record: KenosNotificationRecord) async throws {
        try await schedule(record, at: nil)
    }

    func cancelAll(type: KenosNotificationType?) async {
        let items = await pending()
        for item in items where type == nil || item.type == type {
            await cancel(deduplicationKey: item.deduplicationKey)
        }
    }
}

/// Fixture/mock provider — never talks to APNs or UN.
public actor MockNotificationProvider: KenosNotificationProviding {
    private var records: [KenosNotificationRecord] = []
    private var deliveredRecords: [KenosNotificationRecord] = []
    private var seenKeys: Set<String> = []
    private var preferences: KenosNotificationPreferences = .default

    public init() {}

    public func schedule(_ record: KenosNotificationRecord, at fireAt: Date?) async throws {
        try KenosNotificationSafety.validate(record)
        var stored = record
        if let fireAt {
            stored.fireAt = KenosNotificationISO.string(from: fireAt)
        }
        if let index = records.firstIndex(where: { $0.deduplicationKey == stored.deduplicationKey }) {
            records[index] = stored
            return
        }
        if seenKeys.contains(stored.deduplicationKey) {
            return
        }
        seenKeys.insert(stored.deduplicationKey)
        records.append(stored)
    }

    public func cancel(id: UUID) async {
        records.removeAll { $0.id == id }
    }

    public func cancel(deduplicationKey: String) async {
        records.removeAll { $0.deduplicationKey == deduplicationKey }
        seenKeys.remove(deduplicationKey)
    }

    public func replace(
        deduplicationKey: String,
        with record: KenosNotificationRecord,
        at fireAt: Date?
    ) async throws {
        await cancel(deduplicationKey: deduplicationKey)
        var next = record
        next.deduplicationKey = deduplicationKey
        try await schedule(next, at: fireAt)
    }

    public func pending() async -> [KenosNotificationRecord] { records }

    public func delivered() async -> [KenosNotificationRecord] { deliveredRecords }

    public func clear() async {
        records.removeAll()
        deliveredRecords.removeAll()
        seenKeys.removeAll()
    }

    public func currentPreferences() async -> KenosNotificationPreferences { preferences }

    public func updatePreferences(_ preferences: KenosNotificationPreferences) async {
        self.preferences = preferences
    }

    /// Test helper: mark the first pending record delivered.
    public func markDelivered(_ id: UUID) async {
        guard let index = records.firstIndex(where: { $0.id == id }) else { return }
        deliveredRecords.append(records.remove(at: index))
    }
}

public enum KenosNotificationISO {
    private static func makeFormatter(fractional: Bool) -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = fractional
            ? [.withInternetDateTime, .withFractionalSeconds]
            : [.withInternetDateTime]
        return formatter
    }

    public static func string(from date: Date) -> String {
        makeFormatter(fractional: true).string(from: date)
    }

    public static func date(from string: String?) -> Date? {
        guard let string, !string.isEmpty else { return nil }
        return makeFormatter(fractional: true).date(from: string)
            ?? makeFormatter(fractional: false).date(from: string)
    }

    public static func nowString() -> String {
        string(from: Date())
    }
}

/// Domain hint for preference gates (best-effort from type).
public enum KenosNotificationDomainMap {
    public static func domain(for type: KenosNotificationType) -> KenosDomain {
        switch type {
        case .planReminder: return .plan
        case .trainingRestEnd: return .training
        case .kenosDailyBrief: return .core
        case .moneyBillDue: return .money
        case .healthFocusWarn, .healthWindDown: return .health
        case .workDeliverableDue, .approvalRequested: return .work
        case .actionResult, .queuedActionTerminalFailure: return .automation
        case .inboxItem: return .notifications
        case .syncFailure: return .system
        }
    }
}

/// Continuity deep-link helpers (Planner opens task via `?kenosTask=`).
public enum KenosNotificationDeepLink {
    /// Continuity-friendly Plan task link — opens Planner and task editor.
    public static func planTask(_ taskId: String) -> String {
        let encoded = taskId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? taskId
        return "kenos://plan?path=/?kenosTask=\(encoded)"
    }

    /// Training focus surface (rest / work timer end).
    public static func trainingFocus(dayId: String? = nil) -> String {
        if let dayId, !dayId.isEmpty {
            let encoded = dayId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? dayId
            return "kenos://training?path=/day/\(encoded)/focus"
        }
        return "kenos://training"
    }

    public static func moneyHome() -> String {
        "kenos://money"
    }

    public static func healthFocus() -> String {
        "kenos://health?path=/focus"
    }
}

/// Typed factories — safe titles/bodies only; no secrets.
public enum KenosNotificationFactory {
    public static func planReminder(
        taskId: String,
        title: String,
        fireAt: Date?,
        now: Date = Date()
    ) -> KenosNotificationRecord {
        let created = KenosNotificationISO.string(from: now)
        let fire = fireAt.map(KenosNotificationISO.string(from:))
        let body = KenosNotificationSafety.sanitizeDisplayText(title)
        return KenosNotificationRecord(
            type: .planReminder,
            safeTitle: "Plan reminder",
            safeBody: body,
            deepLink: KenosNotificationDeepLink.planTask(taskId),
            risk: .r1,
            classification: .personal,
            createdAt: created,
            expiresAt: fireAt.map { KenosNotificationISO.string(from: $0.addingTimeInterval(86_400)) },
            deduplicationKey: "plan-reminder-\(taskId)",
            fireAt: fire
        )
    }

    /// Stable dedupe for the single active Training timer (rest or work).
    public static let trainingTimerDedupeKey = "training-timer-active"

    public static func trainingRestEnd(
        title: String,
        body: String,
        fireAt: Date?,
        dayId: String? = nil,
        mode: String = "rest",
        now: Date = Date()
    ) -> KenosNotificationRecord {
        let safeTitle = KenosNotificationSafety.sanitizeDisplayText(title, maxLength: 48)
        let safeBody = KenosNotificationSafety.sanitizeDisplayText(body)
        return KenosNotificationRecord(
            type: .trainingRestEnd,
            safeTitle: safeTitle.isEmpty ? (mode == "work" ? "Work timer done" : "Rest over") : safeTitle,
            safeBody: safeBody,
            deepLink: KenosNotificationDeepLink.trainingFocus(dayId: dayId),
            risk: .r0,
            classification: .personal,
            createdAt: KenosNotificationISO.string(from: now),
            expiresAt: fireAt.map { KenosNotificationISO.string(from: $0.addingTimeInterval(3600)) },
            deduplicationKey: trainingTimerDedupeKey,
            fireAt: fireAt.map(KenosNotificationISO.string(from:))
        )
    }

    public static func kenosDailyBrief(
        title: String,
        body: String,
        dayKey: String,
        fireAt: Date? = nil,
        now: Date = Date()
    ) -> KenosNotificationRecord {
        let resolvedFire = fireAt ?? now
        return KenosNotificationRecord(
            type: .kenosDailyBrief,
            safeTitle: KenosNotificationSafety.sanitizeDisplayText(title, maxLength: 48),
            safeBody: KenosNotificationSafety.sanitizeDisplayText(body, maxLength: 180),
            deepLink: "kenos://today",
            risk: .r0,
            classification: .personal,
            createdAt: KenosNotificationISO.string(from: now),
            expiresAt: KenosNotificationISO.string(from: now.addingTimeInterval(86_400)),
            deduplicationKey: "kenos-daily-brief-\(dayKey)",
            fireAt: KenosNotificationISO.string(from: resolvedFire)
        )
    }

    /// Bill due — title/body must not include amounts (privacy).
    public static func moneyBillDue(
        occurrenceId: String,
        label: String,
        dueDate: String,
        fireAt: Date?,
        now: Date = Date()
    ) -> KenosNotificationRecord {
        let body = KenosNotificationSafety.sanitizeDisplayText(
            "\(label) · \(dueDate)",
            maxLength: 120
        )
        return KenosNotificationRecord(
            type: .moneyBillDue,
            safeTitle: "Bill due",
            safeBody: body,
            deepLink: KenosNotificationDeepLink.moneyHome(),
            risk: .r1,
            classification: .sensitive,
            createdAt: KenosNotificationISO.string(from: now),
            expiresAt: fireAt.map { KenosNotificationISO.string(from: $0.addingTimeInterval(86_400)) },
            deduplicationKey: "money-bill-\(occurrenceId)",
            fireAt: fireAt.map(KenosNotificationISO.string(from:))
        )
    }

    public static func healthFocusWarn(
        body: String,
        sessionKey: String,
        fireAt: Date? = nil,
        now: Date = Date()
    ) -> KenosNotificationRecord {
        let resolved = fireAt ?? now
        return KenosNotificationRecord(
            type: .healthFocusWarn,
            safeTitle: "Focus check-in",
            safeBody: KenosNotificationSafety.sanitizeDisplayText(body, maxLength: 140),
            deepLink: KenosNotificationDeepLink.healthFocus(),
            risk: .r0,
            classification: .personal,
            createdAt: KenosNotificationISO.string(from: now),
            expiresAt: KenosNotificationISO.string(from: now.addingTimeInterval(3600)),
            deduplicationKey: "health-focus-warn-\(sessionKey)",
            fireAt: KenosNotificationISO.string(from: resolved)
        )
    }

    public static func healthWindDown(
        body: String,
        dayKey: String,
        fireAt: Date? = nil,
        now: Date = Date()
    ) -> KenosNotificationRecord {
        let resolved = fireAt ?? now
        return KenosNotificationRecord(
            type: .healthWindDown,
            safeTitle: "Wind down",
            safeBody: KenosNotificationSafety.sanitizeDisplayText(body, maxLength: 140),
            deepLink: KenosNotificationDeepLink.healthFocus(),
            risk: .r0,
            classification: .personal,
            createdAt: KenosNotificationISO.string(from: now),
            expiresAt: KenosNotificationISO.string(from: now.addingTimeInterval(86_400)),
            deduplicationKey: "health-wind-down-\(dayKey)",
            fireAt: KenosNotificationISO.string(from: resolved)
        )
    }

    public static func workDeliverableDue(
        deliverableId: String,
        title: String,
        fireAt: Date? = nil,
        now: Date = Date()
    ) -> KenosNotificationRecord {
        KenosNotificationRecord(
            type: .workDeliverableDue,
            safeTitle: "Deliverable due",
            safeBody: KenosNotificationSafety.sanitizeDisplayText(title),
            deepLink: "kenos://work/deliverable/\(deliverableId)",
            risk: .r1,
            classification: .workConfidential,
            createdAt: KenosNotificationISO.string(from: now),
            deduplicationKey: "work-due-\(deliverableId)",
            fireAt: fireAt.map(KenosNotificationISO.string(from:))
        )
    }

    public static func approvalRequested(
        approvalId: String,
        title: String,
        fireAt: Date? = nil,
        now: Date = Date()
    ) -> KenosNotificationRecord {
        KenosNotificationRecord(
            type: .approvalRequested,
            safeTitle: "Approval requested",
            safeBody: title,
            deepLink: "kenos://approvals/\(approvalId)",
            risk: .r2,
            classification: .personal,
            createdAt: KenosNotificationISO.string(from: now),
            deduplicationKey: "approval-\(approvalId)",
            fireAt: fireAt.map(KenosNotificationISO.string(from:))
        )
    }

    public static func actionResult(
        actionId: String,
        title: String,
        body: String,
        now: Date = Date()
    ) -> KenosNotificationRecord {
        KenosNotificationRecord(
            type: .actionResult,
            safeTitle: title,
            safeBody: body,
            deepLink: "kenos://activity/\(actionId)",
            risk: .r1,
            classification: .personal,
            createdAt: KenosNotificationISO.string(from: now),
            deduplicationKey: "action-result-\(actionId)"
        )
    }

    public static func inboxItem(
        itemId: String,
        title: String,
        body: String,
        now: Date = Date()
    ) -> KenosNotificationRecord {
        KenosNotificationRecord(
            type: .inboxItem,
            safeTitle: title,
            safeBody: body,
            deepLink: "kenos://inbox/\(itemId)",
            risk: .r0,
            classification: .personal,
            createdAt: KenosNotificationISO.string(from: now),
            deduplicationKey: "inbox-\(itemId)"
        )
    }

    public static func syncFailure(
        key: String,
        body: String,
        now: Date = Date()
    ) -> KenosNotificationRecord {
        KenosNotificationRecord(
            type: .syncFailure,
            safeTitle: "Sync issue",
            safeBody: body,
            deepLink: "kenos://system",
            risk: .r1,
            classification: .personal,
            createdAt: KenosNotificationISO.string(from: now),
            deduplicationKey: "sync-failure-\(key)"
        )
    }

    public static func queuedActionTerminalFailure(
        actionId: String,
        body: String,
        now: Date = Date()
    ) -> KenosNotificationRecord {
        KenosNotificationRecord(
            type: .queuedActionTerminalFailure,
            safeTitle: "Action failed",
            safeBody: body,
            deepLink: "kenos://activity/\(actionId)",
            risk: .r2,
            classification: .personal,
            createdAt: KenosNotificationISO.string(from: now),
            deduplicationKey: "queued-fail-\(actionId)"
        )
    }
}

public enum KenosNotificationFixtures {
    public static func planReminder(now: String = "2026-07-19T12:00:00.000Z") -> KenosNotificationRecord {
        KenosNotificationRecord(
            type: .planReminder,
            safeTitle: "Plan reminder",
            safeBody: "Review Phase 4B",
            deepLink: KenosNotificationDeepLink.planTask("50000000-0000-4000-8000-000000000001"),
            risk: .r1,
            classification: .personal,
            createdAt: now,
            expiresAt: "2099-07-19T12:00:00.000Z",
            deduplicationKey: "plan-reminder-50000000",
            fireAt: "2026-07-19T12:08:00.000Z"
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

/// UN category / action ids for plan reminders.
public enum KenosNotificationActionID {
    public static let categoryPlanReminder = "kenos.category.plan_reminder"
    public static let open = "kenos.action.open"
    public static let snooze15m = "kenos.action.snooze_15m"
}

public extension Notification.Name {
    /// Posted after local inbox / UN pending set changes.
    static let kenosNotificationsDidChange = Notification.Name("kenos.notifications.didChange")
}
