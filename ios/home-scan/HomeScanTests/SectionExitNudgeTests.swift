import XCTest
@testable import HomeScan

/// 房间感知的状态照下限(2026-07-16 真扫:卧室/卫生间零状态照的修复):
/// 最近邻分区归属(带滞回)+ 离开零状态照分区才催 + 防打扰(待够 15s)。
final class SectionExitNudgeTests: XCTestCase {
    private let bedroom = SectionExitNudge.Section(label: "bedroom", center: SIMD2(0, 0))
    private let living = SectionExitNudge.Section(label: "livingRoom", center: SIMD2(6, 0))

    private func enterBedroom(at now: TimeInterval = 100) -> SectionExitNudge.State? {
        SectionExitNudge.track(
            nil, pos: SIMD2(0.5, 0), sections: [bedroom, living], now: now
        ).state
    }

    func testNudgesWhenLeavingZeroShotRoomAfterDwell() {
        var s = enterBedroom()
        XCTAssertEqual(s?.section.label, "bedroom")
        XCTAssertEqual(s?.photos, 0)
        // 待了 20s、一张没拍,走进客厅腹地 → 催,且新分区计数从零起
        let (next, leaving) = SectionExitNudge.track(
            s, pos: SIMD2(5.5, 0), sections: [bedroom, living], now: 120
        )
        s = next
        XCTAssertEqual(leaving?.label, "bedroom", "离开零状态照的卧室必须催")
        XCTAssertEqual(s?.section.label, "livingRoom")
        XCTAssertEqual(s?.photos, 0)
        XCTAssertEqual(s?.enteredAt, 120, "跨界重新计 dwell")
    }

    func testNoNudgeWhenRoomHasPhotos() {
        var s = enterBedroom()
        s?.photos = 1
        let (next, leaving) = SectionExitNudge.track(
            s, pos: SIMD2(5.5, 0), sections: [bedroom, living], now: 120
        )
        XCTAssertNil(leaving, "这间已有状态照,安静放行")
        XCTAssertEqual(next?.section.label, "livingRoom", "不催不代表不跨界")
    }

    func testNoNudgeOnQuickPassThrough() {
        let s = enterBedroom(at: 100)
        let (_, leaving) = SectionExitNudge.track(
            s, pos: SIMD2(5.5, 0), sections: [bedroom, living], now: 105
        )
        XCTAssertNil(leaving, "路过 5s(<15s)的房间不算漏,不许催 —— 防打扰")
    }

    func testBoundaryHysteresisPreventsFlapping() {
        let s = enterBedroom()
        // 站在边界略偏客厅侧:客厅只近 0.4m(< switchMarginM)→ 不算跨界
        let (next, leaving) = SectionExitNudge.track(
            s, pos: SIMD2(3.2, 0), sections: [bedroom, living], now: 130
        )
        XCTAssertNil(leaving)
        XCTAssertEqual(next?.section.label, "bedroom", "滞回:边界抖动不换归属")
    }

    func testCenterRefinementKeepsDwellAndPhotos() {
        let s = enterBedroom(at: 100)
        // RoomPlan 精化把卧室中心挪了 0.6m:仍是同一间,dwell 不重置
        let refined = SectionExitNudge.Section(label: "bedroom", center: SIMD2(0.5, 0.3))
        let (next, leaving) = SectionExitNudge.track(
            s, pos: SIMD2(0.6, 0.2), sections: [refined, living], now: 110
        )
        XCTAssertNil(leaving)
        XCTAssertEqual(next?.enteredAt, 100, "中心精化不算换房,enteredAt 保持")
        XCTAssertEqual(next?.section.center, refined.center, "但要跟上最新中心")
    }

    func testEmptySectionsKeepsState() {
        let s = enterBedroom()
        let (next, leaving) = SectionExitNudge.track(
            s, pos: SIMD2(5.5, 0), sections: [], now: 200
        )
        XCTAssertNil(leaving)
        XCTAssertEqual(next, s, "RoomPlan 还没给分区时原样保持,不判定")
        let (fresh, _) = SectionExitNudge.track(nil, pos: SIMD2(0, 0), sections: [], now: 0)
        XCTAssertNil(fresh)
    }

    func testNoDoubleNudgeWithoutRedwell() {
        var s = enterBedroom(at: 100)
        // 第一次离开 → 催
        var out = SectionExitNudge.track(s, pos: SIMD2(5.5, 0), sections: [bedroom, living], now: 120)
        XCTAssertNotNil(out.leavingZeroShot)
        s = out.state
        // 5s 后又折回卧室再出来:客厅 dwell 只有几秒,不再催(不轰炸)
        out = SectionExitNudge.track(s, pos: SIMD2(0.5, 0), sections: [bedroom, living], now: 125)
        XCTAssertNil(out.leavingZeroShot, "客厅只待了 5s 就折返,不催客厅")
        s = out.state
        out = SectionExitNudge.track(s, pos: SIMD2(5.5, 0), sections: [bedroom, living], now: 130)
        XCTAssertNil(out.leavingZeroShot, "卧室这趟也只待了 5s,同样不催")
    }
}
