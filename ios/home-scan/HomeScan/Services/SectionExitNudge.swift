import Foundation

/// 房间感知的状态照下限(纯函数,无 ARKit/IO,模拟器单测全覆盖)。
///
/// 真扫教训(2026-07-16):vp_auto=6 张全花在客厅餐厨,卧室/卫生间零状态照 ——
/// 机位配额只有「每间 ≤4-6 张」的上限,没有「离开前至少 1 张」的下限,
/// 网页端对这两间的现状彻底瞎。
///
/// 这里只做判定:相机位置对 RoomPlan section 中心做最近邻归属(带滞回,
/// 站在两区边界上不来回横跳),归属切换 = 用户正在跨界离开;被离开的分区
/// 一张状态照都没有、且待够 minDwellS(与证据引导 15s 防打扰同一节奏,
/// 几秒路过的走廊不算「漏了这间」)才催。产出只是「该催了 + 催哪间」——
/// 不强拍、不阻塞扫描,HUD/语音由控制器接线(级别同「补拍走位」)。
enum SectionExitNudge {
    /// 待满这么久才有资格催(秒)—— 与家具证据引导的防打扰节奏一致
    static let minDwellS: TimeInterval = 15
    /// 新分区中心要比当前近这么多(米)才算真跨界 —— 滞回挡边界抖动
    static let switchMarginM = 1.0

    struct Section: Equatable {
        var label: String
        var center: SIMD2<Double>
    }

    struct State: Equatable {
        var section: Section
        var enteredAt: TimeInterval
        /// 在这个分区里拍到的状态照数(自动快门 + 手动快门都算)
        var photos: Int
    }

    static func nearest(to pos: SIMD2<Double>, in sections: [Section]) -> Section? {
        sections.min { dist(pos, $0.center) < dist(pos, $1.center) }
    }

    /// 每 tick 调一次:返回新状态 + 「正被离开的零状态照分区」(nil = 不催)。
    /// sections 为空(RoomPlan 还没认出功能区)时原样保持,不判定。
    static func track(
        _ state: State?,
        pos: SIMD2<Double>,
        sections: [Section],
        now: TimeInterval
    ) -> (state: State?, leavingZeroShot: Section?) {
        guard let closest = nearest(to: pos, in: sections) else { return (state, nil) }
        guard var s = state else {
            return (State(section: closest, enteredAt: now, photos: 0), nil)
        }
        // 「我的分区」在新列表里的最新形态:RoomPlan 会持续精化 section 中心,
        // 用旧中心的最近邻认领,dwell/photos 不因精化重置
        if let refreshed = nearest(to: s.section.center, in: sections) {
            s.section = refreshed
        }
        let dCurrent = dist(pos, s.section.center)
        let dClosest = dist(pos, closest.center)
        // 滞回:没有明显更近的分区,就当没跨界
        guard closest != s.section, dClosest + switchMarginM <= dCurrent else {
            return (s, nil)
        }
        let leaving = (s.photos == 0 && now - s.enteredAt >= minDwellS) ? s.section : nil
        return (State(section: closest, enteredAt: now, photos: 0), leaving)
    }

    private static func dist(_ a: SIMD2<Double>, _ b: SIMD2<Double>) -> Double {
        let d = a - b
        return (d.x * d.x + d.y * d.y).squareRoot()
    }
}
