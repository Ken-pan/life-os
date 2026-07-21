import Foundation
#if canImport(UserNotifications)
import UserNotifications
#endif

/// Production local notification center — Inbox + optional UN scheduling.
/// Never talks to APNs.
public actor KenosLocalNotificationCenter: KenosNotificationProviding {
    public static let shared = KenosLocalNotificationCenter()

    public static let planReminderDedupePrefix = "plan-reminder-"

    private let defaults: UserDefaults
    private let recordsKey: String
    private let preferencesKey: String
    private var records: [KenosNotificationRecord] = []
    private var deliveredRecords: [KenosNotificationRecord] = []
    private var preferences: KenosNotificationPreferences = .default
    private var loaded = false
    /// When false, skip UN (unit tests / platforms without scheduling).
    private let schedulesSystemNotifications: Bool
    private var suppressChangeNotifications = false

    public init(
        defaults: UserDefaults = .standard,
        namespace: String = "kenos.notifications",
        schedulesSystemNotifications: Bool = true
    ) {
        self.defaults = defaults
        self.recordsKey = "\(namespace).pending"
        self.preferencesKey = "\(namespace).preferences"
        self.schedulesSystemNotifications = schedulesSystemNotifications
    }

    private func ensureLoaded() {
        guard !loaded else { return }
        loaded = true
        if let data = defaults.data(forKey: recordsKey),
           let decoded = try? JSONDecoder().decode([KenosNotificationRecord].self, from: data)
        {
            records = decoded
        }
        if let data = defaults.data(forKey: preferencesKey),
           let decoded = try? JSONDecoder().decode(KenosNotificationPreferences.self, from: data)
        {
            preferences = decoded
        }
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(records) {
            defaults.set(data, forKey: recordsKey)
        }
        if let data = try? JSONEncoder().encode(preferences) {
            defaults.set(data, forKey: preferencesKey)
        }
    }

    private func notifyChanged() {
        guard !suppressChangeNotifications else { return }
        NotificationCenter.default.post(name: .kenosNotificationsDidChange, object: nil)
    }

    public func currentPreferences() async -> KenosNotificationPreferences {
        ensureLoaded()
        return preferences
    }

    public func updatePreferences(_ preferences: KenosNotificationPreferences) async {
        ensureLoaded()
        self.preferences = preferences
        persist()
        await reapplySystemDelivery()
        notifyChanged()
    }

    public func pending() async -> [KenosNotificationRecord] {
        ensureLoaded()
        return records
    }

    public func delivered() async -> [KenosNotificationRecord] {
        ensureLoaded()
        return deliveredRecords
    }

    public func clear() async {
        ensureLoaded()
        let ids = records.map(\.deduplicationKey)
        records.removeAll()
        deliveredRecords.removeAll()
        persist()
        for key in ids {
            await removeSystemRequest(deduplicationKey: key)
        }
        notifyChanged()
    }

    public func cancel(id: UUID) async {
        ensureLoaded()
        guard let record = records.first(where: { $0.id == id }) else { return }
        records.removeAll { $0.id == id }
        persist()
        await removeSystemRequest(deduplicationKey: record.deduplicationKey)
        notifyChanged()
    }

    public func cancel(deduplicationKey: String) async {
        ensureLoaded()
        let existed = records.contains { $0.deduplicationKey == deduplicationKey }
        records.removeAll { $0.deduplicationKey == deduplicationKey }
        persist()
        await removeSystemRequest(deduplicationKey: deduplicationKey)
        if existed { notifyChanged() }
    }

    public func cancelAll(type: KenosNotificationType?) async {
        ensureLoaded()
        let keys = records
            .filter { type == nil || $0.type == type }
            .map(\.deduplicationKey)
        guard !keys.isEmpty || type == nil else { return }
        if type == nil {
            records.removeAll()
        } else {
            records.removeAll { $0.type == type }
        }
        persist()
        for key in keys {
            await removeSystemRequest(deduplicationKey: key)
        }
        notifyChanged()
    }

    public func replace(
        deduplicationKey: String,
        with record: KenosNotificationRecord,
        at fireAt: Date?
    ) async throws {
        var next = record
        next.deduplicationKey = deduplicationKey
        suppressChangeNotifications = true
        defer {
            suppressChangeNotifications = false
            notifyChanged()
        }
        await cancel(deduplicationKey: deduplicationKey)
        try await schedule(next, at: fireAt)
    }

    public func schedule(_ record: KenosNotificationRecord, at fireAt: Date?) async throws {
        ensureLoaded()
        try KenosNotificationSafety.validate(record)

        var stored = record
        let resolvedFire = fireAt ?? KenosNotificationISO.date(from: record.fireAt)
        if let resolvedFire {
            stored.fireAt = KenosNotificationISO.string(from: resolvedFire)
        }

        if let index = records.firstIndex(where: { $0.deduplicationKey == stored.deduplicationKey }) {
            records[index] = stored
        } else {
            records.append(stored)
        }
        persist()

        await removeSystemRequest(deduplicationKey: stored.deduplicationKey)

        if schedulesSystemNotifications {
            let domain = KenosNotificationDomainMap.domain(for: stored.type)
            let preferred = resolvedFire ?? Date()
            // Past fire time → inbox only (unless nil fireAt = immediate).
            if let resolvedFire, resolvedFire <= Date() {
                notifyChanged()
                return
            }
            // Quiet hours: defer to quietHoursEnd instead of silently dropping UN.
            if let delivery = preferences.systemDeliveryFireDate(
                for: stored,
                domain: domain,
                preferred: preferred
            ) {
                if delivery != preferred {
                    stored.fireAt = KenosNotificationISO.string(from: delivery)
                    if let index = records.firstIndex(where: { $0.deduplicationKey == stored.deduplicationKey }) {
                        records[index] = stored
                    }
                    persist()
                }
                await addSystemRequest(record: stored, fireAt: delivery)
            }
        }

        notifyChanged()
    }

    /// Bulk-replace Planner reminder jobs (dedupe prefix `plan-reminder-`).
    public func syncPlanReminders(
        _ jobs: [(taskId: String, title: String, fireAtMs: Double)]
    ) async throws {
        ensureLoaded()
        suppressChangeNotifications = true
        defer {
            suppressChangeNotifications = false
            notifyChanged()
        }

        let existingKeys = Set(
            records
                .filter { $0.deduplicationKey.hasPrefix(Self.planReminderDedupePrefix) }
                .map(\.deduplicationKey)
        )
        let nextKeys = Set(jobs.map { "\(Self.planReminderDedupePrefix)\($0.taskId)" })

        for key in existingKeys.subtracting(nextKeys) {
            await cancel(deduplicationKey: key)
        }

        let now = Date()
        for job in jobs {
            let fireAt = Date(timeIntervalSince1970: job.fireAtMs / 1000)
            guard fireAt > now else {
                await cancel(deduplicationKey: "\(Self.planReminderDedupePrefix)\(job.taskId)")
                continue
            }
            let record = KenosNotificationFactory.planReminder(
                taskId: job.taskId,
                title: job.title,
                fireAt: fireAt,
                now: now
            )
            try await schedule(record, at: fireAt)
        }
    }

    public func markDelivered(deduplicationKey: String) async {
        ensureLoaded()
        guard let index = records.firstIndex(where: { $0.deduplicationKey == deduplicationKey }) else {
            return
        }
        let item = records.remove(at: index)
        deliveredRecords.append(item)
        persist()
        await removeSystemRequest(deduplicationKey: deduplicationKey)
        notifyChanged()
    }

    /// Re-evaluate UN requests after preference changes (quiet hours / category).
    private func reapplySystemDelivery() async {
        guard schedulesSystemNotifications else { return }
        let snapshot = records
        for var record in snapshot {
            await removeSystemRequest(deduplicationKey: record.deduplicationKey)
            let fire = KenosNotificationISO.date(from: record.fireAt)
            if let fire, fire <= Date() { continue }
            let domain = KenosNotificationDomainMap.domain(for: record.type)
            let preferred = fire ?? Date()
            guard let delivery = preferences.systemDeliveryFireDate(
                for: record,
                domain: domain,
                preferred: preferred
            ) else {
                continue
            }
            if delivery != preferred {
                record.fireAt = KenosNotificationISO.string(from: delivery)
                if let index = records.firstIndex(where: { $0.deduplicationKey == record.deduplicationKey }) {
                    records[index] = record
                }
                persist()
            }
            await addSystemRequest(record: record, fireAt: delivery)
        }
    }

    // MARK: - UN

    private func removeSystemRequest(deduplicationKey: String) async {
        guard schedulesSystemNotifications else { return }
        #if canImport(UserNotifications)
        let id = KenosNotificationSafety.requestIdentifier(forDeduplicationKey: deduplicationKey)
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [id])
        center.removeDeliveredNotifications(withIdentifiers: [id])
        #endif
    }

    private func addSystemRequest(record: KenosNotificationRecord, fireAt: Date?) async {
        guard schedulesSystemNotifications else { return }
        #if canImport(UserNotifications)
        let content = UNMutableNotificationContent()
        content.title = record.safeTitle
        // Even with preview allowed, keep lock-screen redaction for confidential classes.
        if preferences.sensitivePreviewAllowed,
           record.classification == .public
            || record.classification == .personal
            || record.classification == .ephemeral
        {
            content.body = record.safeBody
        } else {
            content.body = KenosNotificationSafety.lockScreenBody(for: record)
        }
        content.sound = .default
        content.userInfo = [
            "kenosDeepLink": record.deepLink,
            "kenosType": record.type.rawValue,
            "kenosId": record.id.uuidString,
            "kenosDedupeKey": record.deduplicationKey,
        ]
        if record.type == .planReminder {
            content.categoryIdentifier = KenosNotificationActionID.categoryPlanReminder
            content.threadIdentifier = "kenos.plan"
        }

        let trigger: UNNotificationTrigger
        if let fireAt {
            let comps = Calendar.current.dateComponents(
                [.year, .month, .day, .hour, .minute, .second],
                from: fireAt
            )
            trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        } else {
            trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        }

        let request = UNNotificationRequest(
            identifier: KenosNotificationSafety.requestIdentifier(
                forDeduplicationKey: record.deduplicationKey
            ),
            content: content,
            trigger: trigger
        )
        do {
            try await UNUserNotificationCenter.current().add(request)
        } catch {
            // Inbox already persisted; UN failure is non-fatal.
        }
        #endif
    }
}

#if canImport(UserNotifications)
public enum KenosLocalNotificationCategories {
    @MainActor
    public static func register() {
        let open = UNNotificationAction(
            identifier: KenosNotificationActionID.open,
            title: "Open",
            options: [.foreground]
        )
        let snooze = UNNotificationAction(
            identifier: KenosNotificationActionID.snooze15m,
            title: "Snooze 15m",
            options: []
        )
        let plan = UNNotificationCategory(
            identifier: KenosNotificationActionID.categoryPlanReminder,
            actions: [open, snooze],
            intentIdentifiers: [],
            options: []
        )
        UNUserNotificationCenter.current().setNotificationCategories([plan])
    }
}
#endif
