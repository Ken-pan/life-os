import XCTest
@testable import KenosIOS

final class KorbenStripModelTests: XCTestCase {
    private func units(_ a: Int, _ t: String?, _ n: Int) -> [KorbenStripModel.Unit] {
        KorbenStripModel.units(attentionCount: a, primaryRuntimeTitle: t, activeRuntimeCount: n)
    }

    /// 规范核心语义:Attention 优先于 Runtime
    /// (「Korben 等待确认 · 2 项」排在「♪ Daily Mix」之前)。
    func testAttentionOutranksRuntime() {
        let u = units(2, "Daily Mix", 1)
        XCTAssertEqual(u.first, .attention(count: 2))
        XCTAssertEqual(u.dropFirst().first, .runtime(title: "Daily Mix"))
    }

    /// 无状态 → 无单元 → Strip 整条隐藏(不占位)。
    func testEmptyWhenNothingRunning() {
        XCTAssertTrue(units(0, nil, 0).isEmpty)
        XCTAssertFalse(KorbenStripModel.hasContent(attentionCount: 0, primaryRuntimeTitle: nil, activeRuntimeCount: 0))
    }

    /// 只有 runtime 时不渲染 attention 单元。
    func testRuntimeOnly() {
        XCTAssertEqual(units(0, "深度专注", 1), [.runtime(title: "深度专注")])
    }

    /// 只有待确认时不渲染 runtime 单元。
    func testAttentionOnly() {
        XCTAssertEqual(units(3, nil, 0), [.attention(count: 3)])
    }

    /// 多 Runtime:主 runtime 之外的条数进「次要」单元。
    func testSecondaryRuntimeCount() {
        let u = units(0, "深度专注", 3)
        XCTAssertEqual(u, [.runtime(title: "深度专注"), .secondaryRuntimes(count: 2)])
    }

    /// 次要单元不能在没有主 runtime 时冒出来。
    func testNoSecondaryWithoutPrimary() {
        XCTAssertEqual(units(0, nil, 3), [])
    }

    /// 单个 runtime 不产生「次要」单元。
    func testSingleRuntimeHasNoSecondary() {
        XCTAssertEqual(units(0, "Daily Mix", 1), [.runtime(title: "Daily Mix")])
    }

    /// 硬上限 3 个单元(规范)。
    func testCapsAtThreeUnits() {
        let u = units(5, "深度专注", 4)
        XCTAssertEqual(u.count, 3)
        XCTAssertEqual(u[0], .attention(count: 5))
        XCTAssertEqual(u[1], .runtime(title: "深度专注"))
        XCTAssertEqual(u[2], .secondaryRuntimes(count: 3))
    }

    /// 空标题按「无 runtime」处理,不产生空胶囊。
    func testEmptyTitleTreatedAsNoRuntime() {
        XCTAssertEqual(units(1, "", 1), [.attention(count: 1)])
    }
}
