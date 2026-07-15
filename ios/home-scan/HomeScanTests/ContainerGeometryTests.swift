import XCTest
import simd
@testable import HomeScan

/// 柜内测量几何单测:六点拟合、开口朝向、层板合并与分层、payload 单位换算。
/// 场景:一个 0.8m 宽 × 0.35m 深 × 1.9m 高的衣柜,开口朝 +z(用户站在 +z 侧,
/// 相机前向 -z 指向柜内)。
final class ContainerGeometryTests: XCTestCase {
    /// 开口朝 +z 的标准衣柜六点(打点位置故意不在正中,拟合只看投影)
    private func wardrobeTaps() -> ContainerGeometry.Taps {
        ContainerGeometry.Taps(
            left: SIMD3(-0.4, 0.9, -0.2),   // 左壁(x = -0.4),点在半高、进深中段
            right: SIMD3(0.4, 0.3, -0.3),   // 右壁(x = +0.4)
            bottom: SIMD3(0.1, 0.0, -0.2),  // 内底 y=0
            top: SIMD3(-0.1, 1.9, -0.25),   // 内顶 y=1.9
            back: SIMD3(0.0, 1.0, -0.35),   // 后壁 z=-0.35
            front: SIMD3(0.2, 1.2, 0.0),    // 门框前沿 z=0
            forwards: [SIMD2(0, -1), SIMD2(0.05, -0.99)] // 相机朝 -z(指向柜内)
        )
    }

    func testFitBoxDims() {
        let box = ContainerGeometry.fitBox(wardrobeTaps())
        XCTAssertNotNil(box)
        XCTAssertEqual(box!.widthM, 0.8, accuracy: 0.01)
        XCTAssertEqual(box!.depthM, 0.35, accuracy: 0.01)
        XCTAssertEqual(box!.heightM, 1.9, accuracy: 1e-9)
        // 开口朝向 = 相机前向取反 ≈ +z
        XCTAssertEqual(box!.normal.y, 1.0, accuracy: 0.05)
    }

    func testFitBoxToleratesSwappedTaps() {
        // 左右点反、顶底点反 —— 全按投影取 min/max,结果不变
        var taps = wardrobeTaps()
        swap(&taps.left, &taps.right)
        swap(&taps.bottom, &taps.top)
        let box = ContainerGeometry.fitBox(taps)
        XCTAssertEqual(box!.widthM, 0.8, accuracy: 0.01)
        XCTAssertEqual(box!.heightM, 1.9, accuracy: 1e-9)
        XCTAssertEqual(box!.bottomY, 0.0, accuracy: 1e-9)
    }

    func testFitBoxRejectsDegenerate() {
        // 左右点到同一面墙 → 宽 ≈ 0,拒绝
        var taps = wardrobeTaps()
        taps.right = SIMD3(-0.395, 0.5, -0.2)
        XCTAssertNil(ContainerGeometry.fitBox(taps))
        // 缺点也拒绝
        var missing = wardrobeTaps()
        missing.back = nil
        XCTAssertNil(ContainerGeometry.fitBox(missing))
    }

    func testShelfCandidateFilter() {
        let box = ContainerGeometry.fitBox(wardrobeTaps())!
        // 内腔中段的水平面 → 是层板候选
        XCTAssertTrue(ContainerGeometry.isShelfCandidate(SIMD3(0.0, 0.6, -0.2), box: box))
        // 贴着内底(<5cm)不算 —— 那是底板本身
        XCTAssertFalse(ContainerGeometry.isShelfCandidate(SIMD3(0.0, 0.02, -0.2), box: box))
        // 柜子外的水平面(比如旁边的桌面)不算
        XCTAssertFalse(ContainerGeometry.isShelfCandidate(SIMD3(1.5, 0.6, -0.2), box: box))
        XCTAssertFalse(ContainerGeometry.isShelfCandidate(SIMD3(0.0, 0.6, 1.0), box: box))
    }

