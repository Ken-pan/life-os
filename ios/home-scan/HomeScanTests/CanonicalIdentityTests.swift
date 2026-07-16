import XCTest
@testable import HomeScan

/// 权威身份镜像与检测质量一轮修复的单测(数据取自 2026-07 真机扫描实证):
/// 1. ScanIdentity:cabinet 族补 wall_cabinet + elev 加减分项(与网页端契约一字不差)
/// 2. dedupMapped:>100cm 仲裁三分支(有权威参照 / 无参照不同级 / 无参照同级)
/// 3. reconcileWithCanonical:scanAliases 认亲(跨列表)+ identityLocked 压制
/// 4. CanonicalHomePayload:契约字段 attrs.scanAliases / attrs.identityLocked 透传
final class CanonicalIdentityTests: XCTestCase {
    private let pxPerM = PlanProjector.pxPerM // 118.11

    // MARK: - 造件小工具

    private func item(
        _ kind: String, _ label: String,
        cx: Double, cy: Double, w: Double, d: Double,
        conf: String? = nil, elevIn: Double? = nil, isFixture: Bool = false
    ) -> PlanProjector.MappedItem {
        PlanProjector.MappedItem(
            kind: kind, label: label, isFixture: isFixture,
            center: SIMD2(cx, cy), axisDeg: 0,
            widthPx: w, depthPx: d,
            elevIn: elevIn, confidence: conf
        )
    }

    private func ref(
        _ id: String, _ kind: String, _ label: String,
        x: Double, y: Double, w: Double, h: Double,
        elevIn: Double? = nil, isFixture: Bool = false,
        aliases: [String] = [], locked: Bool = false
    ) -> PlanProjector.CanonicalRef {
        .init(
            id: id, kind: kind, label: label,
            box: .init(x: x, y: y, w: w, h: h),
            elevIn: elevIn, isFixture: isFixture,
            scanAliases: aliases, identityLocked: locked
        )
    }

    // MARK: - ScanIdentity:kindFamily 镜像 + elev 项

    /// 真机实证:pl-18(cabinet,elev 69.5″)与权威「冰箱顶吊柜」(wall_cabinet,
    /// elev 66″)是同一件,以前被跨族一票否决。现在 cabinet 族含 wall_cabinet,
    /// elev 差 3.5″ ≤6″ 还要加分 —— 必须认得回来。
    func testWallCabinetJoinsCabinetFamily() {
        let prev = ScanIdentity.Object(
            id: "pl-18", kind: "wall_cabinet", label: "冰箱顶吊柜",
            x: 86.2, y: 794.6, w: 104, h: 51.9,
            confidence: "low", colorHex: nil, styleZh: nil, elevIn: 66
        )
        let next = ScanIdentity.Object(
            id: "s-1", kind: "cabinet", label: "柜",
            x: 79.1, y: 790.7, w: 106.8, h: 47.7,
            confidence: "low", colorHex: nil, styleZh: nil, elevIn: 69.5
        )
        let score = ScanIdentity.matchScore(prev, next)
        XCTAssertGreaterThan(score, ScanIdentity.acceptScore, "吊柜应认回柜族,不再跨族否决")
        let m = ScanIdentity.match(prev: [prev], next: [next])
        XCTAssertEqual(m.pairs.count, 1)
        XCTAssertEqual(m.pairs.first?.prevId, "pl-18")

        // 跨族仍一票否决:鸟笼 vs 冰箱
        let cage = ScanIdentity.Object(
            id: "pl-26", kind: "bird_cage", label: "鸟笼",
            x: 0, y: 0, w: 100, h: 100,
            confidence: nil, colorHex: nil, styleZh: nil
        )
        var fridge = cage
        fridge.id = "s-2"
        fridge.kind = "fridge"
        XCTAssertEqual(ScanIdentity.matchScore(cage, fridge), 0, "跨族(非别名路径)仍必须 0 分")
    }

