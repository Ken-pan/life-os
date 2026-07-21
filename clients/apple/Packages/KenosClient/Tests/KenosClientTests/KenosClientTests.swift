import Foundation
import Testing
import KenosClient
import KenosContracts

@Test("Deep link router covers Phase 4A routes and fails closed on malformed IDs")
func deepLinkCoverage() {
    #expect(KenosDeepLinkRouter.parse("kenos://today") == .today)
    #expect(KenosDeepLinkRouter.parse("kenos://assistant") == .assistant)
    #expect(KenosDeepLinkRouter.parse("kenos://inbox") == .inbox)
    #expect(KenosDeepLinkRouter.parse("kenos://approvals") == .approvals)
    #expect(KenosDeepLinkRouter.parse("kenos://activity") == .activity)
    #expect(KenosDeepLinkRouter.parse("kenos://work") == .work)
    #expect(KenosDeepLinkRouter.parse("kenos://capture") == .capture)
    #expect(KenosDeepLinkRouter.parse("kenos://system") == .system)

    let projectId = UUID(uuidString: "a1000000-0000-4000-8000-000000000001")!
    #expect(KenosDeepLinkRouter.parse("kenos://work/project/\(projectId.uuidString)") == .workProject(projectId))
    #expect(KenosDeepLinkRouter.parse("kenos://deliverable/not-a-uuid") == .unknown("kenos://deliverable/not-a-uuid"))
    #expect(KenosDeepLinkRouter.parse("https://example.com") == .unknown("https://example.com"))

    for route in KenosDeepLinkRouter.coveredRoutes {
        let parsed = KenosDeepLinkRouter.parse(route)
        if case .unknown = parsed {
            Issue.record("covered route parsed unknown: \(route)")
        }
    }
}

@Test("Mock client loads shared contract fixtures")
func mockClientReadyPath() async throws {
    let client = MockKenosAPIClient(mode: .ready)
    let today = try await client.fetchToday(KenosRequestContext())
    #expect(!today.cards.isEmpty)
    let approvals = try await client.fetchApprovals(KenosRequestContext())
    #expect(approvals.count == 1)
    try approvals[0].validate()
    let work = try await client.fetchWork(KenosRequestContext())
    try work.projects[0].validate()
    #expect(!work.library.isEmpty)
}

@Test("Error mapper distinguishes stale vs unavailable")
func errorMapperFreshness() {
    #expect(KenosErrorMapper.displayStatus(for: .offline, hasCache: true) == "stale")
    #expect(KenosErrorMapper.displayStatus(for: .offline, hasCache: false) == "unavailable")
    #expect(KenosErrorMapper.displayStatus(for: .unauthorized, hasCache: true) == "session_expired")
    #expect(KenosErrorMapper.retryClass(for: .timeout) == .transient)
    #expect(KenosErrorMapper.retryClass(for: .malformedPayload) == .permanent)
}

@Test("Keychain session store never uses UserDefaults")
func keychainSessionBoundary() throws {
    let secure = InMemorySecureStore()
    let store = KenosKeychainSessionStore(secureStore: secure)
    let owner = UUID(uuidString: "20000000-0000-4000-8000-000000000001")!
    try store.save(token: "mock-token", ownerId: owner)
    #expect(try store.loadToken() == "mock-token")
    #expect(try store.loadOwnerId() == owner)
    #expect(UserDefaults.standard.object(forKey: KenosKeychainSessionStore.tokenAccount) == nil)
    try store.clear()
    #expect(try store.loadToken() == nil)
}

@Test("Mock session expires fail closed")
func mockSessionExpired() async throws {
    let session = MockSessionProvider()
    await session.markExpired()
    await #expect(throws: KenosClientError.unauthorized) {
        _ = try await session.accessToken()
    }
}

@Test("Focus store seeds deferred Work/Money/Home and R0 suggestions")
@MainActor
func focusStoreTrainingSeed() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("kenos-focus-test-\(UUID().uuidString)")
    let store = KenosFocusStore(directory: dir)
    store.startTrainingFocus()
    #expect(store.focus?.mode == .training)
    #expect(store.hidesGlobalNavigation)
    #expect(store.deferred.filter { $0.status == .pending }.count >= 2)
    let domains = Set(store.deferred.map(\.sourceDomain))
    #expect(domains.contains(.work))
    #expect(domains.contains(.money))
    #expect(domains.contains(.home))
    #expect(store.suggestions.contains { $0.risk == .r0 && $0.status == .shown })
    #expect(store.budget.shownNonUrgentCount <= store.budget.maxSuggestionsPerSession)
    store.end()
    #expect(store.focus?.status == .completed)
    #expect(store.summary != nil)
    store.logoutClear()
    #expect(store.focus == nil)
    try? FileManager.default.removeItem(at: dir)
}

