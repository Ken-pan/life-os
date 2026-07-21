import Foundation
import Testing
import KenosClient
import KenosContracts
import KenosNotifications

@Test("Notification fixtures redact and dedupe without APNs")
func notificationSafetyAndDedup() async throws {
    let provider = MockNotificationProvider()
    let first = KenosNotificationFixtures.approvalRequested()
    try await provider.schedule(first)
    try await provider.schedule(first)
    let pending = await provider.pending()
    #expect(pending.count == 1)
    #expect(KenosNotificationSafety.lockScreenBody(for: first) == first.safeBody)

    let sensitive = KenosNotificationRecord(
        type: .actionResult,
        safeTitle: "Done",
        safeBody: "ok",
        deepLink: "kenos://activity",
        risk: .r1,
        classification: .workConfidential,
        createdAt: "2026-07-19T12:00:00.000Z",
        deduplicationKey: "sens-1"
    )
    #expect(KenosNotificationSafety.lockScreenBody(for: sensitive).contains("open to review"))

    let leaky = KenosNotificationRecord(
        type: .syncFailure,
        safeTitle: "token leaked",
        safeBody: "no",
        deepLink: "kenos://system",
        risk: .r1,
        classification: .personal,
        createdAt: "2026-07-19T12:00:00.000Z",
        deduplicationKey: "bad"
    )
    await #expect(throws: KenosClientError.malformedPayload) {
        try await provider.schedule(leaky)
    }

    #expect(KenosNotificationSafety.isExpired(
        KenosNotificationRecord(
            type: .planReminder,
            safeTitle: "x",
            safeBody: "y",
            deepLink: "kenos://today",
            risk: .r0,
            classification: .personal,
            createdAt: "2026-07-19T12:00:00.000Z",
            expiresAt: "2026-07-19T11:00:00.000Z",
            deduplicationKey: "exp"
        ),
        now: "2026-07-19T12:00:00.000Z"
    ))
    #expect(KenosNotificationPreferences.default.criticalAlertsEnabled == false)
    #expect(KenosNotificationPreferences.default.isLocalDistributionPreference == true)
}

@Test("Expired notification must not drive Action execution markers")
func expiredNotificationDoesNotAutoExecute() {
    let record = KenosNotificationFixtures.planReminder()
    #expect(record.risk != .r3)
    #expect(record.deepLink.hasPrefix("kenos://"))
    // Tap navigates only — no executor field on the record.
    let mirror = Mirror(reflecting: record)
    #expect(!mirror.children.contains(where: { $0.label == "executorCommand" }))
}

@Test("Preferences gate category quiet hours and sync failure")
func preferencesGate() {
    var prefs = KenosNotificationPreferences.default
    prefs.categoryEnabled[.planReminder] = false
    let plan = KenosNotificationFixtures.planReminder()
    #expect(!prefs.allowsSystemDelivery(for: plan, domain: .plan))

    prefs = .default
    prefs.quietHoursStart = 22
    prefs.quietHoursEnd = 7
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    var comps = DateComponents(calendar: calendar, timeZone: calendar.timeZone, year: 2026, month: 7, day: 19, hour: 23)
    let late = calendar.date(from: comps)!
    #expect(prefs.isInQuietHours(at: late, calendar: calendar))
    #expect(!prefs.allowsSystemDelivery(for: plan, domain: .plan, at: late, calendar: calendar))

    comps.hour = 10
    let morning = calendar.date(from: comps)!
    #expect(!prefs.isInQuietHours(at: morning, calendar: calendar))
    #expect(prefs.allowsSystemDelivery(for: plan, domain: .plan, at: morning, calendar: calendar))

    // Quiet hours deferral: 23:00 → next 07:00; 02:00 → same-day 07:00.
    comps.hour = 23
    let lateNight = calendar.date(from: comps)!
    let deferredLate = prefs.nextQuietHoursEnd(after: lateNight, calendar: calendar)
    #expect(deferredLate != nil)
    #expect(calendar.component(.hour, from: deferredLate!) == 7)
    #expect(calendar.component(.day, from: deferredLate!) == 20)

    comps.hour = 2
    let early = calendar.date(from: comps)!
    let deferredEarly = prefs.nextQuietHoursEnd(after: early, calendar: calendar)
    #expect(deferredEarly != nil)
    #expect(calendar.component(.hour, from: deferredEarly!) == 7)
    #expect(calendar.component(.day, from: deferredEarly!) == 19)

    let delivery = prefs.systemDeliveryFireDate(
        for: plan,
        domain: .plan,
        preferred: lateNight,
        calendar: calendar
    )
    #expect(delivery == deferredLate)

    prefs = .default
    prefs.syncFailureVisible = false
    let sync = KenosNotificationFactory.syncFailure(key: "1", body: "offline")
    #expect(!prefs.allowsSystemDelivery(for: sync, domain: .system))
    #expect(prefs.systemDeliveryFireDate(for: sync, domain: .system, preferred: morning) == nil)
}