    /// elev 项契约(与 scan-identity.js 一字不差):加分 +0.1 仅当双方都实测过
    /// 且差 ≤6″;罚分 -0.15 在差 >18″ 时(一方缺省视为 0 落地);双方都缺 → 0
    /// ——「都默认落地」不算证据,否则全场落地家具白涨 0.1 顶翻既有打分边界。
    func testElevScoringTerm() {
        func obj(_ elevIn: Double?) -> ScanIdentity.Object {
            .init(
                id: "o", kind: "cabinet", label: "柜",
                x: 100, y: 100, w: 120, h: 60,
                confidence: nil, colorHex: nil, styleZh: nil, elevIn: elevIn
            )
        }
        // 同尺寸同位:size/pos 各满分 → 0.9 基准
        XCTAssertEqual(ScanIdentity.matchScore(obj(66), obj(69.5)), 1.0, accuracy: 0.001,
                       "双方实测且差 3.5″ ≤6″ → +0.1")
        XCTAssertEqual(ScanIdentity.matchScore(obj(nil), obj(nil)), 0.9, accuracy: 0.001,
                       "双方都缺 elevIn → 不算证据,不加分(锁死镜像行为)")
        XCTAssertEqual(ScanIdentity.matchScore(obj(nil), obj(4)), 0.9, accuracy: 0.001,
                       "一方缺省(视为 0)差 4″ ≤6″ → 不是双方实测,不加分也不罚")
        XCTAssertEqual(ScanIdentity.matchScore(obj(66), obj(78)), 0.9, accuracy: 0.001,
                       "差 12″ 在 6-18″ 之间 → 不加不罚")
        XCTAssertEqual(ScanIdentity.matchScore(obj(nil), obj(69.5)), 0.75, accuracy: 0.001,
                       "落地 vs 吊柜(差 69.5″ >18″)→ -0.15")
        // 契约常数本体(两端对照的锚)
        XCTAssertEqual(ScanIdentity.elevSameMaxIn, 6.0)
        XCTAssertEqual(ScanIdentity.elevSameBonus, 0.1)
        XCTAssertEqual(ScanIdentity.elevDiffMinIn, 18.0)
        XCTAssertEqual(ScanIdentity.elevDiffPenalty, 0.15)
    }

    // MARK: - dedupMapped:>100cm 仲裁三分支

    /// 真机实证还原:厨房上柜整排被检成一只 12.3ft 巨柜(441.6px)+ 另一次
    /// 6.2ft(224px),差 ~184cm;权威「厨房上柜」8.2ft(294×42px)几何吻合
    /// → 与权威更接近的 224px 那次赢,大框不许赢。
    func testSplitArbitrationPrefersCloserToCanonical() {
        let big = item("cabinet", "柜", cx: 406.5, cy: 827.7, w: 441.6, d: 51, conf: "low")
        let small = item("cabinet", "柜", cx: 447, cy: 828, w: 224, d: 51, conf: "low")
        let upper = ref("pl-32", "wall_cabinet", "厨房上柜", x: 335, y: 810, w: 294, h: 42)
        var warnings: [String] = []
        let kept = PlanProjector.dedupMapped([big, small], refs: [upper], warnings: &warnings)
        XCTAssertEqual(kept.count, 1)
        XCTAssertEqual(kept[0].widthPx, 224, accuracy: 0.1, "该取与权威 294px 更接近的 224px,不是 441.6px 大框")
        XCTAssertTrue(
            warnings.contains { $0.contains("疑似整排柜被并成一件") && $0.contains("拆分核对") },
            warnings.joined(separator: " / ")
        )
    }

    /// 无权威参照、置信度不同级:仍是置信度高者赢(哪怕它更大)
    func testSplitArbitrationConfidenceStillWinsWithoutRef() {
        let big = item("cabinet", "柜", cx: 406.5, cy: 827.7, w: 441.6, d: 51, conf: "medium")
        let small = item("cabinet", "柜", cx: 447, cy: 828, w: 224, d: 51, conf: "low")
        var warnings: [String] = []
        let kept = PlanProjector.dedupMapped([big, small], refs: [], warnings: &warnings)
        XCTAssertEqual(kept.count, 1)
        XCTAssertEqual(kept[0].widthPx, 441.6, accuracy: 0.1, "medium > low,置信度分级优先")
        XCTAssertTrue(warnings.contains { $0.contains("疑似整排柜被并成一件") })
    }