@Test("Space switcher store persists recent, pinned, and ResumeDescriptor")
@MainActor
func spaceSwitcherPersistence() throws {
    let ownerA = UUID(uuidString: "20000000-0000-4000-8000-000000000001")!
    let ownerB = UUID(uuidString: "30000000-0000-4000-8000-000000000002")!
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("kenos-space-switcher-\(UUID().uuidString)")

    let store = KenosSpaceSwitcherStore(ownerId: ownerA, directory: dir)
    store.touchRecentSpace(id: "hosted:work")
    store.touchRecentSpace(id: "hosted:plan")
    store.touchRecentSpace(id: "hosted:work")
    store.togglePinnedSpace(id: "hosted:training")
    store.togglePinnedSpace(id: "hosted:money")
    store.rememberResume(
        .init(
            userId: ownerA.uuidString.lowercased(),
            spaceId: "plan",
            route: "https://planner.kenos.space/upcoming?kenosTask=t1&kenosFilter=overdue",
            entityId: "t1",
            substate: ["filter": "overdue"],
            displayTitle: "Plan",
            displaySubtitle: "Upcoming · Overdue"
        ),
        listKey: "hosted:plan"
    )
    #expect(store.recentSpaceIds.first == "hosted:plan")
    #expect(store.pinnedSpaceIds == ["hosted:training", "hosted:money"])
    #expect(store.resumeByListKey["hosted:plan"]?.entityId == "t1")

    let restored = KenosSpaceSwitcherStore(ownerId: ownerA, directory: dir)
    #expect(restored.recentSpaceIds.contains("hosted:plan"))
    #expect(restored.resumeByListKey["hosted:plan"]?.displaySubtitle == "Upcoming · Overdue")

    for index in 0..<8 {
        restored.touchRecentSpace(id: "space-\(index)")
    }
    #expect(restored.recentSpaceIds.count == KenosSpaceSwitcherStore.maxRecent)

    restored.togglePinnedSpace(id: "hosted:training")
    #expect(restored.pinnedSpaceIds == ["hosted:money"])

    restored.bindOwner(ownerB)
    #expect(restored.ownerId == ownerB)
    #expect(restored.recentSpaceIds.isEmpty)
    #expect(restored.pinnedSpaceIds.isEmpty)
    #expect(restored.resumeByListKey.isEmpty)

    restored.logoutClear()
    #expect(restored.recentSpaceIds.isEmpty)
    #expect(restored.pinnedSpaceIds.isEmpty)
    #expect(restored.ownerId == KenosSpaceSwitcherStore.defaultOwnerId)

    try? FileManager.default.removeItem(at: dir)
}

@Test("App Group store falls back when suite missing")
func appGroupFallbackIsolatesOwners() {
    let ownerA = UUID()
    let ownerB = UUID()
    let storeA = KenosAppGroupStore(
        ownerId: ownerA,
        suiteFactory: { _ in nil }
    )
    let storeB = KenosAppGroupStore(
        ownerId: ownerB,
        suiteFactory: { _ in nil }
    )
    #expect(storeA.availability == .processLocalFallback)
    #expect(storeA.statusReport["phase4"] == "EXIT_OPEN")
    storeA.setString("plan-resume", forKey: "continuity.scratch")
    #expect(storeA.string(forKey: "continuity.scratch") == "plan-resume")
    #expect(storeB.string(forKey: "continuity.scratch") == nil)
}

@Test("App Group store uses shared suite when factory provides one")
func appGroupSharedSuitePath() {
    let bag = KenosInMemorySharedDefaults()
    let store = KenosAppGroupStore(
        ownerId: UUID(),
        suiteFactory: { _ in bag }
    )
    #expect(store.availability == .sharedSuite)
    store.setString("set-2", forKey: "training.nextSet")
    #expect(store.string(forKey: "training.nextSet") == "set-2")
    store.clear(key: "training.nextSet")
    #expect(store.string(forKey: "training.nextSet") == nil)
}