    func testShelfMergeAndCompartments() {
        let box = ContainerGeometry.fitBox(wardrobeTaps())!
        // 手动点 + 自动候选:0.60 与 0.62 是同一块板(4cm 内合并),
        // 1.24 是第二块;2.5 超出内腔丢弃
        let ys = ContainerGeometry.mergedShelfYs([0.62, 1.24, 0.60, 2.5], box: box)
        XCTAssertEqual(ys.count, 2)
        XCTAssertEqual(ys[0], 0.61, accuracy: 0.001)
        XCTAssertEqual(ys[1], 1.24, accuracy: 1e-9)

        let levels = ContainerGeometry.compartments(shelfYs: [0.62, 1.24, 0.60], box: box)
        XCTAssertEqual(levels.count, 3)
        XCTAssertEqual(levels[0].y0M, 0.0, accuracy: 1e-9)
        XCTAssertEqual(levels[0].heightM, 0.61, accuracy: 0.001)
        XCTAssertEqual(levels[2].y1M, 1.9, accuracy: 1e-9)
    }

    func testNoShelvesSingleCompartment() {
        let box = ContainerGeometry.fitBox(wardrobeTaps())!
        let levels = ContainerGeometry.compartments(shelfYs: [], box: box)
        XCTAssertEqual(levels.count, 1)
        XCTAssertEqual(levels[0].heightM, 1.9, accuracy: 1e-9)
    }

    func testPayloadUnitsAndShape() {
        // 单位换算用干净朝向(斜朝向的投影缩短由 testFitBoxDims 的容差覆盖)
        var taps = wardrobeTaps()
        taps.forwards = [SIMD2(0, -1)]
        taps.left = SIMD3(-0.4, 0.9, -0.2)
        taps.right = SIMD3(0.4, 0.3, -0.2)
        taps.front = SIMD3(0.0, 1.2, 0.0)
        let box = ContainerGeometry.fitBox(taps)!
        let payload = ContainerGeometry.payload(
            scanId: "scan-1",
            placementId: "p7",
            placementLabel: "柜",
            capturedAt: "2026-07-15T00:00:00Z",
            device: "test",
            box: box,
            shelfYs: [0.62]
        )
        XCTAssertEqual(payload.formatVersion, 1)
        XCTAssertEqual(payload.placementId, "p7")
        // 0.8m = 31.5in / 0.35m = 13.8in / 1.9m = 74.8in
        XCTAssertEqual(payload.interiorIn.w, 31.5, accuracy: 0.2)
        XCTAssertEqual(payload.interiorIn.d, 13.8, accuracy: 0.2)
        XCTAssertEqual(payload.interiorIn.h, 74.8, accuracy: 0.2)
        XCTAssertEqual(payload.shelfHeightsIn.count, 1)
        XCTAssertEqual(payload.shelfHeightsIn[0], 24.4, accuracy: 0.2) // 0.62m
        XCTAssertEqual(payload.compartments.count, 2)
        // 0.8 × 0.35 × 1.9 = 0.532 m³ = 532 L
        XCTAssertEqual(payload.interiorVolumeL, 532, accuracy: 1)
        XCTAssertTrue(payload.photos.isEmpty, "photos 上传时才回填")

        // JSON 键稳定(契约):抽查几个关键键
        let data = try! JSONEncoder().encode(payload)
        let obj = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertNotNil(obj["interiorIn"])
        XCTAssertNotNil(obj["shelfHeightsIn"])
        XCTAssertNotNil(obj["compartments"])
        XCTAssertNotNil(obj["interiorVolumeL"])
        XCTAssertNil(obj["measuredInteriorIn"], "没微调不该有实测备份字段")
    }

