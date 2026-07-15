import XCTest
@testable import HomeScan

/// 证据完备度引导单测:锁死方位桶几何、靠墙方位剔除、目标锁定与方向文案。
/// 场景与 PlanProjectorTests 同一坐标约定:俯视图 x 右、y(=世界 z)下。
final class EvidenceGuideTests: XCTestCase {
    private func furniture(
        category: String = "sofa",
        center: SIMD2<Double> = .zero,
        w: Double = 2.0,
        d: Double = 0.9,
        bins: Set<Int> = [],
        h: Double = 0,
        elev: Double = 0
    ) -> EvidenceGuide.Furniture {
        EvidenceGuide.Furniture(
            id: UUID(),
            category: category,
            center: center,
            widthM: w,
            depthM: d,
            binsCovered: bins,
            heightM: h,
            elevM: elev
        )
    }

    // MARK: - 藏在别的家具下面(桌下收纳柜)

    func testHiddenUnderDeskNeedsOnlyOneShot() {
        // 1.8×0.9 桌(高 0.75)罩着 0.4×0.5 的柜(高 0.65),柜中心在桌脚印内
        let desk = furniture(category: "table", center: SIMD2(0, 0), w: 1.8, d: 0.9, h: 0.75)
        let cab = furniture(category: "storage", center: SIMD2(0.3, 0.1), w: 0.4, d: 0.5, h: 0.65)
        let host = EvidenceGuide.hiddenHost(cab, among: [desk, cab])
        XCTAssertEqual(host?.id, desk.id, "柜藏在桌下")
        XCTAssertNil(EvidenceGuide.hiddenHost(desk, among: [desk, cab]), "桌自己不算藏")

        let shorts = EvidenceGuide.deficits(furnitures: [desk, cab], walls: [])
        let cabDef = shorts.first { $0.furniture.id == cab.id }
        XCTAssertEqual(cabDef?.required, 1, "藏起来的一张就算完备")
        XCTAssertNotNil(cabDef?.hiddenUnder)
        let g = EvidenceGuide.guidance(
            deficits: shorts.filter { $0.furniture.id == cab.id },
            cameraPos: SIMD2(3, 0),
            cameraForwardDeg: 180
        )
        XCTAssertTrue(g?.text.contains("蹲低") ?? false, "引导词是蹲低拍,不是绕方位: \(g?.text ?? "nil")")
    }

    func testHeightUnknownNeverGuessedHidden() {
        let desk = furniture(category: "table", center: SIMD2(0, 0), w: 1.8, d: 0.9, h: 0.75)
        let cab = furniture(category: "storage", center: SIMD2(0.3, 0.1), w: 0.4, d: 0.5) // h=0 未知
        XCTAssertNil(EvidenceGuide.hiddenHost(cab, among: [desk, cab]), "高度未知不瞎猜")
    }

    // MARK: - 视角要求分级

    func testRequiredBinsBySize() {
        XCTAssertEqual(EvidenceGuide.requiredBins(furniture(w: 2.2, d: 0.9)), 3, "沙发是大件")
        XCTAssertEqual(EvidenceGuide.requiredBins(furniture(w: 0.5, d: 0.5)), 2, "椅子是中件")
        XCTAssertEqual(EvidenceGuide.requiredBins(furniture(w: 0.3, d: 0.3)), 1, "小件一张就够")
    }

    // MARK: - 方位桶几何(与 ObjectShotCapture 的 az/bin 定义一致)

    func testStandpointMatchesBinCenter() {
        let f = furniture(center: SIMD2(2, 3), w: 1.0, d: 1.0)
        let r = EvidenceGuide.standRadius(f)
        // 桶 0 覆盖 0°-90°,中心 45°:standpoint 在 +x+y 象限对角线上
        let p = EvidenceGuide.standpoint(for: f, bin: 0)
        XCTAssertEqual(p.x, 2 + r * cos(.pi / 4), accuracy: 1e-9)
        XCTAssertEqual(p.y, 3 + r * sin(.pi / 4), accuracy: 1e-9)
        // 从 standpoint 拍,方位角应落回桶 0
        let az = atan2(p.y - 3, p.x - 2) * 180 / .pi
        XCTAssertEqual(min(3, Int(az / 90)), 0)
    }