@Test("Widget glance bridge encodes and loads via App Group store")
func widgetGlanceBridgeRoundTrip() {
    let store = KenosAppGroupStore(ownerId: UUID(), suiteFactory: { _ in nil })
    let glance = TodayGlance(
        nextPlanTitle: "Plan reminder",
        nextPlanDeepLink: "kenos://today",
        pendingApprovalCount: 1,
        freshness: "local",
        offlineStatus: "online",
        state: "ready"
    )
    KenosWidgetGlanceBridge.publish(glance, store: store)
    let loaded = KenosWidgetGlanceBridge.load(store: store)
    #expect(loaded?.nextPlanTitle == "Plan reminder")
    #expect(loaded?.pendingApprovalCount == 1)
    #expect(loaded?.state == "ready")
    #expect(loaded?.nextPlanDeepLink == "kenos://today")
}

@Test("Widget snapshot round-trips via shared App Group keys")
func widgetSnapshotRoundTrip() {
    let bag = KenosInMemorySharedDefaults()
    let host = KenosAppGroupStore(ownerId: UUID(), suiteFactory: { _ in bag })
    let widget = KenosAppGroupStore(ownerId: nil, suiteFactory: { _ in bag })
    let today = TodayGlance(
        nextPlanTitle: "Review",
        nextPlanDeepLink: "kenos://domain/plan",
        pendingApprovalCount: 2,
        freshness: "local",
        offlineStatus: "online",
        state: "ready"
    )
    let plan = DomainWidgetGlance(
        domainId: "plan",
        title: "Review",
        subtitle: "Next up",
        deepLink: "kenos://domain/plan",
        accentRGB: 0xC9A227,
        systemImage: "checklist"
    )
    let health = DomainWidgetGlance(
        domainId: "health",
        title: "Ready",
        subtitle: "Focus · high",
        deepLink: "kenos://domain/health",
        accentRGB: 0x5B6CFF,
        systemImage: "heart.text.square",
        badge: "H"
    )
    // Money must never carry amounts — only Open label.
    let money = DomainWidgetGlance(
        domainId: "money",
        title: "Money",
        subtitle: "Open Money",
        deepLink: "kenos://domain/money",
        accentRGB: 0x3D9B6E,
        systemImage: "dollarsign.circle"
    )
    let snapshot = KenosWidgetSnapshot(
        today: today,
        domains: ["plan": plan, "health": health, "money": money],
        recentDomainIds: ["plan", "training"]
    )
    KenosWidgetGlanceBridge.publishSnapshot(snapshot, store: host)
    let loaded = KenosWidgetGlanceBridge.loadSnapshot(store: widget)
    #expect(loaded?.today.nextPlanTitle == "Review")
    #expect(loaded?.domain("plan")?.title == "Review")
    #expect(loaded?.domain("health")?.subtitle == "Focus · high")
    #expect(loaded?.domain("money")?.subtitle == "Open Money")
    #expect(loaded?.domain("money")?.subtitle.contains("$") != true)
    #expect(loaded?.recentDomainIds == ["plan", "training"])
}

@Test("Widget snapshot falls back to legacy TodayGlance")
func widgetSnapshotLegacyFallback() {
    let store = KenosAppGroupStore(ownerId: UUID(), suiteFactory: { _ in nil })
    let glance = TodayGlance(
        nextPlanTitle: "Legacy",
        freshness: "local",
        offlineStatus: "online",
        state: "ready"
    )
    KenosWidgetGlanceBridge.publish(glance, store: store)
    let loaded = KenosWidgetGlanceBridge.loadSnapshot(store: store)
    #expect(loaded?.today.nextPlanTitle == "Legacy")
    #expect(loaded?.domains.isEmpty == true)
}

@Test("Widget pending deep link posts and consumes via shared keys")
func widgetPendingDeepLinkRelay() {
    let bag = KenosInMemorySharedDefaults()
    let widget = KenosAppGroupStore(ownerId: nil, suiteFactory: { _ in bag })
    let host = KenosAppGroupStore(ownerId: UUID(), suiteFactory: { _ in bag })
    KenosWidgetGlanceBridge.postPendingDeepLink("kenos://training/session", store: widget)
    #expect(KenosWidgetGlanceBridge.consumePendingDeepLink(store: host) == "kenos://training/session")
    #expect(KenosWidgetGlanceBridge.consumePendingDeepLink(store: host) == nil)
}

