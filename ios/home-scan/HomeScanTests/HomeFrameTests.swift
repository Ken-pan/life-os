import XCTest
import simd
@testable import HomeScan

/// 设备端 Home Frame 配准 —— 与网页端 scan-register.js 同源移植的单测镜像:
/// 平移恢复、量化旋转恢复、验收门拒绝、主方向拉平、漏扫检测。
final class HomeFrameTests: XCTestCase {
    /// 两室户型的墙段(米):外框 6×4 + 中隔墙
    private func homeSegs() -> [HomeFrame.Segment] {
        [
            .init(vertical: true, at: 0, lo: 0, hi: 4),
            .init(vertical: true, at: 6, lo: 0, hi: 4),
            .init(vertical: true, at: 3.5, lo: 0, hi: 2.2),
            .init(vertical: false, at: 0, lo: 0, hi: 6),
            .init(vertical: false, at: 4, lo: 0, hi: 6),
        ]
    }

    /// 把家墙段整体平移(模拟「扫描帧原点不同」)
    private func shifted(_ segs: [HomeFrame.Segment], dx: Double, dy: Double) -> [HomeFrame.Segment] {
        segs.map { s in
            HomeFrame.Segment(
                vertical: s.vertical,
                at: s.at + (s.vertical ? dx : dy),
                lo: s.lo + (s.vertical ? dy : dx),
                hi: s.hi + (s.vertical ? dy : dx)
            )
        }
    }

    func testTranslationRecovered() {
        let scan = shifted(homeSegs(), dx: -1.23, dy: 0.87)
        let reg = HomeFrame.register(scan: scan, home: homeSegs())
        XCTAssertTrue(reg.ok, reg.reason ?? "")
        XCTAssertEqual(reg.yawDeg, 0)
        XCTAssertEqual(reg.tx, 1.23, accuracy: 0.02)
        XCTAssertEqual(reg.ty, -0.87, accuracy: 0.02)
        XCTAssertLessThanOrEqual(reg.medianCm, 2)
    }

    func testQuantizedYawRecovered() {
        // 家墙段绕原点转 90°(竖↔横互换)再平移 —— 配准应找回 yaw=270 或 90 逆变换
        let rotated = homeSegs().map { s -> HomeFrame.Segment in
            // (x,y) → (-y,x) 即 yaw90;竖墙变横墙
            if s.vertical {
                return HomeFrame.Segment(vertical: false, at: s.at, lo: -s.hi, hi: -s.lo)
            }
            return HomeFrame.Segment(vertical: true, at: -s.at, lo: s.lo, hi: s.hi)
        }
        let reg = HomeFrame.register(scan: rotated, home: homeSegs())
        XCTAssertTrue(reg.ok, reg.reason ?? "")
        XCTAssertEqual(reg.yawDeg, 270, "转回去应是 270°(90° 的逆)")
    }

    func testGarbageRejected() {
        // 完全不相干的墙(比例、间距全对不上)必须过不了验收门
        let junk: [HomeFrame.Segment] = [
            .init(vertical: true, at: 100, lo: 0, hi: 0.5),
            .init(vertical: false, at: 50, lo: 0, hi: 0.4),
        ]
        let reg = HomeFrame.register(scan: junk, home: homeSegs())
        XCTAssertFalse(reg.ok)
        XCTAssertNotNil(reg.reason)
    }

    func testSingleOrientationRejected() {
        // 只有竖墙匹配 → 平移 ty 无凭据,必须拒绝
        let scan: [HomeFrame.Segment] = [
            .init(vertical: true, at: 0.5, lo: 0, hi: 4),
            .init(vertical: true, at: 6.5, lo: 0, hi: 4),
        ]
        let reg = HomeFrame.register(scan: scan, home: homeSegs())
        XCTAssertFalse(reg.ok)
    }

    func testAxisAlignStraightensRotatedWalls() {
        // 世界系整体歪 17° 的墙,拉平后应得到 4 段轴对齐墙且 phi ≈ -17°
        let theta = 17.0 * .pi / 180
        let rot = SIMD2(cos(theta), sin(theta))
        func r(_ p: SIMD2<Double>) -> SIMD2<Double> {
            SIMD2(p.x * rot.x - p.y * rot.y, p.x * rot.y + p.y * rot.x)
        }
        let walls = [
            (a: r(SIMD2(0, 0)), b: r(SIMD2(6, 0))),
            (a: r(SIMD2(6, 0)), b: r(SIMD2(6, 4))),
            (a: r(SIMD2(6, 4)), b: r(SIMD2(0, 4))),
            (a: r(SIMD2(0, 4)), b: r(SIMD2(0, 0))),
        ]
        let (segs, phi) = HomeFrame.axisAlign(walls: walls)
        XCTAssertEqual(segs.count, 4, "四面墙都应拉平保留")
        XCTAssertEqual(segs.filter(\.vertical).count, 2)
        // phi 把 17° 转回去(mod 90°)
        let residual = abs((phi + theta).truncatingRemainder(dividingBy: .pi / 2))
        XCTAssertLessThan(min(residual, .pi / 2 - residual), 0.01)
    }