    // MARK: - 靠墙方位剔除

    func testWallBehindSofaRemovesBins() {
        // 沙发背贴 y=0 的墙(墙在上方,家具中心在墙下方 0.5m)
        let f = furniture(center: SIMD2(2, 0.5), w: 2.0, d: 0.9)
        let wall = EvidenceGuide.Wall(a: SIMD2(-3, 0), b: SIMD2(7, 0))
        // 朝墙的两个桶(2、3:方位角 180°-360°,即站到家具上方/墙外)不可达
        XCTAssertTrue(EvidenceGuide.reachable(f, bin: 0, walls: [wall]))
        XCTAssertTrue(EvidenceGuide.reachable(f, bin: 1, walls: [wall]))
        XCTAssertFalse(EvidenceGuide.reachable(f, bin: 2, walls: [wall]))
        XCTAssertFalse(EvidenceGuide.reachable(f, bin: 3, walls: [wall]))

        // 要求随可达桶数收缩:大件要 3,但只剩 2 个可达 → 只要 2
        let d = EvidenceGuide.deficits(furnitures: [f], walls: [wall])
        XCTAssertEqual(d.count, 1)
        XCTAssertEqual(d[0].required, 2)
        XCTAssertEqual(Set(d[0].missingBins), [0, 1])
    }

    func testCoveredUnreachableBinStillCounts() {
        // 碰巧从「不可达」方位拍到过(比如隔着门洞) —— 证据照样算数
        let f = furniture(center: SIMD2(2, 0.5), w: 2.0, d: 0.9, bins: [0, 2])
        let wall = EvidenceGuide.Wall(a: SIMD2(-3, 0), b: SIMD2(7, 0))
        let d = EvidenceGuide.deficits(furnitures: [f], walls: [wall])
        // attainable = 可达{0,1} ∪ 已拍{0,2} = 3 桶,required = min(3, 3) = 3,已拍 2
        XCTAssertEqual(d.count, 1)
        XCTAssertEqual(d[0].covered, 2)
        XCTAssertEqual(d[0].required, 3)
        XCTAssertEqual(d[0].missingBins, [1])
    }

    func testSatisfiedFurnitureHasNoDeficit() {
        let f = furniture(w: 2.0, d: 0.9, bins: [0, 1, 3])
        XCTAssertTrue(EvidenceGuide.deficits(furnitures: [f], walls: []).isEmpty)
        let small = furniture(category: "television", w: 0.3, d: 0.2, bins: [2])
        XCTAssertTrue(EvidenceGuide.deficits(furnitures: [small], walls: []).isEmpty)
    }

    // MARK: - 引导文案与目标锁定

    func testGuidancePicksNearestMissingBinAndNamesDirection() {
        // 沙发在原点,没有任何照片;相机在正东 3m 处朝西(-x,forward=180°)
        let f = furniture(center: .zero, w: 2.0, d: 0.9)
        let deficits = EvidenceGuide.deficits(furnitures: [f], walls: [])
        let g = EvidenceGuide.guidance(
            deficits: deficits,
            cameraPos: SIMD2(3, 0),
            cameraForwardDeg: 180
        )
        XCTAssertNotNil(g)
        // 最近的 standpoint 是桶 0 或 3(都在 +x 侧,等距) —— 无论哪个,
        // 文案必须包含家具中文名与具体距离
        XCTAssertTrue(g!.text.contains("沙发"), g!.text)
        XCTAssertTrue(g!.text.contains("米") || g!.text.contains("就在这里"), g!.text)
        XCTAssertTrue([0, 3].contains(g!.bin))
    }

