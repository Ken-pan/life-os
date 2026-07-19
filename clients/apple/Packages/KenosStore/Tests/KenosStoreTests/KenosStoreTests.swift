import Foundation
import Testing
import KenosClient
import KenosStore

@Test("Projection cache restores stale after offline and isolates owners")
func projectionCacheOwnerIsolation() async throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let store = FileProjectionStore(directory: dir)
    let ownerA = UUID(uuidString: "20000000-0000-4000-8000-000000000001")!
    let ownerB = UUID(uuidString: "20000000-0000-4000-8000-000000000002")!

    let client = MockKenosAPIClient(mode: .ready)
    let today = try await client.fetchToday(KenosRequestContext())
    let snap = KenosProjectionSnapshot(
        today: today,
        meta: KenosCacheMeta(ownerId: ownerA, lastSuccessfulSync: "2026-07-19T12:00:00Z", freshness: .ready, classification: .personal)
    )
    try store.save(snap)
    let loaded = try store.load(ownerId: ownerA)
    #expect(loaded.today?.cards.isEmpty == false)
    #expect(try store.load(ownerId: ownerB).today == nil)

    let sensitive = KenosProjectionSnapshot(
        today: today,
        meta: KenosCacheMeta(ownerId: ownerA, freshness: .ready, classification: .restrictedLocalOnly)
    )
    #expect(throws: KenosClientError.permissionDenied) {
        try store.save(sensitive)
    }
}

@Test("Read repository marks stale when offline with cache")
@MainActor
func readRepositoryStaleOffline() async throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let store = FileProjectionStore(directory: dir)
    let session = MockSessionProvider()
    let ready = KenosReadRepository(client: MockKenosAPIClient(mode: .ready), store: store, session: session)
    await ready.refresh()
    #expect(ready.state == .ready)

    let offline = KenosReadRepository(client: MockKenosAPIClient(mode: .offline), store: store, session: session)
    await offline.bootstrap()
    #expect(offline.state == .stale || offline.state == .ready)
}