    func testPayloadUserAdjustmentKeepsMeasured() {
        var taps = wardrobeTaps()
        taps.forwards = [SIMD2(0, -1)]
        taps.right = SIMD3(0.4, 0.3, -0.2)
        taps.front = SIMD3(0.0, 1.2, 0.0)
        let box = ContainerGeometry.fitBox(taps)!

        // 确认页整 cm 播种带来的 ≤5mm 舍入差:不算人工修正
        let seeded = ContainerGeometry.payload(
            scanId: "s", placementId: "p", placementLabel: nil,
            capturedAt: "t", device: "d", box: box, shelfYs: [],
            adjustedM: (w: 0.80, d: 0.35, h: 1.90)
        )
        XCTAssertNil(seeded.measuredInteriorIn)

        // 真调过(内宽 +2cm):interiorIn 用调整值,实测保留,容积随最终值
        let adjusted = ContainerGeometry.payload(
            scanId: "s", placementId: "p", placementLabel: nil,
            capturedAt: "t", device: "d", box: box, shelfYs: [],
            adjustedM: (w: 0.82, d: 0.35, h: 1.90)
        )
        XCTAssertNotNil(adjusted.measuredInteriorIn)
        XCTAssertEqual(adjusted.interiorIn.w, 32.3, accuracy: 0.1) // 0.82m
        XCTAssertEqual(adjusted.measuredInteriorIn!.w, 31.5, accuracy: 0.1)
        XCTAssertEqual(adjusted.interiorVolumeL, 0.82 * 0.35 * 1.9 * 1000, accuracy: 1)
    }

    func testPartialDimsProgressive() {
        var taps = ContainerGeometry.Taps()
        XCTAssertNil(ContainerGeometry.partialDims(taps).widthM)

        // 只有底+顶:先出内高(不依赖朝向)
        taps.bottom = SIMD3(0.1, 0.0, -0.2)
        taps.top = SIMD3(-0.1, 1.9, -0.25)
        var d = ContainerGeometry.partialDims(taps)
        XCTAssertEqual(d.heightM!, 1.9, accuracy: 1e-9)
        XCTAssertNil(d.widthM)

        // 左右 + 朝向:出内宽;后+前沿:出内深
        taps.left = SIMD3(-0.4, 0.9, -0.2)
        taps.right = SIMD3(0.4, 0.3, -0.2)
        taps.forwards = [SIMD2(0, -1)]
        d = ContainerGeometry.partialDims(taps)
        XCTAssertEqual(d.widthM!, 0.8, accuracy: 1e-9)
        XCTAssertNil(d.depthM)

        taps.back = SIMD3(0.0, 1.0, -0.35)
        taps.front = SIMD3(0.0, 1.2, 0.0)
        d = ContainerGeometry.partialDims(taps)
        XCTAssertEqual(d.depthM!, 0.35, accuracy: 1e-9)
    }

    func testWireframeEdges() {
        var taps = wardrobeTaps()
        taps.forwards = [SIMD2(0, -1)]
        taps.left = SIMD3(-0.4, 0.9, -0.2)
        taps.right = SIMD3(0.4, 0.3, -0.2)
        taps.front = SIMD3(0.0, 1.2, 0.0)
        let box = ContainerGeometry.fitBox(taps)!
        let edges = ContainerGeometry.wireframeEdges(box)
        XCTAssertEqual(edges.count, 12)
        // 棱长分布:4 条竖棱 = 内高,4 条横棱 = 内宽,4 条进深棱 = 内深
        let lengths = edges
            .map { simd_length($0.b - $0.a) }
            .sorted()
        XCTAssertEqual(lengths.filter { abs($0 - 1.9) < 0.01 }.count, 4)
        XCTAssertEqual(lengths.filter { abs($0 - 0.8) < 0.01 }.count, 4)
        XCTAssertEqual(lengths.filter { abs($0 - 0.35) < 0.01 }.count, 4)
    }

    func testShelfPlacementCentered() {
        var taps = wardrobeTaps()
        taps.forwards = [SIMD2(0, -1)]
        taps.left = SIMD3(-0.4, 0.9, -0.2)
        taps.right = SIMD3(0.4, 0.3, -0.2)
        taps.front = SIMD3(0.0, 1.2, 0.0)
        let box = ContainerGeometry.fitBox(taps)!
        let place = ContainerGeometry.shelfPlacement(y: 0.62, box: box)
        // 开口朝 +z 的柜子:中心 x=0,z 在 (-0.35+0)/2 = -0.175
        XCTAssertEqual(place.center.x, 0.0, accuracy: 0.01)
        XCTAssertEqual(place.center.y, 0.62, accuracy: 1e-9)
        XCTAssertEqual(place.center.z, -0.175, accuracy: 0.01)
    }
}