    func testGuidanceHoldsTargetWhileDeficient() {
        let f = furniture(center: .zero, w: 2.0, d: 0.9)
        let deficits = EvidenceGuide.deficits(furnitures: [f], walls: [])
        let first = EvidenceGuide.guidance(
            deficits: deficits,
            cameraPos: SIMD2(3, 0),
            cameraForwardDeg: 180
        )!
        // 相机走到别处,持有 holdTarget → 目标(件与桶)不换
        let held = EvidenceGuide.guidance(
            deficits: deficits,
            cameraPos: SIMD2(-3, 2),
            cameraForwardDeg: 0,
            holdTarget: (first.objectId, first.bin)
        )!
        XCTAssertEqual(held.objectId, first.objectId)
        XCTAssertEqual(held.bin, first.bin)
    }

    func testGuidanceNearStandpointAsksToHold() {
        let f = furniture(center: .zero, w: 1.0, d: 1.0)
        let deficits = EvidenceGuide.deficits(furnitures: [f], walls: [])
        let stand = EvidenceGuide.standpoint(for: f, bin: 0)
        let g = EvidenceGuide.guidance(
            deficits: deficits,
            cameraPos: stand + SIMD2(0.1, 0),
            cameraForwardDeg: 0,
            holdTarget: nil
        )
        // 人已站到位(选中的就是最近的桶 0)→ 提示稳住而不是再走
        XCTAssertEqual(g?.bin, 0)
        XCTAssertTrue(g!.text.contains("就在这里"), g!.text)
    }

    func testRelativeDirectionHandedness() {
        // 俯视图 x 右、y 下:面朝 +x(0°) 时,+y 在右手边
        let dir = EvidenceGuide.relativeDirection(
            from: .zero,
            forwardDeg: 0,
            to: SIMD2(0, 2)
        )
        XCTAssertEqual(dir, "右手边")
        XCTAssertEqual(
            EvidenceGuide.relativeDirection(from: .zero, forwardDeg: 0, to: SIMD2(0, -2)),
            "左手边"
        )
        XCTAssertEqual(
            EvidenceGuide.relativeDirection(from: .zero, forwardDeg: 0, to: SIMD2(2, 0)),
            "正前方"
        )
        XCTAssertEqual(
            EvidenceGuide.relativeDirection(from: .zero, forwardDeg: 90, to: SIMD2(0, 2)),
            "正前方"
        )
    }

    // MARK: - 扫描完成后的汇总警告

    func testSceneWarningsAggregate() {
        var scene = FlatScene()
        // 4×3m 房,床没有任何照片,电视有一张 → 只有床上榜
        scene.walls = [
            .init(a: SIMD2(0, 0), b: SIMD2(4, 0)),
            .init(a: SIMD2(4, 0), b: SIMD2(4, 3)),
            .init(a: SIMD2(4, 3), b: SIMD2(0, 3)),
            .init(a: SIMD2(0, 3), b: SIMD2(0, 0)),
        ]
        scene.items = [
            .init(category: "bed", center: SIMD2(2, 1.5), axisDeg: 0, widthM: 1.5, depthM: 2.0),
            .init(
                category: "television", center: SIMD2(3.5, 1.5), axisDeg: 0,
                widthM: 0.3, depthM: 0.2,
                photos: [.init(fileURL: URL(fileURLWithPath: "/tmp/t.jpg"), azimuthDeg: 200)]
            ),
        ]
        let warnings = EvidenceGuide.sceneWarnings(scene)
        XCTAssertEqual(warnings.count, 1)
        XCTAssertTrue(warnings[0].contains("床"), warnings[0])
        XCTAssertFalse(warnings[0].contains("电视"), warnings[0])
    }

    func testSceneWarningsEmptyWhenSatisfied() {
        var scene = FlatScene()
        scene.items = [
            .init(
                category: "sofa", center: .zero, axisDeg: 0, widthM: 2.0, depthM: 0.9,
                photos: [45.0, 135.0, 225.0].map {
                    .init(fileURL: URL(fileURLWithPath: "/tmp/s.jpg"), azimuthDeg: $0)
                }
            )
        ]
        XCTAssertTrue(EvidenceGuide.sceneWarnings(scene).isEmpty)
    }
}
