import XCTest
@testable import HomeScan

/// 转换器单测。Phase 2-4 落地 StructureFlattener/PlanProjector 后,
/// 这里用 L 形非对称 fixture 锁死坐标手性与 heading 零点。
final class PlanProjectorTests: XCTestCase {
    func testScaffoldCompiles() {
        XCTAssertEqual(Config.payloadFormatVersion, 1)
    }
}
