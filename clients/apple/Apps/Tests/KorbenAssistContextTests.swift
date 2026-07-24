import XCTest
@testable import KenosIOS

/// Gate5C-2:Assist 的「当前位置」必须由路由推导,而不是永远只说 Space 名。
final class KorbenAssistContextTests: XCTestCase {
    private let items: [(title: String, path: String)] = [
        ("Home", "/"),
        ("Accounts", "/home/accounts"),
        ("Budget", "/budget"),
    ]

    func testExactPathMatchesSection() {
        XCTAssertEqual(KorbenAssistContext.matchSection(path: "/budget", items: items), 2)
    }

    /// 二级页必须仍归属它所在的区 —— 否则一进详情页 Assist 就"失忆"。
    func testNestedPathKeepsParentSection() {
        XCTAssertEqual(
            KorbenAssistContext.matchSection(path: "/home/accounts/detail/42", items: items),
            1
        )
    }

    /// 根路径不能吃掉所有路由:`/budget` 同时前缀匹配不到 `/`,但如果实现写成
    /// `hasPrefix("/")` 就会全部落到 Home。这条锁的就是那个退化。
    func testRootDoesNotSwallowLongerPaths() {
        XCTAssertEqual(KorbenAssistContext.matchSection(path: "/home/accounts", items: items), 1)
        XCTAssertEqual(KorbenAssistContext.matchSection(path: "/", items: items), 0)
    }

    /// 匹配不上时退回根区(而不是 nil 导致面板无位置可说)。
    func testUnknownPathFallsBackToRoot() {
        XCTAssertEqual(KorbenAssistContext.matchSection(path: "/nope", items: items), 0)
    }

    /// 没有根区时,匹配不上就诚实地返回 nil —— 宁可不说,也不猜。
    func testUnknownPathWithoutRootReturnsNil() {
        let noRoot = [("Accounts", "/home/accounts"), ("Budget", "/budget")]
        XCTAssertNil(KorbenAssistContext.matchSection(path: "/nope", items: noRoot))
    }

    func testSiblingSectionsExcludeCurrentAndCapAtTwo() {
        let ctx = KorbenAssistContext.make(
            spaceLabel: "Finance",
            path: "/budget",
            items: items,
            runtimeTitle: nil,
            pendingApprovals: 0
        )
        XCTAssertEqual(ctx.sectionLabel, "Budget")
        XCTAssertEqual(ctx.siblingSections.map(\.title), ["Home", "Accounts"])
        XCTAssertFalse(ctx.siblingSections.contains { $0.title == "Budget" })
    }

    /// 位置行是面板"不再通用"的可见证据:有区就说到区。
    func testLocationLineIncludesSection() {
        let ctx = KorbenAssistContext.make(
            spaceLabel: "Finance",
            path: "/home/accounts",
            items: items,
            runtimeTitle: nil,
            pendingApprovals: 0
        )
        XCTAssertEqual(ctx.locationLine(chinese: true), "当前:Finance · Accounts")
        XCTAssertEqual(ctx.locationLine(chinese: false), "In Finance · Accounts")
    }

    func testLocationLineFallsBackToSpaceOnlyWithoutSections() {
        let ctx = KorbenAssistContext.make(
            spaceLabel: "Today",
            path: "/",
            items: [],
            runtimeTitle: nil,
            pendingApprovals: 0
        )
        XCTAssertNil(ctx.sectionLabel)
        XCTAssertEqual(ctx.locationLine(chinese: true), "当前空间:Today")
    }
}