    func testEndToEndWorldWallsToHome() {
        // 世界系歪 9° + 原点漂移的完整链路:axisAlign → register → toHome
        let theta = 9.0 * .pi / 180
        let rot = SIMD2(cos(theta), sin(theta))
        let offset = SIMD2(2.4, -1.1)
        func world(_ p: SIMD2<Double>) -> SIMD2<Double> {
            SIMD2(p.x * rot.x - p.y * rot.y, p.x * rot.y + p.y * rot.x) + offset
        }
        let walls = [
            (a: world(SIMD2(0, 0)), b: world(SIMD2(6, 0))),
            (a: world(SIMD2(6, 0)), b: world(SIMD2(6, 4))),
            (a: world(SIMD2(6, 4)), b: world(SIMD2(0, 4))),
            (a: world(SIMD2(0, 4)), b: world(SIMD2(0, 0))),
            (a: world(SIMD2(3.5, 0)), b: world(SIMD2(3.5, 2.2))),
        ]
        let (segs, phi) = HomeFrame.axisAlign(walls: walls)
        let reg = HomeFrame.register(scan: segs, home: homeSegs(), phi: phi)
        XCTAssertTrue(reg.ok, reg.reason ?? "")
        // 家坐标 (3.5, 2.2) 的墙端点应被变换回原位(容差 5cm;yaw 对称性可能翻边,
        // 用「到任一等价角点距离」判)
        let p = HomeFrame.toHome(world(SIMD2(3.5, 2.2)), reg)
        let candidates = [SIMD2(3.5, 2.2), SIMD2(6 - 3.5, 4 - 2.2), SIMD2(3.5, 4 - 2.2), SIMD2(6 - 3.5, 2.2)]
        let dist = candidates.map { length(p - $0) }.min()!
        XCTAssertLessThan(dist, 0.05, "端点应落回家坐标,实际 \(p)")
    }

    func testUncoveredRooms() {
        // 户型两个房间(px,36px/ft):只扫了左边那间 → 右边报「没扫到」
        let pxPerFt = 36.0
        let mToPx = pxPerFt / 0.3048
        func poly(_ pts: [(Double, Double)]) -> [HomeOSProject.Point] {
            pts.map { .init(x: $0.0 * mToPx, y: $0.1 * mToPx) }
        }
        let zones = [
            HomeOSProject.Zone(id: "z-1", nameZh: "客厅", polygon: poly([(0, 0), (3.5, 0), (3.5, 4), (0, 4)])),
            HomeOSProject.Zone(id: "z-2", nameZh: "阳台", polygon: poly([(3.5, 0), (6, 0), (6, 4), (3.5, 4)])),
        ]
        // 已扫墙都在左半边(恒等配准)
        let reg = HomeFrame.Registration(
            ok: true, yawDeg: 0, tx: 0, ty: 0, medianCm: 1, p95Cm: 2,
            matchedWalls: 4, reason: nil, phi: 0
        )
        let walls = [
            (a: SIMD2(0.0, 0.0), b: SIMD2(2.0, 0.0)),
            (a: SIMD2(0.0, 0.0), b: SIMD2(0.0, 4.0)),
        ]
        let missing = HomeFrame.uncoveredRooms(
            zones: zones, pxPerFt: pxPerFt, liveWalls: walls, registration: reg, tolM: 0.5
        )
        XCTAssertEqual(missing, ["阳台"])
    }

    // MARK: - 点到线小角精修(与 scan-register.js 同源,场景与其单测对应)

    func testRefineRecoversResidualRotation() {
        // 户型:6×3m 矩形,每面墙拆两段(中点偏离旋转中心,θ 才可观测)+ 一道竖隔墙
        let home: [HomeFrame.Segment] = [
            .init(vertical: false, at: 0, lo: 0, hi: 2.8),
            .init(vertical: false, at: 0, lo: 3.2, hi: 6),
            .init(vertical: false, at: 3, lo: 0, hi: 2.8),
            .init(vertical: false, at: 3, lo: 3.2, hi: 6),
            .init(vertical: true, at: 0, lo: 0, hi: 1.4),
            .init(vertical: true, at: 0, lo: 1.6, hi: 3),
            .init(vertical: true, at: 6, lo: 0, hi: 1.4),
            .init(vertical: true, at: 6, lo: 1.6, hi: 3),
            .init(vertical: true, at: 3.6, lo: 0, hi: 3),
        ]
        // 扫描 = 每段的 at/lo/hi 按该段中点被 1.2° 旋转(绕房中心)后的位移偏移
        // —— 主方向拉直后残余角差在真实数据里就是这个形态
        let theta = 1.2 * Double.pi / 180
        let c = SIMD2(3.0, 1.5)
        func shift(_ x: Double, _ y: Double) -> SIMD2<Double> {
            let d = SIMD2(x, y) - c
            let r = SIMD2(d.x * cos(theta) - d.y * sin(theta), d.x * sin(theta) + d.y * cos(theta))
            return r - d + SIMD2(0.25, 0.15) // 外加一点平移
        }
        let scan = home.map { s -> HomeFrame.Segment in
            let midX = s.vertical ? s.at : (s.lo + s.hi) / 2
            let midY = s.vertical ? (s.lo + s.hi) / 2 : s.at
            let d = shift(midX, midY)
            return .init(
                vertical: s.vertical,
                at: s.at + (s.vertical ? d.x : d.y),
                lo: s.lo + (s.vertical ? d.y : d.x),
                hi: s.hi + (s.vertical ? d.y : d.x)
            )
        }
        let reg = HomeFrame.register(scan: scan, home: home)
        XCTAssertTrue(reg.ok, reg.reason ?? "")
        XCTAssertEqual(reg.refineDeg, -1.2, accuracy: 0.5, "精修应解出 ≈-1.2°")
        XCTAssertLessThan(reg.medianCm, 3, "精修后中位残差 <3cm")
        // toHome 应用精修:扫描墙中点投回后离目标墙 <3cm
        let sample = SIMD2(scan[8].at, (scan[8].lo + scan[8].hi) / 2)
        let p = HomeFrame.toHome(sample, reg)
        XCTAssertEqual(p.x, 3.6, accuracy: 0.03)
    }
}