    /// 无权威参照、同级:取**更小**的那件(RoomPlan 的误检偏大不偏小)——
    /// 以前「大框自动赢」,方向反了
    func testSplitArbitrationSameRankPrefersSmaller() {
        let big = item("cabinet", "柜", cx: 406.5, cy: 827.7, w: 441.6, d: 51, conf: "low")
        let small = item("cabinet", "柜", cx: 447, cy: 828, w: 224, d: 51, conf: "low")
        var warnings: [String] = []
        let kept = PlanProjector.dedupMapped([big, small], refs: [], warnings: &warnings)
        XCTAssertEqual(kept.count, 1)
        XCTAssertEqual(kept[0].widthPx, 224, accuracy: 0.1, "low-vs-low 取更小,不再大框获胜")
    }

    /// <100cm 的原有合并行为不变:同级仍取更大(更完整)的那件,警告阈值仍 10cm
    func testSubMeterMergeBehaviorUnchanged() {
        let a = item("cabinet", "柜", cx: 400, cy: 800, w: 100, d: 51, conf: "low")
        let b = item("cabinet", "柜", cx: 410, cy: 800, w: 130, d: 51, conf: "low")
        var warnings: [String] = []
        let kept = PlanProjector.dedupMapped([a, b], refs: [], warnings: &warnings)
        XCTAssertEqual(kept.count, 1)
        XCTAssertEqual(kept[0].widthPx, 130, accuracy: 0.1, "差 ~25cm(<100cm)同级仍取更大")
        XCTAssertTrue(warnings.contains { $0.contains("已取更可信一次") })
        XCTAssertFalse(warnings.contains { $0.contains("疑似整排柜") })
    }

    // MARK: - reconcileWithCanonical:别名认亲 + 锁定压制

    /// 真机实证还原:fx-1「冰箱」(1064.3,688.8,104.9×124.5)其实是权威 pl-26
    /// 「鸟笼」(1100.3,735.7,111.7×116.3)。IoU≈0.26 <0.3,但中心互含 → 认亲;
    /// identityLocked → kind/label/尺寸全用权威值,且跨列表落回 placement。
    func testScanAliasAdoptionCrossList() {
        let fake = item(
            "fridge", "冰箱",
            cx: 1064.3 + 104.9 / 2, cy: 688.8 + 124.5 / 2,
            w: 104.9, d: 124.5, conf: "low", isFixture: true
        )
        let cage = ref(
            "pl-26", "bird_cage", "鸟笼",
            x: 1100.3, y: 735.7, w: 111.7, h: 116.3,
            aliases: ["fridge"], locked: true
        )
        var warnings: [String] = []
        let out = PlanProjector.reconcileWithCanonical([fake], refs: [cage], warnings: &warnings)
        XCTAssertEqual(out.count, 1, "认亲成功不该压制")
        XCTAssertEqual(out[0].kind, "bird_cage", "kind 沿用权威")
        XCTAssertEqual(out[0].label, "鸟笼", "label 沿用权威")
        XCTAssertFalse(out[0].isFixture, "权威是 placement,跨列表跟着走")
        XCTAssertEqual(out[0].widthPx, 111.7, accuracy: 0.1, "identityLocked → 尺寸用权威值")
        XCTAssertEqual(out[0].depthPx, 116.3, accuracy: 0.1)
        XCTAssertTrue(warnings.isEmpty, warnings.joined(separator: " / "))
    }

    /// 没有别名(用户只锁了身份):认不上、压在锁定件足迹上的跨族检测
    /// 直接压制不进 payload,并留指名道姓的警告
    func testIdentityLockedSuppression() {
        let fake = item(
            "fridge", "冰箱",
            cx: 1064.3 + 104.9 / 2, cy: 688.8 + 124.5 / 2,
            w: 104.9, d: 124.5, conf: "low", isFixture: true
        )
        let cage = ref(
            "pl-26", "bird_cage", "鸟笼",
            x: 1100.3, y: 735.7, w: 111.7, h: 116.3,
            locked: true
        )
        var warnings: [String] = []
        let out = PlanProjector.reconcileWithCanonical([fake], refs: [cage], warnings: &warnings)
        XCTAssertTrue(out.isEmpty, "疑似误检应被压制,payload 里不该出现第二台冰箱")
        XCTAssertEqual(warnings, ["压制 1 件疑似误检(冰箱 → 鸟笼,权威已锁定)"])
    }

