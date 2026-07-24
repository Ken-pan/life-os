import XCTest
@testable import KenosIOS

#if os(iOS)

final class KorbenDomainSurfacePoolTests: XCTestCase {
    private typealias Pool = KorbenDomainSurfacePool
    private typealias Resident = KorbenDomainSurfacePool.Resident

    private func url(_ s: String) -> URL { URL(string: "https://\(s).kenos.space/")! }
    private func res(_ id: String) -> Resident { Resident(spaceId: id, url: url(id)) }

    /// 空池进入一个 Space → 成为唯一常驻,无淘汰。
    func testTouchIntoEmpty() {
        let r = Pool.touch([], spaceId: "plan", url: url("plan"))
        XCTAssertEqual(r.residents.map(\.spaceId), ["plan"])
        XCTAssertTrue(r.evicted.isEmpty)
    }

    /// 新 Space 置于最近端(index 0),旧的顺延。
    func testMostRecentFirst() {
        var pool: [Resident] = []
        pool = Pool.touch(pool, spaceId: "plan", url: url("plan")).residents
        pool = Pool.touch(pool, spaceId: "money", url: url("money")).residents
        XCTAssertEqual(pool.map(\.spaceId), ["money", "plan"])
    }

    /// 切回已常驻的 Space:移到最近端、**保留原 url**(维持"切回不重载"语义),不淘汰。
    func testReTouchReusesOriginalUrlAndDedups() {
        var pool = [res("plan")]
        // 用一个"不同 path"的 url 再次 touch plan —— 池里 plan 的 url 必须不变。
        let differentUrl = URL(string: "https://plan.kenos.space/today")!
        let r = Pool.touch(pool, spaceId: "plan", url: differentUrl)
        pool = r.residents
        XCTAssertEqual(pool.count, 1, "同 space 去重,不新增")
        XCTAssertEqual(pool.first?.url, url("plan"), "切回复用原 url,绝不用新 url 触发 hardLoad")
        XCTAssertTrue(r.evicted.isEmpty)
    }

    /// 超容量:淘汰最久未用(末端),返回被淘汰 id。
    func testLRUEvictionAtCapacity() {
        var pool: [Resident] = []
        for id in ["a", "b", "c"] { pool = Pool.touch(pool, spaceId: id, url: url(id), capacity: 3).residents }
        XCTAssertEqual(pool.map(\.spaceId), ["c", "b", "a"])
        // 第 4 个进来 → 淘汰最久的 "a"
        let r = Pool.touch(pool, spaceId: "d", url: url("d"), capacity: 3)
        XCTAssertEqual(r.residents.map(\.spaceId), ["d", "c", "b"])
        XCTAssertEqual(r.evicted, ["a"])
    }

    /// 切回一个"次久"的 Space 会刷新它的最近度,改变下次淘汰对象。
    func testReTouchProtectsFromEviction() {
        var pool: [Resident] = []
        for id in ["a", "b", "c"] { pool = Pool.touch(pool, spaceId: id, url: url(id), capacity: 3).residents }
        // 现顺序 c,b,a → 切回 a(最久)→ a 变最近
        pool = Pool.touch(pool, spaceId: "a", url: url("a"), capacity: 3).residents
        XCTAssertEqual(pool.map(\.spaceId), ["a", "c", "b"])
        // 新 d 进来 → 淘汰的应是现在最久的 "b" 而非 "a"
        let r = Pool.touch(pool, spaceId: "d", url: url("d"), capacity: 3)
        XCTAssertEqual(r.evicted, ["b"])
    }

    /// capacity=1 退化成旧的单 WebView 行为(每次进新 Space 淘汰上一个)。
    func testCapacityOneDegradesToSingle() {
        var pool = Pool.touch([], spaceId: "plan", url: url("plan"), capacity: 1).residents
        let r = Pool.touch(pool, spaceId: "money", url: url("money"), capacity: 1)
        XCTAssertEqual(r.residents.map(\.spaceId), ["money"])
        XCTAssertEqual(r.evicted, ["plan"])
    }

    /// 内存告警:收缩到只留活跃 Space,其余全淘汰。
    func testShrinkToActive() {
        var pool: [Resident] = []
        for id in ["a", "b", "c"] { pool = Pool.touch(pool, spaceId: id, url: url(id)).residents }
        let r = Pool.shrinkToActive(pool, activeSpaceId: "b")
        XCTAssertEqual(r.residents.map(\.spaceId), ["b"])
        XCTAssertEqual(Set(r.evicted), Set(["a", "c"]))
    }

    /// 活跃项不在池中(异常)→ 全清,避免留下幽灵 WebView。
    func testShrinkWithUnknownActiveClearsAll() {
        let pool = [res("a"), res("b")]
        let r = Pool.shrinkToActive(pool, activeSpaceId: "zzz")
        XCTAssertTrue(r.residents.isEmpty)
        XCTAssertEqual(Set(r.evicted), Set(["a", "b"]))
    }

    func testRemoveAndContains() {
        let pool = [res("a"), res("b")]
        XCTAssertTrue(Pool.contains(pool, spaceId: "a"))
        XCTAssertFalse(Pool.contains(Pool.remove(pool, spaceId: "a"), spaceId: "a"))
    }
}

#endif
