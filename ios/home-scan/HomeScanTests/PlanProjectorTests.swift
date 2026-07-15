import XCTest
@testable import HomeScan

/// 转换器单测:用非对称场景锁死**坐标手性**与 **heading 零点** ——
/// 这是整条链路的头号 bug 源,改 PlanProjector 必须过这组测试。
/// 场景:4×3m 矩形房,南墙(俯视图下侧)带 0.9m 门,床贴西北角,
/// 相机在房中偏南、朝北拍。真值手算,米→px 按 118.11 px/m。
final class PlanProjectorTests: XCTestCase {
    static let pxPerM = PlanProjector.pxPerM // 118.11

    /// 轴对齐的基准场景。走廊在南,床在西北 —— 左右/上下都不对称。
    private func baseScene(rotDeg: Double = 0) -> FlatScene {
        let rot = rotDeg * .pi / 180
        func r(_ x: Double, _ y: Double) -> SIMD2<Double> {
            SIMD2(x * cos(rot) - y * sin(rot), x * sin(rot) + y * cos(rot))
        }
        var s = FlatScene()
        // 俯视坐标(米):x 右,y 下。"北墙" y=0,"南墙" y=3。
        s.walls = [
            .init(a: r(0, 0), b: r(4, 0)),  // 北
            .init(a: r(4, 0), b: r(4, 3)),  // 东
            .init(a: r(4, 3), b: r(0, 3)),  // 南
            .init(a: r(0, 3), b: r(0, 0)),  // 西
        ]
        // 南墙上的门,中心在 x=1m 处
        s.openings = [
            .init(kind: .door, center: r(1, 3), widthM: 0.9, wallIndex: 2)
        ]
        // 床贴西北角:中心 (1, 0.75),宽(局部 x)1.5m、深 1.2m,轴向东(0°)
        s.items = [
            .init(category: "bed", center: r(1, 0.75), axisDeg: rotDeg, widthM: 1.5, depthM: 1.2)
        ]
        s.rooms = [
            .init(label: "bedroom", points: [r(0, 0), r(4, 0), r(4, 3), r(0, 3)])
        ]
        // 相机 (2, 2.5) 朝北(-y):画面应看向房间上部
        s.poses = [
            .init(
                pos: r(2, 2.5),
                forwardDeg: atan2(r(0, -1).y, r(0, -1).x) * 180 / .pi - (rotDeg == 0 ? 0 : 0),
                fovDeg: 69.4,
                takenAt: Date(timeIntervalSince1970: 1_784_000_000),
                camera: "Test",
                photoFileURL: nil
            )
        ]
        // 旋转场景时相机朝向也得跟着转
        if rotDeg != 0 {
            let f = r(0, -1)
            s.poses[0].forwardDeg = atan2(f.y, f.x) * 180 / .pi
        }
        return s
    }

    private func project(_ scene: FlatScene) -> HomeOSProject {
        PlanProjector.project(scene, scanId: "test-scan", nameZh: "测试")
    }

    // MARK: - 基准几何

    func testWallGraphGeometry() {
        let p = project(baseScene())
        XCTAssertEqual(p.wallGraph.vertices.count, 4, "矩形房应焊成 4 个顶点")
        XCTAssertEqual(p.wallGraph.edges.count, 4)
        XCTAssertEqual(p.wallGraph.pxPerFt, 36)

        // 房间 4m 宽 → 472.4px;最小顶点在 margin(24,24)
        let xs = p.wallGraph.vertices.map(\.x)
        let ys = p.wallGraph.vertices.map(\.y)
        XCTAssertEqual(xs.min()!, 24, accuracy: 4)
        XCTAssertEqual(ys.min()!, 24, accuracy: 4)
        XCTAssertEqual(xs.max()! - xs.min()!, 4 * Self.pxPerM, accuracy: 4)
        XCTAssertEqual(ys.max()! - ys.min()!, 3 * Self.pxPerM, accuracy: 4)
    }

    // MARK: - 手性:床必须在左上(西北),不能镜像到别处

    func testChiralityBedTopLeft() {
        let p = project(baseScene())
        guard let bed = p.placements.first else { return XCTFail("床丢了") }
        XCTAssertEqual(bed.kind, "bed")
        // 床中心 (1, 0.75)m → (24+118.1, 24+88.6)px,落在房间左上象限
        let cx = bed.x + bed.w / 2
        let cy = bed.y + bed.h / 2
        XCTAssertEqual(cx, 24 + 1 * Self.pxPerM, accuracy: 6)
        XCTAssertEqual(cy, 24 + 0.75 * Self.pxPerM, accuracy: 6)
        // 轴向东(0°) → rotation 0,footprint 宽 1.5m × 深 1.2m
        XCTAssertEqual(bed.rotation, 0)
        XCTAssertEqual(bed.w, 1.5 * Self.pxPerM, accuracy: 3)
        XCTAssertEqual(bed.h, 1.2 * Self.pxPerM, accuracy: 3)
        XCTAssertEqual(bed.zoneId, "z-1", "床应归属卧室分区")
    }

