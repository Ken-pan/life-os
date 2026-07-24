import XCTest
@testable import KenosIOS

/// Gate5D:夹具本身也要有护栏 —— 它能让 Strip 显示"不存在的事",
/// 所以「生产构建永不激活」这条必须被锁死,而不是靠记得。
final class KorbenStripFixtureTests: XCTestCase {
    func testProductionBuildNeverActivates() {
        XCTAssertNil(
            KorbenStripFixture.resolve(
                isDevelopmentBuild: false,
                arguments: ["-korbenStripFixture", "both"]
            )
        )
    }

    func testDevelopmentBuildResolvesMode() {
        XCTAssertEqual(
            KorbenStripFixture.resolve(
                isDevelopmentBuild: true,
                arguments: ["-korbenStripFixture", "attention"]
            ),
            .attention
        )
    }

    func testUnknownModeIsIgnored() {
        XCTAssertNil(
            KorbenStripFixture.resolve(
                isDevelopmentBuild: true,
                arguments: ["-korbenStripFixture", "banana"]
            )
        )
    }

    /// 参数在末尾、没跟值 —— 不能越界崩溃。
    func testDanglingArgumentDoesNotCrash() {
        XCTAssertNil(
            KorbenStripFixture.resolve(
                isDevelopmentBuild: true,
                arguments: ["-korbenStripFixture"]
            )
        )
    }

    func testNoArgumentMeansNoFixture() {
        XCTAssertNil(
            KorbenStripFixture.resolve(isDevelopmentBuild: true, arguments: ["-korbenShellV2"])
        )
    }

    /// `both` 的意义在于验规范优先级:Attention 必须排在 Runtime 之前,且截断到 3。
    func testBothModeProducesAttentionFirstAndThreeUnits() {
        let f = KorbenStripFixture.stripInputs(for: .both)
        let units = KorbenStripModel.units(
            attentionCount: f.attentionCount,
            primaryRuntimeTitle: f.primaryRuntimeTitle,
            activeRuntimeCount: f.activeRuntimeCount
        )
        XCTAssertEqual(units.count, 3)
        guard case .attention = units[0] else {
            return XCTFail("Attention 必须排在最前(规范 P0/P1 高于 Runtime P2)")
        }
        guard case .runtime = units[1] else { return XCTFail("第二位应为主 Runtime") }
        guard case .secondaryRuntimes = units[2] else { return XCTFail("第三位应为次要 Runtime 计数") }
    }

    func testAttentionOnlyModeHasNoRuntimeUnit() {
        let f = KorbenStripFixture.stripInputs(for: .attention)
        let units = KorbenStripModel.units(
            attentionCount: f.attentionCount,
            primaryRuntimeTitle: f.primaryRuntimeTitle,
            activeRuntimeCount: f.activeRuntimeCount
        )
        XCTAssertEqual(units.count, 1)
        guard case .attention(let n) = units[0] else { return XCTFail("应只有 Attention") }
        XCTAssertEqual(n, 2)
    }
}