    /// 立体分层共存不压制:吊柜(elev 69.5″)叠在锁定的冰箱(落地)正上方,
    /// elev 差 >18″ —— 是合法叠放,不是误检
    func testSuppressionSkipsDifferentElevationLayer() {
        let hanging = item(
            "cabinet", "柜",
            cx: 132.5, cy: 814.6, w: 106.8, d: 47.7,
            conf: "low", elevIn: 69.5
        )
        let fridge = ref(
            "fx-2", "fridge", "冰箱",
            x: 87.3, y: 748.3, w: 102.2, h: 101.2,
            isFixture: true, locked: true
        )
        var warnings: [String] = []
        let out = PlanProjector.reconcileWithCanonical([hanging], refs: [fridge], warnings: &warnings)
        XCTAssertEqual(out.count, 1, "吊柜与冰箱是立体叠放,不该被压制")
        XCTAssertTrue(warnings.isEmpty, warnings.joined(separator: " / "))
    }

    /// 未锁定的权威件不压制:锁是用户给的授权,没锁就只警不杀 —— 这里连警都没有
    func testNoSuppressionWithoutLock() {
        let fake = item(
            "fridge", "冰箱",
            cx: 1064.3 + 104.9 / 2, cy: 688.8 + 124.5 / 2,
            w: 104.9, d: 124.5, conf: "low", isFixture: true
        )
        let cage = ref(
            "pl-26", "bird_cage", "鸟笼",
            x: 1100.3, y: 735.7, w: 111.7, h: 116.3
        )
        var warnings: [String] = []
        let out = PlanProjector.reconcileWithCanonical([fake], refs: [cage], warnings: &warnings)
        XCTAssertEqual(out.count, 1)
        XCTAssertEqual(out[0].kind, "fridge", "没锁没别名 → 原样保留")
    }

    // MARK: - 全链路:projectScene 带权威副本

    /// 4×3m 房 + 「refrigerator」误检;权威副本同一位置是锁定的鸟笼(placement,
    /// 带 scanAliases)→ 投影产物里应是 placements 的鸟笼,fixtures 无冰箱
    func testProjectSceneAdoptsAliasEndToEnd() throws {
        var s = FlatScene()
        s.walls = [
            .init(a: SIMD2(0, 0), b: SIMD2(4, 0)),
            .init(a: SIMD2(4, 0), b: SIMD2(4, 3)),
            .init(a: SIMD2(4, 3), b: SIMD2(0, 3)),
            .init(a: SIMD2(0, 3), b: SIMD2(0, 0)),
        ]
        s.rooms = [.init(labels: ["livingRoom"], points: [
            SIMD2(0, 0), SIMD2(4, 0), SIMD2(4, 3), SIMD2(0, 3),
        ])]
        s.items = [
            .init(category: "refrigerator", center: SIMD2(3.3, 2.3),
                  axisDeg: 0, widthM: 0.9, depthM: 1.05, confidence: "low")
        ]

        // 第一遍投影(无权威)拿墙图与误检落点 —— 权威副本用同一坐标系造出来
        let base = PlanProjector.project(s, scanId: "t", nameZh: "t")
        let fake = try XCTUnwrap(base.fixtures.first { $0.kind == "fridge" })
        let home = CanonicalHome(
            wallGraph: base.wallGraph,
            zones: [],
            placements: [
                .init(
                    id: "pl-26", kind: "bird_cage", label: "鸟笼",
                    x: fake.bounds.x + 6, y: fake.bounds.y + 6,
                    w: fake.bounds.w, h: fake.bounds.h,
                    rotation: 0, zoneId: nil, attrs: nil, fixed: nil
                )
            ],
            identityHints: ["pl-26": .init(scanAliases: ["fridge"], identityLocked: true)]
        )
        let p = PlanProjector.projectScene(
            s, scanId: "t", nameZh: "t", canonicalHome: home
        ).project
        XCTAssertTrue(p.fixtures.filter { $0.kind == "fridge" }.isEmpty, "误检冰箱不该进 fixtures")
        let cage = try XCTUnwrap(p.placements.first { $0.kind == "bird_cage" }, "鸟笼应落 placements")
        XCTAssertEqual(cage.label, "鸟笼")
        XCTAssertEqual(cage.w, fake.bounds.w, accuracy: 1.5, "identityLocked → 尺寸用权威值")
    }