@Test("Local center replace cancel and syncPlanReminders without UN")
func localCenterLifecycle() async throws {
    let defaults = UserDefaults(suiteName: "kenos.notifications.tests.\(UUID().uuidString)")!
    let center = KenosLocalNotificationCenter(
        defaults: defaults,
        namespace: "test",
        schedulesSystemNotifications: false
    )

    let fire = Date().addingTimeInterval(3600)
    let record = KenosNotificationFactory.planReminder(
        taskId: "task-a",
        title: "Write brief",
        fireAt: fire
    )
    try await center.schedule(record, at: fire)
    var pending = await center.pending()
    #expect(pending.count == 1)
    #expect(pending[0].deduplicationKey == "plan-reminder-task-a")

    let replaced = KenosNotificationFactory.planReminder(
        taskId: "task-a",
        title: "Write brief v2",
        fireAt: fire.addingTimeInterval(600)
    )
    try await center.replace(
        deduplicationKey: "plan-reminder-task-a",
        with: replaced,
        at: fire.addingTimeInterval(600)
    )
    pending = await center.pending()
    #expect(pending.count == 1)
    #expect(pending[0].safeBody == "Write brief v2")

    try await center.syncPlanReminders([
        (taskId: "task-b", title: "Other", fireAtMs: (Date().addingTimeInterval(7200).timeIntervalSince1970) * 1000),
    ])
    pending = await center.pending()
    #expect(pending.count == 1)
    #expect(pending[0].deduplicationKey == "plan-reminder-task-b")

    await center.cancel(deduplicationKey: "plan-reminder-task-b")
    pending = await center.pending()
    #expect(pending.isEmpty)

    #expect(KenosNotificationSafety.requestIdentifier(forDeduplicationKey: "plan-reminder-x")
        .hasPrefix("kenos.local."))
}

@Test("Factory covers all notification types")
func factoryAllTypes() {
    let now = Date()
    let all: [KenosNotificationRecord] = [
        KenosNotificationFactory.planReminder(taskId: "1", title: "a", fireAt: now.addingTimeInterval(60), now: now),
        KenosNotificationFactory.trainingRestEnd(
            title: "Rest over",
            body: "Next set",
            fireAt: now.addingTimeInterval(90),
            now: now
        ),
        KenosNotificationFactory.kenosDailyBrief(
            title: "Morning brief",
            body: "3 tasks · train today",
            dayKey: "2026-07-21",
            now: now
        ),
        KenosNotificationFactory.moneyBillDue(
            occurrenceId: "bill-1",
            label: "Rent",
            dueDate: "2026-08-01",
            fireAt: now.addingTimeInterval(120),
            now: now
        ),
        KenosNotificationFactory.healthFocusWarn(body: "Stretch break", sessionKey: "s1", now: now),
        KenosNotificationFactory.healthWindDown(body: "Lights down", dayKey: "2026-07-21", now: now),
        KenosNotificationFactory.workDeliverableDue(deliverableId: "2", title: "b", now: now),
        KenosNotificationFactory.approvalRequested(approvalId: "3", title: "c", now: now),
        KenosNotificationFactory.actionResult(actionId: "4", title: "d", body: "ok", now: now),
        KenosNotificationFactory.inboxItem(itemId: "5", title: "e", body: "note", now: now),
        KenosNotificationFactory.syncFailure(key: "6", body: "sync", now: now),
        KenosNotificationFactory.queuedActionTerminalFailure(actionId: "7", body: "fail", now: now),
    ]
    #expect(Set(all.map(\.type)).count == KenosNotificationType.allCases.count)
}

@Test("Plan reminder deep link opens Continuity task query and sanitizes body")
func planReminderDeepLinkAndSanitize() async throws {
    let link = KenosNotificationDeepLink.planTask("abc-123")
    #expect(link.contains("kenos://plan?path="))
    #expect(link.contains("kenosTask=abc-123"))

    let record = KenosNotificationFactory.planReminder(
        taskId: "t1",
        title: "rotate token tonight",
        fireAt: Date().addingTimeInterval(120)
    )
    #expect(!KenosNotificationSafety.containsSensitiveLeak(record.safeBody))
    #expect(record.safeBody.contains("•••"))
    #expect(record.deepLink.contains("kenosTask=t1"))

    let defaults = UserDefaults(suiteName: "kenos.notifications.tests.\(UUID().uuidString)")!
    let center = KenosLocalNotificationCenter(
        defaults: defaults,
        namespace: "sanitize",
        schedulesSystemNotifications: false
    )
    try await center.schedule(record, at: Date().addingTimeInterval(120))
    let pending = await center.pending()
    #expect(pending.count == 1)
}