@Test("Widget snapshot contentEquals ignores publishedAt and updatedAt")
func widgetSnapshotContentEqualsIgnoresTimestamps() {
    let today = TodayGlance(
        nextPlanTitle: "Review",
        freshness: "local",
        offlineStatus: "online",
        state: "ready"
    )
    var aPlan = DomainWidgetGlance(
        domainId: "plan",
        title: "Review",
        subtitle: "Next up",
        deepLink: "kenos://domain/plan",
        accentRGB: 0xC9A227,
        systemImage: "checklist",
        updatedAt: "2026-01-01T00:00:00Z"
    )
    var bPlan = aPlan
    bPlan.updatedAt = "2026-01-02T00:00:00Z"
    let a = KenosWidgetSnapshot(today: today, domains: ["plan": aPlan], recentDomainIds: ["plan"], publishedAt: "a")
    let b = KenosWidgetSnapshot(today: today, domains: ["plan": bPlan], recentDomainIds: ["plan"], publishedAt: "b")
    #expect(a.contentEquals(b))
    var cPlan = aPlan
    cPlan.title = "Different"
    let c = KenosWidgetSnapshot(today: today, domains: ["plan": cPlan], recentDomainIds: ["plan"])
    #expect(!a.contentEquals(c))
}

@Test("publishSnapshotIfChanged skips identical content")
func widgetPublishIfChangedSkipsDuplicate() {
    let bag = KenosInMemorySharedDefaults()
    let store = KenosAppGroupStore(ownerId: nil, suiteFactory: { _ in bag })
    let today = TodayGlance(
        nextPlanTitle: "Review",
        freshness: "local",
        offlineStatus: "online",
        state: "ready"
    )
    let first = KenosWidgetSnapshot(today: today, domains: [:], recentDomainIds: ["plan"])
    #expect(KenosWidgetGlanceBridge.publishSnapshotIfChanged(first, store: store, previous: nil))
    let second = KenosWidgetSnapshot(today: today, domains: [:], recentDomainIds: ["plan"], publishedAt: "later")
    #expect(!KenosWidgetGlanceBridge.publishSnapshotIfChanged(second, store: store, previous: first))
    var changedToday = today
    changedToday.nextPlanTitle = "Ship"
    let third = KenosWidgetSnapshot(today: changedToday, domains: [:], recentDomainIds: ["plan"])
    #expect(KenosWidgetGlanceBridge.publishSnapshotIfChanged(third, store: store, previous: first))
}

@Test("App Group shared strings are not owner-scoped")
func appGroupSharedStringsCrossOwner() {
    let bag = KenosInMemorySharedDefaults()
    let a = KenosAppGroupStore(ownerId: UUID(), suiteFactory: { _ in bag })
    let b = KenosAppGroupStore(ownerId: UUID(), suiteFactory: { _ in bag })
    a.setSharedString("hello", forKey: "widget.test")
    #expect(b.sharedString(forKey: "widget.test") == "hello")
    a.setString("private", forKey: "widget.test")
    #expect(b.string(forKey: "widget.test") == nil)
}

@Test("Runtime health snapshot round-trips without secrets")
func runtimeHealthRoundTrip() {
    let store = KenosAppGroupStore(ownerId: UUID(), suiteFactory: { _ in nil })
    let snap = KenosRuntimeHealthSnapshot(
        buildSha: "abc1234",
        originHost: "10.20.202.15:5219",
        originReachable: true,
        authState: "signed_in",
        continueDescriptorCount: 2
    )
    KenosRuntimeHealth.save(snap, store: store)
    let loaded = KenosRuntimeHealth.load(store: store)
    #expect(loaded?.buildSha == "abc1234")
    #expect(loaded?.originHost == "10.20.202.15:5219")
    #expect(loaded?.authState == "signed_in")
    #expect(loaded?.phase4 == "EXIT_OPEN")
    #expect(KenosRuntimeHealth.host(from: URL(string: "http://10.20.202.15:5219/assistant?x=1")!) == "10.20.202.15:5219")
}

