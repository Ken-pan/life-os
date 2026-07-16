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
            .init(labels: ["bedroom"], points: [r(0, 0), r(4, 0), r(4, 3), r(0, 3)])
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

    // MARK: - 真扫暴露的缺陷:重叠地板合并 / 近轴拉直 / 偏轴噪声过滤

    func testOverlappingFloorsMerge() {
        var s = baseScene()
        // 同一房间扫了第二遍:地板几乎重合(略小),带上另一个 section 标签
        s.rooms.append(
            .init(labels: ["kitchen"], points: [
                SIMD2(0.2, 0.2), SIMD2(3.8, 0.2), SIMD2(3.8, 2.8), SIMD2(0.2, 2.8),
            ])
        )
        let p = project(s)
        XCTAssertEqual(p.zones.count, 1, "重叠 >60% 的地板应合并")
        XCTAssertEqual(p.zones[0].nameZh, "卧室·厨房", "合并后标签拼接")
        // 面积不再双算:仍 ≈ 129 ft²
        XCTAssertEqual(p.meta.sqft ?? 0, 129.2, accuracy: 3)
        XCTAssertTrue(p.meta.scanWarnings.contains { $0.contains("重叠") })
    }

    func testNearAxisWallsStraightened() {
        var s = baseScene()
        // 北墙一端翘起 8cm(≈1.1°,RoomPlan 常态)→ 应拉平成水平
        s.walls[0] = .init(a: SIMD2(0, 0), b: SIMD2(4, 0.08))
        let p = project(s)
        for e in p.wallGraph.edges {
            let a = p.wallGraph.vertices.first { $0.id == e.a }!
            let b = p.wallGraph.vertices.first { $0.id == e.b }!
            XCTAssertTrue(
                abs(a.x - b.x) < 1 || abs(a.y - b.y) < 1,
                "近轴墙应被拉直:\(e.id) (\(a.x),\(a.y))-(\(b.x),\(b.y))"
            )
        }
    }

    func testOffAxisNoiseDropped() {
        var s = baseScene()
        // 25cm 长、30° 歪的碎墙 —— 扫描噪声,应被滤掉
        s.walls.append(.init(a: SIMD2(2, 1), b: SIMD2(2.22, 1.13)))
        let p = project(s)
        XCTAssertEqual(p.wallGraph.edges.count, 4, "偏轴碎墙应被过滤")
        XCTAssertTrue(p.meta.scanWarnings.contains { $0.contains("碎墙") })
    }

    // MARK: - 真扫核心缺陷:一整块地板 + 多 section 必须切开

    /// 真扫实测:RoomPlan 全屋只给 1 块地板 + 5 个 section,不切就是一个
    /// 「厨房·卧室·卫生间」巨区,家具 zoneId 全指同一个,毫无意义。
    func testSingleFloorSplitBySections() {
        var s = baseScene()
        s.rooms = [
            .init(labels: [], points: [SIMD2(0, 0), SIMD2(8, 0), SIMD2(8, 3), SIMD2(0, 3)])
        ]
        // 左半卧室、右半厨房
        s.sections = [
            .init(label: "bedroom", center: SIMD2(2, 1.5)),
            .init(label: "kitchen", center: SIMD2(6, 1.5)),
        ]
        let p = project(s)
        XCTAssertEqual(p.zones.count, 2, "一整块地板应按 section 切成 2 区")
        XCTAssertEqual(Set(p.zones.map(\.nameZh)), ["卧室", "厨房"])
        // 分界应在 x=4m 的垂直平分线上:床(x=1m)归卧室
        guard let bed = p.placements.first(where: { $0.kind == "bed" }) else {
            return XCTFail("床丢了")
        }
        let bedroomId = p.zones.first { $0.nameZh == "卧室" }!.id
        XCTAssertEqual(bed.zoneId, bedroomId, "床应归属卧室区,而非一个巨区")
        // 切开后面积不重不漏:两区合计 ≈ 8×3m = 258 ft²
        XCTAssertEqual(p.meta.sqft ?? 0, 258.3, accuracy: 4)
    }

    /// RoomPlan 的 sink 不分厨卫,靠所在区改判(真扫两个 sink 全成了厨房水槽)
    func testBathroomSinkBecomesVanity() {
        var s = baseScene()
        s.rooms = [
            .init(labels: [], points: [SIMD2(0, 0), SIMD2(8, 0), SIMD2(8, 3), SIMD2(0, 3)])
        ]
        s.sections = [
            .init(label: "bathroom", center: SIMD2(2, 1.5)),
            .init(label: "kitchen", center: SIMD2(6, 1.5)),
        ]
        s.items = [
            .init(category: "sink", center: SIMD2(1, 0.5), axisDeg: 0, widthM: 0.5, depthM: 0.4),
            .init(category: "sink", center: SIMD2(7, 0.5), axisDeg: 0, widthM: 0.8, depthM: 0.5),
        ]
        let p = project(s)
        XCTAssertEqual(p.fixtures.count, 2, "两个水槽相距远,不该被去重")
        XCTAssertEqual(p.fixtures.filter { $0.kind == "vanity" }.count, 1, "卫生间的 sink → 洗手台")
        XCTAssertEqual(p.fixtures.filter { $0.kind == "kitchenSink" }.count, 1, "厨房的 sink → 水槽")
    }

    /// label=unidentified 的区(真扫 5 个 section 里有 2 个)按家具反推名字
    func testUnidentifiedZoneNamedFromFurniture() {
        var s = baseScene()
        s.rooms = [
            .init(labels: [], points: [SIMD2(0, 0), SIMD2(8, 0), SIMD2(8, 3), SIMD2(0, 3)])
        ]
        s.sections = [
            .init(label: "unidentified", center: SIMD2(2, 1.5)),
            .init(label: "kitchen", center: SIMD2(6, 1.5)),
        ]
        // 床在左区(x=1m) → 该区应被推断为卧室
        let p = project(s)
        XCTAssertTrue(p.zones.contains { $0.nameZh == "卧室" }, "有床的 unidentified 区应推断为卧室")
        XCTAssertFalse(p.zones.contains { $0.nameZh == "房间" }, "不该留下无名区")
    }

    /// 推断名必须避开真 section 已占的名字:真扫那个带{桌,椅,灶台}的区
    /// 若也叫「厨房」,就会和真厨房撞成「厨房 1 / 厨房 2」——它其实是餐区。
    func testInferredNameAvoidsRealSectionName() {
        var s = baseScene()
        s.rooms = [
            .init(labels: [], points: [SIMD2(0, 0), SIMD2(8, 0), SIMD2(8, 3), SIMD2(0, 3)])
        ]
        s.sections = [
            .init(label: "kitchen", center: SIMD2(6, 1.5)),
            .init(label: "unidentified", center: SIMD2(2, 1.5)),
        ]
        s.items = [
            .init(category: "stove", center: SIMD2(7, 0.5), axisDeg: 0, widthM: 0.7, depthM: 0.6),
            // 左区:桌+椅+另一台灶台(开放式厨房常见)→ 候选[餐区,厨房],厨房已占 → 餐区
            .init(category: "table", center: SIMD2(1.5, 1.5), axisDeg: 0, widthM: 1.2, depthM: 0.8),
            .init(category: "chair", center: SIMD2(2.5, 1.5), axisDeg: 0, widthM: 0.5, depthM: 0.5),
            .init(category: "stove", center: SIMD2(1, 0.4), axisDeg: 0, widthM: 0.7, depthM: 0.6),
        ]
        let p = project(s)
        XCTAssertEqual(Set(p.zones.map(\.nameZh)), ["厨房", "餐区"])
        XCTAssertFalse(p.zones.contains { $0.nameZh.hasSuffix(" 1") }, "不该退化成带序号的重名区")
    }

    // MARK: - 外观属性(attrs):样式精化 / 高度换算 / 照片映射

    func testStyleRefinement() {
        var s = baseScene()
        s.items = [
            .init(category: "sofa", center: SIMD2(1, 1), axisDeg: 0, widthM: 2.4, depthM: 1.6,
                  heightM: 0.8, confidence: "high", styleKeys: ["SofaType.lShaped"]),
            .init(category: "sofa", center: SIMD2(3, 1), axisDeg: 0, widthM: 0.9, depthM: 0.9,
                  styleKeys: ["SofaType.singleSeat"]),
            .init(category: "table", center: SIMD2(1, 2.2), axisDeg: 0, widthM: 1.1, depthM: 0.6,
                  styleKeys: ["TableType.coffee"]),
            .init(category: "table", center: SIMD2(3, 2.2), axisDeg: 0, widthM: 1.4, depthM: 1.4,
                  styleKeys: ["TableType.dining", "TableShapeType.circularElliptic"]),
            .init(category: "chair", center: SIMD2(2, 2.6), axisDeg: 0, widthM: 0.6, depthM: 0.6,
                  styleKeys: ["ChairType.swivel"]),
            .init(category: "storage", center: SIMD2(0.5, 2.6), axisDeg: 0, widthM: 0.8, depthM: 0.4,
                  styleKeys: ["StorageType.shelf"]),
        ]
        let p = project(s)
        let byLabel = Dictionary(uniqueKeysWithValues: p.placements.map { ($0.label, $0) })

        XCTAssertEqual(byLabel["L形沙发"]?.kind, "sofa")
        XCTAssertEqual(byLabel["L形沙发"]?.attrs?.styleZh, "L形")
        XCTAssertEqual(byLabel["L形沙发"]?.attrs?.confidence, "high")
        // 0.8m → 31.5 英寸
        XCTAssertEqual(byLabel["L形沙发"]?.attrs?.heightIn ?? 0, 31.5, accuracy: 0.2)
        XCTAssertEqual(byLabel["单人沙发"]?.kind, "armchair", "单人沙发应细分为 armchair")
        XCTAssertEqual(byLabel["茶几"]?.kind, "coffee_table")
        XCTAssertEqual(byLabel["圆餐桌"]?.kind, "table")
        XCTAssertEqual(byLabel["转椅"]?.kind, "office_chair")
        XCTAssertEqual(byLabel["架子"]?.kind, "shelf", "开放架应细分为 shelf")
        // 没样式属性也没实测高的物体不该背一个空 attrs
        XCTAssertNil(byLabel["架子"]?.attrs?.heightIn)
    }

    func testObjectPhotoAndColorFlowIntoAttrs() throws {
        var s = baseScene()
        let tmp = FileManager.default.temporaryDirectory
            .appendingPathComponent("test-obj-\(UUID().uuidString).jpg")
        try Data([0xFF, 0xD8, 0xFF]).write(to: tmp)
        defer { try? FileManager.default.removeItem(at: tmp) }
        s.items = [
            .init(category: "bed", center: SIMD2(1, 0.75), axisDeg: 0, widthM: 1.5, depthM: 1.2,
                  heightM: 0.55, confidence: "high",
                  photoFileURL: tmp, colorHex: "#8899AA",
                  photos: [
                    .init(fileURL: tmp, azimuthDeg: 45, score: 0.8),
                    .init(fileURL: tmp, azimuthDeg: 170, score: 0.5),
                  ])
        ]
        let projection = PlanProjector.projectScene(s, scanId: "t", nameZh: "测试")
        let bed = try XCTUnwrap(projection.project.placements.first)
        XCTAssertEqual(bed.attrs?.colorHex, "#8899AA")
        XCTAssertNil(bed.attrs?.photoPath, "photoPath 该由上传阶段回填,投影阶段必须为空")
        XCTAssertNil(bed.attrs?.photos, "photos 桶内路径也该由上传阶段回填")
        let assets = try XCTUnwrap(projection.objectPhotos[bed.id], "证据包应按 placement id 带出")
        XCTAssertEqual(assets.count, 2)
        XCTAssertEqual(assets[0].url, tmp)
        XCTAssertEqual(assets[0].azimuthDeg ?? 0, 45, accuracy: 0.01, "分数最高的一张在前")
    }

    /// 实测脚印真值:w/h 之后可能被用户拖改,attrs.measuredWIn/HIn 是不动的底账
    func testMeasuredDimsInAttrs() throws {
        let p = project(baseScene())
        let bed = try XCTUnwrap(p.placements.first)
        // 1.5m × 1.2m → 59.1″ × 47.2″
        XCTAssertEqual(bed.attrs?.measuredWIn ?? 0, 59.1, accuracy: 0.15)
        XCTAssertEqual(bed.attrs?.measuredHIn ?? 0, 47.2, accuracy: 0.15)
        // 真值必须与落盘 w/h 一致(px→in 换算 3px/in)
        XCTAssertEqual(bed.attrs?.measuredWIn ?? 0, bed.w / 3, accuracy: 0.06)
        XCTAssertEqual(bed.attrs?.measuredHIn ?? 0, bed.h / 3, accuracy: 0.06)
    }

    /// 去重取谁的尺寸:置信度高的赢(哪怕更小)—— RoomPlan 扫不全时
    /// 会给偏小包围盒+低置信度,盲取更大的会把误检大框当真。
    func testDedupPrefersHigherConfidence() {
        var s = baseScene()
        s.items = [
            .init(category: "sofa", center: SIMD2(2, 1.5), axisDeg: 0,
                  widthM: 2.3, depthM: 0.9, confidence: "low"),
            .init(category: "sofa", center: SIMD2(2.2, 1.5), axisDeg: 0,
                  widthM: 2.0, depthM: 0.9, confidence: "high"),
        ]
        let p = project(s)
        XCTAssertEqual(p.placements.count, 1)
        let sofa = p.placements[0]
        XCTAssertEqual(sofa.w, 2.0 * Self.pxPerM, accuracy: 2, "该取 high 置信度的 2.0m,不是更大的 2.3m")
        XCTAssertEqual(sofa.attrs?.confidence, "high")
        // 两次测量差 30cm > 10cm,必须有告警提示补扫
        XCTAssertTrue(
            p.meta.scanWarnings.contains { $0.contains("测量尺寸差") },
            p.meta.scanWarnings.joined(separator: " / ")
        )
    }

    /// 低置信度的尺寸不许静默进图:点名提示补扫
    func testLowConfidenceWarning() {
        var s = baseScene()
        s.items = [
            .init(category: "storage", center: SIMD2(2, 1.5), axisDeg: 0,
                  widthM: 0.8, depthM: 0.4, confidence: "low")
        ]
        let p = project(s)
        XCTAssertTrue(
            p.meta.scanWarnings.contains { $0.contains("低置信度") && $0.contains("柜") },
            p.meta.scanWarnings.joined(separator: " / ")
        )
    }

    /// 去重合并时外观信息不能丢:灶台无照片、烤箱有照片 → 合并后照片仍在
    func testDedupKeepsAttrsFromLoser() {
        var s = baseScene()
        let tmp = FileManager.default.temporaryDirectory
            .appendingPathComponent("test-obj-\(UUID().uuidString).jpg")
        try? Data([0xFF]).write(to: tmp)
        defer { try? FileManager.default.removeItem(at: tmp) }
        s.items = [
            .init(category: "stove", center: SIMD2(2, 1.5), axisDeg: 0, widthM: 0.76, depthM: 0.65),
            .init(category: "oven", center: SIMD2(2, 1.55), axisDeg: 0, widthM: 0.7, depthM: 0.6,
                  heightM: 0.9, photoFileURL: tmp, colorHex: "#222222",
                  photos: [.init(fileURL: tmp, azimuthDeg: 10, score: 0.6)]),
        ]
        let projection = PlanProjector.projectScene(s, scanId: "t", nameZh: "测试")
        XCTAssertEqual(projection.project.fixtures.filter { $0.kind == "stove" }.count, 1)
        let stove = projection.project.fixtures.first { $0.kind == "stove" }!
        XCTAssertEqual(stove.attrs?.colorHex, "#222222", "被合并那件的颜色应保留")
        XCTAssertEqual(projection.objectPhotos[stove.id]?.first?.url, tmp, "被合并那件的照片应保留")
    }

    // MARK: - Mock 场景全链路(含跳过告警 + 契约序列化)

    func testMockSceneRoundTrip() throws {
        let p = project(MockScan.scene())
        XCTAssertEqual(p.zones.count, 2, "一整块地板应按 2 个 section 切成 2 区")
        XCTAssertTrue(p.zones.contains { $0.nameZh == "卧室" })
        XCTAssertTrue(p.zones.contains { $0.nameZh == "客厅" })
        XCTAssertEqual(p.placements.count, 2, "床+沙发")
        XCTAssertEqual(p.fixtures.count, 2, "冰箱(去重后 1)+ 灶台/烤箱一体机(去重后 1)")
        XCTAssertEqual(p.fixtures.filter { $0.kind == "stove" }.count, 1, "oven 与 stove 同位应合并")
        XCTAssertEqual(p.fixtures.filter { $0.kind == "fridge" }.count, 1)
        XCTAssertTrue(
            p.meta.scanWarnings.contains { $0.contains("stairs") },
            "stairs 应被跳过并告警"
        )
        XCTAssertTrue(
            p.meta.scanWarnings.contains { $0.contains("重复识别") },
            "冰箱去重应留告警"
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

        // attrs 加法式扩展:有外观信息的家具要带 attrs,且 photoPath 上传前为空
        let placements = try XCTUnwrap(homeos["placements"] as? [[String: Any]])
        let sofa = try XCTUnwrap(placements.first { ($0["label"] as? String) == "L形沙发" })
        let attrs = try XCTUnwrap(sofa["attrs"] as? [String: Any], "L形沙发应带 attrs")
        XCTAssertEqual(attrs["styleZh"] as? String, "L形")
        XCTAssertEqual(attrs["colorHex"] as? String, "#B08968")
        XCTAssertNil(attrs["photoPath"], "photoPath 由上传阶段回填")

        // 跨端一致性:把 Swift 产出的 payload 落盘,供网页端
        // scan-payload.js 的校验器复验(scripts/cloud-scan-unit.mjs --swift)。
        try? data.write(to: URL(fileURLWithPath: "/tmp/homescan-mock-payload.json"))
    }

    // MARK: - 纵向实测(2026-07 加法式:吊顶高/窗台高/洞口高)

    func testCeilingHeightIsMedianWallHeight() {
        var s = baseScene()
        // 三面 2.5m 标准墙 + 一面 1.2m 半墙:中位数必须不被半墙拽低
        s.walls[0].heightM = 2.5
        s.walls[1].heightM = 2.5
        s.walls[2].heightM = 2.5
        s.walls[3].heightM = 1.2
        let p = project(s)
        XCTAssertEqual(p.meta.ceilingHeightIn ?? 0, 2.5 * 39.3700787, accuracy: 0.2)
    }

    func testCeilingHeightNilWhenUnknown() {
        // 墙高全 0(旧扫描/mock)→ 不发,别编造一个 0 英寸的天花板
        XCTAssertNil(project(baseScene()).meta.ceilingHeightIn)
    }

    func testWindowSillAndHeight() {
        var s = baseScene()
        // 南墙加一扇窗:窗台 0.9m、窗高 1.2m
        s.openings.append(
            .init(kind: .window, center: SIMD2(2.5, 3), widthM: 1.0,
                  heightM: 1.2, elevM: 0.9, wallIndex: 2)
        )
        let p = project(s)
        let win = p.graphOpenings.first { $0.type == "window" }
        XCTAssertEqual(win?.sillIn ?? 0, 0.9 * 39.3700787, accuracy: 0.2)
        XCTAssertEqual(win?.heightIn ?? 0, 1.2 * 39.3700787, accuracy: 0.2)
        // 门:heightM 没喂(0)就不发,更不该有窗台
        let door = p.graphOpenings.first { $0.type == "door" }
        XCTAssertNil(door?.heightIn)
        XCTAssertNil(door?.sillIn)
    }

    // MARK: - 偏轴朝向(rotation 量化丢掉的真值)

    func testYawDegCarriesOffAxisOrientation() {
        var s = baseScene()
        // 斜摆 20°:rotation 量化到 0,真朝向靠 attrs.yawDeg 补回
        s.items[0].axisDeg = 20
        let p = project(s)
        let bed = p.placements[0]
        XCTAssertEqual(bed.rotation, 0)
        XCTAssertEqual(bed.attrs?.yawDeg ?? 0, 20, accuracy: 1.5)
    }

    func testYawDegOmittedWhenAxisAligned() {
        // 贴轴(基准场景 axisDeg=0)→ 不发,payload 不背噪声
        XCTAssertNil(project(baseScene()).placements[0].attrs?.yawDeg)
    }
}
