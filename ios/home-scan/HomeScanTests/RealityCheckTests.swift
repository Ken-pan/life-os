import XCTest
@testable import HomeScan

/// 现实核对端到端:扫描帧(有平移偏差)→ 配准 → 身份匹配 → 分类 + 真名采纳。
final class RealityCheckTests: XCTestCase {
    /// 6×4m 户型(px,36px/ft):外框 + 中隔墙 + 三件家具
    private func home() -> CanonicalHome {
        let ftPx = 36.0
        let mPx = ftPx / 0.3048
        func v(_ id: String, _ x: Double, _ y: Double) -> HomeOSProject.Vertex {
            .init(id: id, x: x * mPx, y: y * mPx)
        }
        let wallGraph = HomeOSProject.WallGraph(
            pxPerFt: ftPx,
            margin: .init(x: 0, y: 0),
            vertices: [
                v("a", 0, 0), v("b", 6, 0), v("c", 6, 4), v("d", 0, 4),
                v("e", 3.5, 0), v("f", 3.5, 2.2),
            ],
            edges: [
                .init(id: "e1", a: "a", b: "b", exterior: true),
                .init(id: "e2", a: "b", b: "c", exterior: true),
                .init(id: "e3", a: "c", b: "d", exterior: true),
                .init(id: "e4", a: "d", b: "a", exterior: true),
                .init(id: "e5", a: "e", b: "f", exterior: false),
            ]
        )
        func pl(_ id: String, _ label: String, _ kind: String,
                _ xM: Double, _ yM: Double, _ wM: Double, _ hM: Double,
                fixed: Bool? = nil, measured: Bool = true) -> HomeOSProject.Placement {
            var attrs = HomeOSProject.ObjectAttrs()
            if measured {
                attrs.measuredWIn = wM * 39.37
                attrs.measuredHIn = hM * 39.37
                attrs.confidence = "high"
            }
            return .init(
                id: id, kind: kind, label: label,
                x: xM * mPx, y: yM * mPx, w: wM * mPx, h: hM * mPx,
                rotation: 0, zoneId: nil,
                attrs: attrs.isEmpty ? nil : attrs, fixed: fixed
            )
        }
        return CanonicalHome(
            wallGraph: wallGraph,
            zones: [],
            placements: [
                pl("pl-1", "洗手台下柜", "cabinet", 0.4, 0.3, 1.2, 0.5),
                pl("pl-2", "工作大桌", "table", 4.0, 1.0, 1.6, 0.8),
                // 钉死件:没扫到不该进 missing
                pl("pl-3", "洗衣机", "washer", 0.3, 3.0, 0.7, 0.7, fixed: true),
                // 手录件(无实测):RoomPlan 本来认不出,也不进 missing
                pl("pl-4", "围挡", "divider", 5.5, 3.5, 0.05, 0.6, measured: false),
            ]
        )
    }

    /// 扫描帧:整体平移 (0.8, -0.5)m;柜子原位、桌子真挪了 0.6m、多出一把椅子
    private func scan() -> HomeOSProject {
        let ftPx = 36.0
        let mPx = ftPx / 0.3048
        let dx = 0.8, dy = -0.5
        func v(_ id: String, _ x: Double, _ y: Double) -> HomeOSProject.Vertex {
            .init(id: id, x: (x + dx) * mPx, y: (y + dy) * mPx)
        }
        let wallGraph = HomeOSProject.WallGraph(
            pxPerFt: ftPx,
            margin: .init(x: 0, y: 0),
            vertices: [
                v("a", 0, 0), v("b", 6, 0), v("c", 6, 4), v("d", 0, 4),
                v("e", 3.5, 0), v("f", 3.5, 2.2),
            ],
            edges: [
                .init(id: "e1", a: "a", b: "b", exterior: true),
                .init(id: "e2", a: "b", b: "c", exterior: true),
                .init(id: "e3", a: "c", b: "d", exterior: true),
                .init(id: "e4", a: "d", b: "a", exterior: true),
                .init(id: "e5", a: "e", b: "f", exterior: false),
            ]
        )
        func pl(_ id: String, _ kind: String, _ label: String,
                _ xM: Double, _ yM: Double, _ wM: Double, _ hM: Double) -> HomeOSProject.Placement {
            var attrs = HomeOSProject.ObjectAttrs()
            attrs.confidence = "high"
            return .init(
                id: id, kind: kind, label: label,
                x: (xM + dx) * mPx, y: (yM + dy) * mPx, w: wM * mPx, h: hM * mPx,
                rotation: 0, zoneId: nil, attrs: attrs, fixed: nil
            )
        }
        var project = PlanProjector.projectScene(MockScan.scene(), scanId: "t", nameZh: "t").project
        project.wallGraph = wallGraph
        project.placements = [
            pl("scan-1", "cabinet", "柜", 0.42, 0.32, 1.18, 0.52),
            pl("scan-2", "table", "桌", 4.6, 1.0, 1.62, 0.78),
            pl("scan-3", "chair", "椅", 2.0, 3.0, 0.5, 0.5),
        ]
        return project
    }

    func testRealityCheckClassifiesAndAdoptsNames() throws {
        var project = scan()
        let rc = try XCTUnwrap(RealityCheck.run(scan: project, home: home()), "配准应过门")
        XCTAssertNotNil(rc.registeredCm)
        XCTAssertLessThanOrEqual(rc.registeredCm ?? 99, 3)

        // 柜子原位、桌子挪了 ~0.6m ≈ 2ft
        XCTAssertEqual(rc.recognized.count, 2, "\(rc.recognized)")
        let cab = rc.recognized.first { $0.label == "洗手台下柜" }
        XCTAssertEqual(cab?.moved, false)
        let desk = rc.recognized.first { $0.label == "工作大桌" }
        XCTAssertEqual(desk?.moved, true)
        XCTAssertEqual(desk?.movedFt ?? 0, 2.0, accuracy: 0.4)

        // 椅子是新发现;洗衣机(钉死)与围挡(手录)都不进 missing
        XCTAssertEqual(rc.added.map(\.id), ["scan-3"])
        XCTAssertTrue(rc.missing.isEmpty, "\(rc.missing)")

        // 真名采纳:扫描件「柜」→「洗手台下柜」
        RealityCheck.adoptLabels(into: &project, result: rc)
        XCTAssertEqual(project.placements.first { $0.id == "scan-1" }?.label, "洗手台下柜")
        XCTAssertEqual(project.placements.first { $0.id == "scan-3" }?.label, "椅", "新件不改名")
    }

    func testMissingListsUnscannedMeasuredFurniture() throws {
        var h = home()
        // 户型里还有一台有实测、没钉死的架子 —— 这次没扫到,应被点名
        let mPx = 36.0 / 0.3048
        var attrs = HomeOSProject.ObjectAttrs()
        attrs.measuredWIn = 35
        attrs.confidence = "high"
        h.placements.append(.init(
            id: "pl-5", kind: "shelf", label: "宠物用品架",
            x: 2.0 * mPx, y: 3.2 * mPx, w: 0.9 * mPx, h: 0.4 * mPx,
            rotation: 0, zoneId: nil, attrs: attrs, fixed: nil
        ))
        let rc = try XCTUnwrap(RealityCheck.run(scan: scan(), home: h))
        XCTAssertTrue(rc.missing.contains("宠物用品架"), "\(rc.missing)")
    }
}
