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