    // MARK: - 契约字段透传:attrs.scanAliases / attrs.identityLocked

    func testCanonicalPayloadPassesThroughIdentityHints() throws {
        let json = """
        {
          "wallGraph": { "pxPerFt": 36, "margin": { "x": 24, "y": 24 },
            "vertices": [], "edges": [] },
          "zones": [],
          "graphOpenings": [
            { "id": "op-1", "edgeId": "e-3", "offsetIn": 12, "spanIn": 35.4,
              "type": "door", "style": "swing", "swing": "in" },
            { "id": "op-2", "edgeId": "e-1", "offsetIn": 40, "spanIn": 47,
              "type": "window" }
          ],
          "placements": [
            { "id": "pl-26", "kind": "bird_cage", "label": "鸟笼",
              "x": 1100.3, "y": 735.7, "w": 111.7, "h": 116.3, "rotation": 0,
              "attrs": { "confidence": "low",
                         "scanAliases": ["fridge"], "identityLocked": true } },
            { "id": "pl-2", "kind": "bed", "label": "床",
              "x": 731.8, "y": 23.3, "w": 231.4, "h": 251.5, "rotation": 0 }
          ],
          "fixtures": [
            { "id": "fx-2", "kind": "fridge", "label": "冰箱",
              "bounds": { "x": 87.3, "y": 748.3, "w": 102.2, "h": 101.2 },
              "attrs": { "identityLocked": true } }
          ]
        }
        """
        let payload = try JSONDecoder().decode(
            CanonicalHomePayload.self, from: Data(json.utf8)
        )
        let home = try XCTUnwrap(payload.toCanonicalHome())
        XCTAssertEqual(home.placements.count, 2)
        XCTAssertEqual(home.fixtures?.count, 1)
        XCTAssertEqual(home.graphOpenings?.count, 2, "权威门窗应透传(覆盖差报的基准)")
        XCTAssertEqual(home.graphOpenings?.first?.type, "door")

        let cageHint = try XCTUnwrap(home.identityHints?["pl-26"])
        XCTAssertEqual(cageHint.scanAliases, ["fridge"])
        XCTAssertTrue(cageHint.identityLocked)
        let fridgeHint = try XCTUnwrap(home.identityHints?["fx-2"])
        XCTAssertEqual(fridgeHint.scanAliases, [])
        XCTAssertTrue(fridgeHint.identityLocked)
        XCTAssertNil(home.identityHints?["pl-2"], "没有提示字段的件不该背 hint")

        // 缓存 roundtrip:身份提示/门窗存得住(断网也不丢用户纠正)
        let data = try JSONEncoder().encode(home)
        let back = try JSONDecoder().decode(CanonicalHome.self, from: data)
        XCTAssertEqual(back.identityHints?["pl-26"]?.scanAliases, ["fridge"])
        XCTAssertEqual(back.fixtures?.first?.kind, "fridge")
        XCTAssertEqual(back.graphOpenings?.count, 2)
    }

    /// 旧缓存(没有 graphOpenings/fixtures/identityHints 字段)解码不崩 —— 全为 nil
    func testOldCacheWithoutNewFieldsStillDecodes() throws {
        let oldJSON = """
        {
          "wallGraph": { "pxPerFt": 36, "margin": { "x": 24, "y": 24 },
            "vertices": [], "edges": [] },
          "zones": [],
          "placements": []
        }
        """
        let home = try JSONDecoder().decode(CanonicalHome.self, from: Data(oldJSON.utf8))
        XCTAssertNil(home.graphOpenings)
        XCTAssertNil(home.fixtures)
        XCTAssertNil(home.identityHints)
        XCTAssertNil(home.storageZones)
    }
}
