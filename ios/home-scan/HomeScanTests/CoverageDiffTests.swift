import XCTest
@testable import HomeScan

/// 上传前覆盖差报单测。
///
/// 布局按 2026-07-15 真机那轮建模(缩了尺寸,几何关系保真):权威 5 分区
/// (含阳台洗衣区)、10 门窗;真扫只回来 4 分区、7 门窗、4 张机位全挤在
/// 厨房/餐区 —— 复核页当时零提示,这套断言就是那次哑巴的验尸报告。
final class CoverageDiffTests: XCTestCase {
    // MARK: - 造数据

    private func point(_ x: Double, _ y: Double) -> HomeOSProject.Point {
        HomeOSProject.Point(x: x, y: y)
    }

    private func rect(_ x0: Double, _ y0: Double, _ x1: Double, _ y1: Double) -> [HomeOSProject.Point] {
        [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)]
    }

    private func zone(_ id: String, _ name: String, _ polygon: [HomeOSProject.Point]) -> HomeOSProject.Zone {
        HomeOSProject.Zone(id: id, nameZh: name, polygon: polygon)
    }

    private func wallGraph(_ minX: Double, _ minY: Double, _ maxX: Double, _ maxY: Double) -> HomeOSProject.WallGraph {
        HomeOSProject.WallGraph(
            pxPerFt: 36,
            margin: point(24, 24),
            vertices: [
                HomeOSProject.Vertex(id: "v1", x: minX, y: minY),
                HomeOSProject.Vertex(id: "v2", x: maxX, y: maxY),
            ],
            edges: []
        )
    }

    private func openings(_ n: Int) -> [HomeOSProject.GraphOpening] {
        (0..<n).map {
            HomeOSProject.GraphOpening(
                id: "op-\($0)", edgeId: "e-0", offsetIn: 0, spanIn: 30,
                type: "door", style: nil, swing: nil
            )
        }
    }

    private func viewpoint(_ x: Double, _ y: Double) -> HomeOSProject.Viewpoint {
        HomeOSProject.Viewpoint(
            id: "vp-\(Int(x))-\(Int(y))", x: x, y: y, heading: 0, fovDeg: 60,
            takenAt: nil, camera: nil, photoPath: nil
        )
    }

    private func scan(
        wg: HomeOSProject.WallGraph,
        zones: [HomeOSProject.Zone],
        openingCount: Int,
        viewpoints: [HomeOSProject.Viewpoint],
        scope: String? = nil
    ) -> HomeOSProject {
        HomeOSProject(
            wallGraph: wg,
            graphOpenings: openings(openingCount),
            zones: zones,
            placements: [],
            fixtures: [],
            viewpoints: viewpoints,
            meta: HomeOSProject.Meta(
                id: "scan-test", nameZh: "测试扫描", sqft: nil,
                scanWarnings: [], sourceNote: nil, scanScope: scope
            )
        )
    }

    /// 权威副本:5 分区,阳台在右上角(真家的洗衣区就在那)
    private func canonical() -> CanonicalHome {
        CanonicalHome(
            wallGraph: HomeOSProject.WallGraph(
                pxPerFt: 36,
                margin: point(24, 24),
                vertices: [
                    HomeOSProject.Vertex(id: "v1", x: 0, y: 0),
                    HomeOSProject.Vertex(id: "v2", x: 1210, y: 850),
                ],
                edges: []
            ),
            zones: [
                zone("c-bath", "卫生间", rect(0, 0, 480, 500)),
                zone("c-bed", "卧室", rect(480, 0, 1040, 480)),
                zone("c-balcony", "阳台", rect(1040, 0, 1210, 420)),
                zone("c-kitchen", "厨房", rect(0, 500, 630, 850)),
                zone("c-dining", "餐区", rect(630, 500, 1210, 850)),
            ],
            placements: [],
            storageZones: nil
        )
    }

    /// 真机那轮的等比缩影:扫描坐标整体是权威的一半(考验包围盒归一),
    /// 4 个分区盖住了除阳台外的全部;4 张机位全在厨房/餐区
    private func realWorldScan(scope: String? = nil) -> HomeOSProject {
        scan(
            wg: wallGraph(0, 0, 605, 425),
            zones: [
                zone("z-1", "厨房 1", rect(0, 250, 315, 425)),
                zone("z-2", "厨房 2", rect(315, 250, 605, 425)),
                zone("z-3", "卧室", rect(240, 0, 520, 240)),
                zone("z-4", "卫生间", rect(0, 0, 240, 250)),
            ],
            openingCount: 7,
            viewpoints: [
                viewpoint(100, 300), viewpoint(200, 350),   // 厨房 1
                viewpoint(400, 300), viewpoint(500, 350),   // 厨房 2
            ],
            scope: scope
        )
    }

    // MARK: - 真机那轮:三类缺口都得叫出来

    func testRealScanPatternRaisesAllThreeWarningClasses() {
        let out = CoverageDiff.warnings(
            scan: realWorldScan(),
            canonical: canonical(),
            canonicalOpeningCount: 10
        )

        // 1. 阳台(洗衣区)整间没扫到 —— 且只有它,别把认领成功的四间也报了
        let zoneWarnings = out.filter { $0.contains("没扫到") }
        XCTAssertEqual(zoneWarnings.count, 1, "只有阳台该报:\(out)")
        XCTAssertTrue(zoneWarnings[0].contains("阳台"), "报错了房间:\(zoneWarnings)")
        XCTAssertTrue(zoneWarnings[0].contains("保持"), "得说清「拉取时该区会保持原样」")

        // 2. 门窗 7/10 = 恰好压 70% 线 —— 压线也要说(这就是真机数字)
        let openingWarnings = out.filter { $0.contains("门窗") }
        XCTAssertEqual(openingWarnings.count, 1)
        XCTAssertTrue(openingWarnings[0].contains("少 3 个"), "\(openingWarnings)")

        // 3. 卧室/卫生间零状态照;厨房两间各 2 张不该被点名
        let vpWarnings = out.filter { $0.contains("状态照") }
        XCTAssertEqual(vpWarnings.count, 2, "\(out)")
        XCTAssertTrue(vpWarnings.contains { $0.contains("卧室") })
        XCTAssertTrue(vpWarnings.contains { $0.contains("卫生间") })
        XCTAssertFalse(out.contains { $0.contains("厨房") && $0.contains("状态照") })
    }

    func testFullyCoveredScanIsSilent() {
        // 盖满 5 间、门窗齐、每间 2 张机位 → 一条都不该有
        let c = canonical()
        let full = scan(
            wg: wallGraph(0, 0, 1210, 850),
            zones: c.zones.map { zone("s-\($0.id)", $0.nameZh, $0.polygon) },
            openingCount: 10,
            viewpoints: c.zones.flatMap { z -> [HomeOSProject.Viewpoint] in
                let ctr = CoverageDiff.centroid(z.polygon)
                return [viewpoint(ctr.x - 10, ctr.y), viewpoint(ctr.x + 10, ctr.y)]
            }
        )
        XCTAssertEqual(
            CoverageDiff.warnings(scan: full, canonical: c, canonicalOpeningCount: 10),
            []
        )
    }

    // MARK: - 门窗阈值边界

    func testOpeningThresholdBoundary() {
        func fires(_ scanN: Int, _ canonN: Int?) -> Bool {
            !CoverageDiff.openingWarnings(scanCount: scanN, canonicalCount: canonN).isEmpty
        }
        XCTAssertFalse(fires(8, 10), "8/10 = 80%,正常测量抖动,别叫")
        XCTAssertTrue(fires(7, 10), "7/10 恰好压 70% 线 —— 真机案例,必须叫")
        XCTAssertTrue(fires(3, 10))
        XCTAssertFalse(fires(12, 10), "比档案还多不算缺")
        XCTAssertFalse(fires(0, 0), "老档案自己没有门窗 —— 0 的 70% 还是 0,别除出鬼来")
        XCTAssertFalse(fires(3, nil), "档案没带门窗数(CanonicalHome 还没暴露)→ 静默跳过")
        XCTAssertTrue(
            CoverageDiff.openingWarnings(scanCount: 7, canonicalCount: 10)[0].contains("少 3 个")
        )
    }

    // MARK: - 房间更新(partial)只查机位

    func testPartialScopeSkipsZoneAndOpeningChecks() {
        // 故意只扫了一间 —— 「其他四间没扫到」「门窗少了」全是废话,只有机位该管
        let one = scan(
            wg: wallGraph(0, 0, 605, 425),
            zones: [zone("z-1", "卧室", rect(240, 0, 520, 240))],
            openingCount: 1,
            viewpoints: [viewpoint(400, 100)],
            scope: "partial"
        )
        let out = CoverageDiff.warnings(scan: one, canonical: canonical(), canonicalOpeningCount: 10)
        XCTAssertFalse(out.contains { $0.contains("没扫到") }, "\(out)")
        XCTAssertFalse(out.contains { $0.contains("门窗") }, "\(out)")
        XCTAssertEqual(out.filter { $0.contains("状态照") }.count, 1)
        XCTAssertTrue(out[0].contains("只有 1 张"))
    }

    // MARK: - 机位归属

    func testViewpointJustOutsidePolygonCountsForNearestZone() {
        // 站在门洞里拍的机位落在分区多边形外一点点 —— 归给最近的分区,别记成无主
        let s = scan(
            wg: wallGraph(0, 0, 605, 425),
            zones: [
                zone("z-1", "厨房", rect(0, 250, 315, 425)),
                zone("z-2", "卧室", rect(240, 0, 520, 240)),
            ],
            openingCount: 10,
            viewpoints: [
                viewpoint(100, 245),  // 厨房上沿外 5px(门洞)
                viewpoint(100, 300),  // 厨房内
                viewpoint(400, 100), viewpoint(450, 200),  // 卧室内
            ],
            scope: "partial"  // 只验机位归属,关掉分区/门窗噪音
        )
        XCTAssertEqual(CoverageDiff.warnings(scan: s, canonical: canonical()), [])
    }

    func testZeroViewpointZoneNamesItself() {
        let out = CoverageDiff.viewpointWarnings(scan: scan(
            wg: wallGraph(0, 0, 605, 425),
            zones: [zone("z-1", "卫生间", rect(0, 0, 240, 250))],
            openingCount: 0,
            viewpoints: []
        ))
        XCTAssertEqual(out.count, 1)
        XCTAssertTrue(out[0].contains("卫生间"))
        XCTAssertTrue(out[0].contains("没留下状态照"))
    }

    // MARK: - 退化输入不炸、不刷屏

    func testDegenerateInputsStaySilent() {
        let c = canonical()
        // 扫描一个分区都没转出来:上游已经坏了,别再叠 5 条「没扫到」
        let empty = scan(wg: wallGraph(0, 0, 605, 425), zones: [], openingCount: 10, viewpoints: [])
        XCTAssertEqual(CoverageDiff.zoneWarnings(scan: empty, canonical: c), [])
        // 包围盒退化(顶点重合)→ 归一算不了,分区差报整个跳过
        let flat = scan(wg: wallGraph(100, 100, 100, 100), zones: [zone("z", "卧室", rect(0, 0, 10, 10))], openingCount: 10, viewpoints: [])
        XCTAssertEqual(CoverageDiff.zoneWarnings(scan: flat, canonical: c), [])
        // 权威分区多边形不足 3 点 → 不参与认领也不报
        let degenerateCanon = CanonicalHome(
            wallGraph: c.wallGraph,
            zones: [HomeOSProject.Zone(id: "c-x", nameZh: "碎片", polygon: [point(0, 0)])],
            placements: [], storageZones: nil
        )
        XCTAssertEqual(
            CoverageDiff.zoneWarnings(scan: realWorldScan(), canonical: degenerateCanon),
            []
        )
    }

    // MARK: - 几何小件

    func testCentroidAndContains() {
        let square = rect(0, 0, 100, 100)
        let c = CoverageDiff.centroid(square)
        XCTAssertEqual(c.x, 50, accuracy: 1e-9)
        XCTAssertEqual(c.y, 50, accuracy: 1e-9)

        // L 形:面积质心要偏向大的一翼,顶点平均会算歪 —— 真机厨房就是 L 形
        let l: [HomeOSProject.Point] = [
            point(0, 0), point(100, 0), point(100, 20),
            point(20, 20), point(20, 100), point(0, 100),
        ]
        let lc = CoverageDiff.centroid(l)
        let vertexMean = HomeOSProject.Point(x: 40, y: 40)
        XCTAssertLessThan(lc.x, vertexMean.x, "面积质心该被两翼往角上拽")
        XCTAssertLessThan(lc.y, vertexMean.y)

        XCTAssertTrue(CoverageDiff.contains(polygon: square, point: point(50, 50)))
        XCTAssertFalse(CoverageDiff.contains(polygon: square, point: point(150, 50)))
        XCTAssertFalse(CoverageDiff.contains(polygon: [point(0, 0), point(1, 1)], point: point(0, 0)))
    }

    func testNormalizerMapsScanBBoxOntoCanonical() {
        // 扫描系是权威系的一半 + 无平移;(302.5, 212.5) 是扫描中心 → 权威中心
        let toCanon = CoverageDiff.normalizer(
            from: wallGraph(0, 0, 605, 425).vertices,
            to: canonical().wallGraph.vertices
        )
        XCTAssertNotNil(toCanon)
        let mapped = toCanon!(point(302.5, 212.5))
        XCTAssertEqual(mapped.x, 605, accuracy: 1e-6)
        XCTAssertEqual(mapped.y, 425, accuracy: 1e-6)
    }
}
