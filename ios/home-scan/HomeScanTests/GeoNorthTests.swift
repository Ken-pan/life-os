import XCTest
@testable import HomeScan

/// 平面图北向换算的方向锁:罗盘偏移 + 投影旋转 → planNorthDeg。
/// 和 PlanProjectorTests 锁手性同一个道理 —— 这里错一个符号,
/// 网页端阳光模拟的光就从错的窗户进来,而且没人能一眼看出来。
final class GeoNorthTests: XCTestCase {
    /// 投影不转(phi=0)、场景系已对准真北:平面图上方就是北
    func testIdentity() {
        XCTAssertEqual(PlanProjector.planNorthDeg(offsetDeg: 0, phi: 0), 0, accuracy: 0.01)
    }

    /// 场景系偏东 90°(offset=90):平面图上方指东
    func testOffsetOnly() {
        XCTAssertEqual(PlanProjector.planNorthDeg(offsetDeg: 90, phi: 0), 90, accuracy: 0.01)
    }

    /// 投影把场景顺时针转 90°(phi=+π/2,y 向下坐标系):
    /// 平面图上方对应场景系的「左」,即场景 yaw 270°
    func testPhiOnly() {
        XCTAssertEqual(
            PlanProjector.planNorthDeg(offsetDeg: 0, phi: .pi / 2), 270, accuracy: 0.01)
    }

    /// 偏移与旋转叠加,并回卷进 [0,360)
    func testCombinedWraps() {
        XCTAssertEqual(
            PlanProjector.planNorthDeg(offsetDeg: 350, phi: .pi), 170, accuracy: 0.01)
    }

    /// GeoContext 的圆均值口径:359° 与 1° 平均是 0°,不是 180°
    func testNormalizeDeg() {
        XCTAssertEqual(GeoContext.normalizeDeg(-90), 270, accuracy: 0.01)
        XCTAssertEqual(GeoContext.normalizeDeg(725), 5, accuracy: 0.01)
    }
}
