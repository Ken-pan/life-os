import XCTest
@testable import KenosIOS

final class KorbenOrbGestureResolverTests: XCTestCase {
    func testDirectionLockRequiresDistance() {
        XCTAssertNil(KorbenOrbGestureResolver.lockedDirection(translation: .init(width: 10, height: -10)))
    }

    func testSwipeUpWithinTolerance() {
        // 正上方 ±25°
        XCTAssertEqual(
            KorbenOrbGestureResolver.lockedDirection(translation: .init(width: 5, height: -30)),
            .swipeUp
        )
        // 60° 斜向(超出上方与右方容差)→ 不锁定
        XCTAssertNil(
            KorbenOrbGestureResolver.lockedDirection(translation: .init(width: 20, height: -20))
        )
    }

    func testDragRightWithinTolerance() {
        XCTAssertEqual(
            KorbenOrbGestureResolver.lockedDirection(translation: .init(width: 30, height: 5)),
            .dragRight
        )
        // 向左不属于任何手势
        XCTAssertNil(
            KorbenOrbGestureResolver.lockedDirection(translation: .init(width: -30, height: 0))
        )
    }

    func testFanHitPicksNearestWithinRadius() {
        let targets = [CGPoint(x: 0, y: 0), CGPoint(x: 100, y: 0)]
        XCTAssertEqual(
            KorbenOrbGestureResolver.fanTargetIndex(at: .init(x: 95, y: 5), targets: targets), 1
        )
        XCTAssertNil(
            KorbenOrbGestureResolver.fanTargetIndex(at: .init(x: 50, y: 200), targets: targets)
        )
    }

    func testFanCentersSpacing() {
        let centers = KorbenOrbGestureResolver.fanCenters(
            orbCenter: .init(x: 46, y: 800), count: 4
        )
        XCTAssertEqual(centers.count, 4)
        // 相邻目标间距 ≥ 12pt(规范)
        for i in 1..<centers.count {
            let d = hypot(centers[i].x - centers[i-1].x, centers[i].y - centers[i-1].y)
            XCTAssertGreaterThanOrEqual(d, 12)
        }
        // 全部在 Orb 上方/右侧弧线
        for c in centers { XCTAssertLessThanOrEqual(c.y, 800) }
    }
}