    // MARK: - heading 零点:朝北(-y) = 0°,顺时针为正

    func testHeadingNorthIsZero() {
        let p = project(baseScene())
        guard let vp = p.viewpoints.first else { return XCTFail("机位丢了") }
        XCTAssertEqual(vp.heading, 0, accuracy: 1.5, "朝 -y(平面图上方) heading 应为 0")
        XCTAssertEqual(vp.x, 24 + 2 * Self.pxPerM, accuracy: 6)
        XCTAssertEqual(vp.y, 24 + 2.5 * Self.pxPerM, accuracy: 6)
        XCTAssertEqual(vp.headingSource, "arkit")
    }

    func testHeadingEastIs90() {
        var s = baseScene()
        s.poses[0].forwardDeg = 0 // 朝 +x(东)
        let p = project(s)
        XCTAssertEqual(p.viewpoints[0].heading, 90, accuracy: 1.5, "朝东应为 90°(顺时针)")
    }

    // MARK: - 门:南墙、offsetIn 按沿边英寸

    func testDoorOnSouthWall() {
        let p = project(baseScene())
        XCTAssertEqual(p.graphOpenings.count, 1)
        let door = p.graphOpenings[0]
        XCTAssertEqual(door.type, "door")
        // 0.9m 门 → 35.4 英寸
        XCTAssertEqual(door.spanIn, 0.9 * Self.pxPerM / 3, accuracy: 1.5)
        // 宿主边必须是 y≈378 的南墙
        let g = p.wallGraph
        let edge = g.edges.first { $0.id == door.edgeId }!
        let ya = g.vertices.first { $0.id == edge.a }!.y
        let yb = g.vertices.first { $0.id == edge.b }!.y
        XCTAssertEqual(ya, 24 + 3 * Self.pxPerM, accuracy: 6)
        XCTAssertEqual(yb, 24 + 3 * Self.pxPerM, accuracy: 6)
    }

    // MARK: - 主方向旋转:整场转 20° 后输出应与轴对齐版本一致

    func testDominantRotationUndoesTilt() {
        let p0 = project(baseScene())
        let p20 = project(baseScene(rotDeg: 20))

        let xs0 = p0.wallGraph.vertices.map(\.x).sorted()
        let xs20 = p20.wallGraph.vertices.map(\.x).sorted()
        for (a, b) in zip(xs0, xs20) {
            XCTAssertEqual(a, b, accuracy: 6, "旋转 20° 应被主方向对齐抵消")
        }
        // 床和 heading 也要归位
        XCTAssertEqual(p20.placements[0].rotation, 0)
        XCTAssertEqual(p20.viewpoints[0].heading, 0, accuracy: 2)
    }

    // MARK: - 分区与元数据

    func testZonesAndMeta() {
        let p = project(baseScene())
        XCTAssertEqual(p.zones.count, 1)
        XCTAssertEqual(p.zones[0].nameZh, "卧室")
        // 4m×3m = 12m² ≈ 129.2 ft²
        XCTAssertEqual(p.meta.sqft ?? 0, 129.2, accuracy: 2)
        XCTAssertEqual(p.meta.sourceNote, "iOS HomeScan · RoomPlan 实测")
    }

    // MARK: - Mock 场景全链路(含跳过告警 + 契约序列化)

    func testMockSceneRoundTrip() throws {
        let p = project(MockScan.scene())
        XCTAssertEqual(p.zones.count, 2)
        XCTAssertTrue(p.zones.contains { $0.nameZh == "卧室" })
        XCTAssertTrue(p.zones.contains { $0.nameZh == "客厅" })
        XCTAssertEqual(p.placements.count, 2, "床+沙发")
        XCTAssertEqual(p.fixtures.count, 1, "冰箱是固定设施")
        XCTAssertTrue(
            p.meta.scanWarnings.contains { $0.contains("stairs") },
            "stairs 应被跳过并告警"
        )
        XCTAssertEqual(p.viewpoints.count, 2)

        // 契约序列化:字段名与网页端 scan-payload.js 对齐
        let payload = ScanPayload(scanId: "roundtrip", homeos: p, raw: nil)
        let data = try JSONEncoder().encode(payload)
        let obj = try XCTUnwrap(
            try JSONSerialization.jsonObject(with: data) as? [String: Any]
        )
        XCTAssertEqual(obj["formatVersion"] as? Int, 1)
        let homeos = try XCTUnwrap(obj["homeos"] as? [String: Any])
        for key in ["wallGraph", "graphOpenings", "zones", "placements", "fixtures", "viewpoints", "meta"] {
            XCTAssertNotNil(homeos[key], "契约缺字段 \(key)")
        }
        let wg = try XCTUnwrap(homeos["wallGraph"] as? [String: Any])
        XCTAssertEqual(wg["pxPerFt"] as? Double, 36)

        // 跨端一致性:把 Swift 产出的 payload 落盘,供网页端
        // scan-payload.js 的校验器复验(scripts/cloud-scan-unit.mjs --swift)。
        try? data.write(to: URL(fileURLWithPath: "/tmp/homescan-mock-payload.json"))
    }
}
