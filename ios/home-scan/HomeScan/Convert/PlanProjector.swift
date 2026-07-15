import Foundation

/// FlatScene(米,俯视 2D) → HomeOS plan px。
/// 约定:pxPerFt=36(3 px/英寸);y 轴向下;heading 0=平面图正上、顺时针。
/// FlatScene 已是俯视图(x 右、z 作 y 向下),与平面图同手性,这里不做镜像;
/// 角度一律 atan2(y, x) 惯例。手性与 heading 零点由 PlanProjectorTests 的
/// 非对称 fixture 锁死 —— 改这里必须过那组测试。
enum PlanProjector {
    static let pxPerFt = 36.0
    static let pxPerM = 3.280839895 * 36.0   // 米 → plan px
    static let marginPx = 24.0
    static let gridPx = 3.0                  // 1 英寸
    static let weldTolPx = 6.0               // 2 英寸内的端点焊成一个顶点
    static let minEdgePx = 12.0              // 4 英寸以下的墙段丢弃
    static let openingSnapTolPx = 24.0       // 门窗中心到宿主墙的最大距离(8 英寸)

    // MARK: - 入口

    static func project(_ scene: FlatScene, scanId: String, nameZh: String) -> HomeOSProject {
        var warnings = scene.warnings

        // 1) 主方向旋转:让多数墙轴对齐
        let phi = dominantRotation(scene.walls)

        // 2) 全场变换(旋转 → 米转 px),平移量待会儿由包围盒决定
        var pts: [SIMD2<Double>] = []
        let rawWalls = scene.walls.map { w in
            (a: rotate(w.a, phi) * pxPerM, b: rotate(w.b, phi) * pxPerM)
        }
        for w in rawWalls { pts.append(w.a); pts.append(w.b) }
        let rawRooms = scene.rooms.map { r in r.points.map { rotate($0, phi) * pxPerM } }
        for r in rawRooms { pts.append(contentsOf: r) }
        guard !pts.isEmpty else {
            return emptyProject(scanId: scanId, nameZh: nameZh, warnings: ["扫描里没有墙体"])
        }
        let minX = pts.map(\.x).min()!
        let minY = pts.map(\.y).min()!
        let shift = SIMD2(marginPx - minX, marginPx - minY)
        /// 米坐标 → 最终 plan px
        func toPlan(_ p: SIMD2<Double>) -> SIMD2<Double> {
            rotate(p, phi) * pxPerM + shift
        }

        // 3) 墙:近轴拉直 + 偏轴碎片过滤 → 顶点焊接 + T 交点拆分 + 去短去重
        let cleaned = cleanSegments(
            rawWalls.map { (a: $0.a + shift, b: $0.b + shift) },
            warnings: &warnings
        )
        let graph = buildGraph(segments: cleaned)

        // 4) 门窗投影到宿主边
        var openings: [HomeOSProject.GraphOpening] = []
        for (i, op) in scene.openings.enumerated() {
            let c = toPlan(op.center)
            let spanIn = op.widthM * pxPerM / gridPx // px → 英寸(3px/in)
            guard let hit = nearestEdge(to: c, in: graph, maxDist: openingSnapTolPx) else {
                warnings.append("有一处\(op.kind == .window ? "窗" : "门")找不到宿主墙,已跳过")
                continue
            }
            let offsetIn = max(0, min(hit.edgeLenIn - spanIn, hit.projIn - spanIn / 2))
            openings.append(
                HomeOSProject.GraphOpening(
                    id: "op-\(i + 1)",
                    edgeId: hit.edgeId,
                    offsetIn: round1(offsetIn),
                    spanIn: round1(spanIn),
                    type: op.kind == .window ? "window" : "door",
                    style: op.kind == .window ? "sliding" : (op.kind == .door ? "swing" : nil),
                    swing: op.kind == .door ? "in" : nil
                )
            )
        }

        // 5) 分区:重叠的扫描地板合并(同一空间扫两遍会得到两块互相覆盖的地板,
        //    直接双算面积、房间填充也会叠)——重叠 >60% 的并进大块,标签合并
        var zoneDrafts: [(labels: [String], poly: [SIMD2<Double>])] = []
        for (i, room) in scene.rooms.enumerated() {
            let poly = rawRooms[i].map { $0 + shift }
            guard poly.count >= 3 else { continue }
            zoneDrafts.append((labels: room.labels, poly: poly))
        }
        zoneDrafts = mergeOverlappingZones(zoneDrafts, warnings: &warnings)
        let zones = zoneDrafts.enumerated().map { i, d in
            HomeOSProject.Zone(
                id: "z-\(i + 1)",
                nameZh: KindMaps.zoneName(for: d.labels),
                polygon: d.poly.map { .init(x: round1($0.x), y: round1($0.y)) }
            )
        }
        if zones.isEmpty { warnings.append("扫描未识别出房间地板,平面图分区为空") }

        // 6) 物体 → placements / fixtures(先跨房间去重:重叠区域同一件家具会被
        //    两次扫描各记一遍,真扫实测灶台×4、冰箱×2)
        var placements: [HomeOSProject.Placement] = []
        var fixtures: [HomeOSProject.Fixture] = []
        for item in dedupItems(scene.items, warnings: &warnings) {
            let c = toPlan(item.center)
            let axis = item.axisDeg + phi * 180 / .pi
            let snapped = snappedRotation(axisDeg: axis)
            let wPx = item.widthM * pxPerM
            let dPx = item.depthM * pxPerM
            // 局部 x 轴贴屏幕横向(0/180)时,footprint 宽=物宽;竖向(90/270)时对调
            let fw = (snapped == 0 || snapped == 180) ? wPx : dPx
            let fh = (snapped == 0 || snapped == 180) ? dPx : wPx
            let x = round1(c.x - fw / 2)
            let y = round1(c.y - fh / 2)
            if let fx = KindMaps.fixtureKinds[item.category] {
                fixtures.append(
                    HomeOSProject.Fixture(
                        id: "fx-\(fixtures.count + 1)",
                        kind: fx.kind,
                        label: fx.label,
                        bounds: .init(x: x, y: y, w: round1(fw), h: round1(fh)),
                        rotation: snapped
                    )
                )
            } else if let pl = KindMaps.placementKinds[item.category] {
                placements.append(
                    HomeOSProject.Placement(
                        id: "pl-\(placements.count + 1)",
                        kind: pl.kind,
                        label: pl.label,
                        x: x,
                        y: y,
                        w: round1(fw),
                        h: round1(fh),
                        rotation: snapped,
                        zoneId: zoneId(containing: c, zones: zones)
                    )
                )
            } else {
                if KindMaps.skippedCategories.contains(item.category) {
                    warnings.append("跳过不支持的物体:\(item.category)")
                } else {
                    warnings.append("未知物体类目:\(item.category),已跳过")
                }
            }
        }

        // 7) 机位
        let isoFormatter = ISO8601DateFormatter()
        let viewpoints = scene.poses.enumerated().map { i, pose in
            let p = toPlan(pose.pos)
            let fwd = pose.forwardDeg + phi * 180 / .pi
            let v = SIMD2(cos(fwd * .pi / 180), sin(fwd * .pi / 180))
            // HomeOS heading:0=上(0,-1),顺时针 → atan2(x, -y)
            let heading = normalizeDeg(atan2(v.x, -v.y) * 180 / .pi)
            return HomeOSProject.Viewpoint(
                id: "vp-\(i + 1)",
                x: round1(p.x),
                y: round1(p.y),
                heading: round1(heading),
                fovDeg: round1(pose.fovDeg),
                takenAt: isoFormatter.string(from: pose.takenAt),
                camera: pose.camera,
                photoPath: nil // 上传时按桶内路径回填
            )
        }

        // 面积:分区鞋带公式合计,px² → ft²
        let sqft = zones.reduce(0.0) { acc, z in
            acc + abs(shoelace(z.polygon.map { SIMD2($0.x, $0.y) })) / (pxPerFt * pxPerFt)
        }

        return HomeOSProject(
            wallGraph: graph.toModel(),
            graphOpenings: openings,
            zones: zones,
            placements: placements,
            fixtures: fixtures,
            viewpoints: viewpoints,
            meta: .init(
                id: "scan-\(scanId.prefix(8))",
                nameZh: nameZh,
                sqft: sqft > 0 ? round1(sqft) : nil,
                scanWarnings: warnings,
                sourceNote: "iOS HomeScan · RoomPlan 实测"
            )
        )
    }

    // MARK: - 主方向

    /// 墙段角度对 90° 取模的加权圆均值 → 返回让其归零的旋转角(弧度)。
    static func dominantRotation(_ walls: [FlatScene.WallSeg]) -> Double {
        var sx = 0.0
        var sy = 0.0
        for w in walls {
            let d = w.b - w.a
            let len = length(d)
            guard len > 0.01 else { continue }
            let theta = atan2(d.y, d.x)
            sx += cos(4 * theta) * len
            sy += sin(4 * theta) * len
        }
        guard sx != 0 || sy != 0 else { return 0 }
        let dominant = atan2(sy, sx) / 4
        return -dominant
    }

    // MARK: - 墙段清洗

    /// 近轴墙拉直(±4° 内直接摆平/立直)+ 偏轴碎片过滤(<1ft 且歪 >5° 是扫描噪声)。
    static func cleanSegments(
        _ segments: [(a: SIMD2<Double>, b: SIMD2<Double>)],
        warnings: inout [String]
    ) -> [(a: SIMD2<Double>, b: SIMD2<Double>)] {
        let axisSnapDeg = 4.0
        let noiseLenPx = 36.0 // 1 ft
        let noiseOffAxisDeg = 5.0
        var dropped = 0
        var out: [(a: SIMD2<Double>, b: SIMD2<Double>)] = []
        for seg in segments {
            let d = seg.b - seg.a
            let len = (d.x * d.x + d.y * d.y).squareRoot()
            guard len > 0.5 else { continue }
            let angle = normalizeDeg(atan2(d.y, d.x) * 180 / .pi)
            let offAxis = min(
                abs(angle.truncatingRemainder(dividingBy: 90)),
                90 - abs(angle.truncatingRemainder(dividingBy: 90))
            )
            if len < noiseLenPx, offAxis > noiseOffAxisDeg {
                dropped += 1
                continue
            }
            var a = seg.a
            var b = seg.b
            if offAxis <= axisSnapDeg {
                if abs(d.x) >= abs(d.y) {
                    let midY = (a.y + b.y) / 2
                    a.y = midY
                    b.y = midY
                } else {
                    let midX = (a.x + b.x) / 2
                    a.x = midX
                    b.x = midX
                }
            }
            out.append((a: a, b: b))
        }
        if dropped > 0 { warnings.append("滤掉 \(dropped) 段偏轴碎墙(扫描噪声)") }
        return out
    }

    // MARK: - 物体去重

    /// 同类物体中心距 <0.6m 视为同一件(两次扫描的重叠区域各记了一遍),
    /// 保留脚印更大的那件。
    static func dedupItems(
        _ items: [FlatScene.Item],
        warnings: inout [String]
    ) -> [FlatScene.Item] {
        let mergeDistM = 0.6
        var kept: [FlatScene.Item] = []
        var dropped = 0
        for item in items {
            if let i = kept.firstIndex(where: { other in
                other.category == item.category
                    && length(other.center - item.center) < mergeDistM
            }) {
                dropped += 1
                let old = kept[i]
                if item.widthM * item.depthM > old.widthM * old.depthM {
                    kept[i] = item
                }
            } else {
                kept.append(item)
            }
        }
        if dropped > 0 { warnings.append("合并 \(dropped) 件重复识别的物体(扫描重叠区)") }
        return kept
    }

    // MARK: - 分区合并

    /// 小分区被大分区覆盖 >60% → 并入大分区(标签合并)。
    /// 覆盖率用小多边形 bbox 网格采样估算,分区数量个位数,精度足够。
    static func mergeOverlappingZones(
        _ drafts: [(labels: [String], poly: [SIMD2<Double>])],
        warnings: inout [String]
    ) -> [(labels: [String], poly: [SIMD2<Double>])] {
        guard drafts.count > 1 else { return drafts }
        var out = drafts.sorted {
            abs(shoelace($0.poly)) > abs(shoelace($1.poly))
        }
        var merged = 0
        var i = 1
        while i < out.count {
            let small = out[i]
            var absorbed = false
            for j in 0..<i {
                let ratio = overlapRatio(of: small.poly, in: out[j].poly)
                if ratio > 0.6 {
                    out[j].labels += small.labels
                    out.remove(at: i)
                    merged += 1
                    absorbed = true
                    break
                }
            }
            if !absorbed { i += 1 }
        }
        if merged > 0 { warnings.append("合并 \(merged) 块重叠的扫描地板(同一空间扫了多遍)") }
        return out
    }

    /// poly 的内部有多大比例也落在 container 里(网格采样)
    static func overlapRatio(of poly: [SIMD2<Double>], in container: [SIMD2<Double>]) -> Double {
        guard poly.count >= 3, container.count >= 3 else { return 0 }
        let xs = poly.map(\.x)
        let ys = poly.map(\.y)
        let steps = 24
        var inside = 0
        var both = 0
        for gy in 0...steps {
            for gx in 0...steps {
                let p = SIMD2(
                    xs.min()! + (xs.max()! - xs.min()!) * Double(gx) / Double(steps),
                    ys.min()! + (ys.max()! - ys.min()!) * Double(gy) / Double(steps)
                )
                guard pointInPolygon(p, poly) else { continue }
                inside += 1
                if pointInPolygon(p, container) { both += 1 }
            }
        }
        guard inside > 0 else { return 0 }
        return Double(both) / Double(inside)
    }

    // MARK: - 墙图构建

    struct Graph {
        var vertices: [SIMD2<Double>] = []
        var edges: [(a: Int, b: Int)] = []

        func toModel() -> HomeOSProject.WallGraph {
            .init(
                pxPerFt: PlanProjector.pxPerFt,
                margin: .init(x: PlanProjector.marginPx, y: PlanProjector.marginPx),
                vertices: vertices.enumerated().map { i, v in
                    .init(id: "v-\(i + 1)", x: round1(v.x), y: round1(v.y))
                },
                edges: edges.enumerated().map { i, e in
                    .init(id: "e-\(i + 1)", a: "v-\(e.a + 1)", b: "v-\(e.b + 1)", exterior: nil)
                }
            )
        }
    }

    /// 一批标量按容差聚类到均值(墙角坐标对齐:378 与 381 归成 379.5)。
    /// 返回映射函数。容差 = weldTolPx(2 英寸),斜墙失真可忽略。
    static func clusterAxis(_ values: [Double], tol: Double) -> (Double) -> Double {
        let sorted = values.sorted()
        var groups: [[Double]] = []
        for v in sorted {
            if var last = groups.last, let head = last.first, v - head <= tol {
                last.append(v)
                groups[groups.count - 1] = last
            } else {
                groups.append([v])
            }
        }
        let means = groups.map { $0.reduce(0, +) / Double($0.count) }
        let heads = groups.map { $0.first! }
        return { v in
            // 找 v 所属组(head ≤ v 且组内)
            var best = v
            for (i, head) in heads.enumerated()
            where v >= head - 0.001 && v <= head + tol + 0.001 {
                best = means[i]
            }
            return best
        }
    }

    static func buildGraph(segments rawSegments: [(a: SIMD2<Double>, b: SIMD2<Double>)]) -> Graph {
        var g = Graph()

        // 全局坐标聚类:各墙独立拉直后墙角坐标会差 1-3px,
        // 焊接前先把相近的 x/y 归成同一条轴线,角点自然闭合
        let pts = rawSegments.flatMap { [$0.a, $0.b] }
        let mapX = clusterAxis(pts.map(\.x), tol: weldTolPx)
        let mapY = clusterAxis(pts.map(\.y), tol: weldTolPx)
        let segments = rawSegments.map {
            (a: SIMD2(mapX($0.a.x), mapY($0.a.y)), b: SIMD2(mapX($0.b.x), mapY($0.b.y)))
        }

        // 端点焊接:1 英寸网格吸附后,tolerance 内归并到已有顶点
        func vertexIndex(_ p: SIMD2<Double>) -> Int {
            let snapped = SIMD2(
                (p.x / gridPx).rounded() * gridPx,
                (p.y / gridPx).rounded() * gridPx
            )
            for (i, v) in g.vertices.enumerated()
            where length(v - snapped) <= weldTolPx {
                return i
            }
            g.vertices.append(snapped)
            return g.vertices.count - 1
        }

        for seg in segments {
            let ia = vertexIndex(seg.a)
            let ib = vertexIndex(seg.b)
            guard ia != ib else { continue }
            g.edges.append((a: ia, b: ib))
        }

        // T 交点拆分:顶点落在别的边中段时把那条边一分为二(迭代到不再变化)
        var changed = true
        while changed {
            changed = false
            outer: for (ei, e) in g.edges.enumerated() {
                let a = g.vertices[e.a]
                let b = g.vertices[e.b]
                let len = length(b - a)
                guard len > 0 else { continue }
                for vi in g.vertices.indices where vi != e.a && vi != e.b {
                    let v = g.vertices[vi]
                    let t = dot(v - a, b - a) / (len * len)
                    guard t > 0.05, t < 0.95 else { continue }
                    let proj = a + (b - a) * t
                    guard length(v - proj) <= weldTolPx else { continue }
                    g.edges[ei] = (a: e.a, b: vi)
                    g.edges.append((a: vi, b: e.b))
                    changed = true
                    break outer
                }
            }
        }

        // 去短、去重(无向)
        var seen = Set<String>()
        g.edges = g.edges.filter { e in
            let a = g.vertices[e.a]
            let b = g.vertices[e.b]
            guard length(b - a) >= minEdgePx else { return false }
            let key = e.a < e.b ? "\(e.a)-\(e.b)" : "\(e.b)-\(e.a)"
            return seen.insert(key).inserted
        }

        // 掉线的顶点顺带清理(重建索引)
        var used = Set<Int>()
        for e in g.edges {
            used.insert(e.a)
            used.insert(e.b)
        }
        var remap: [Int: Int] = [:]
        var vs: [SIMD2<Double>] = []
        for i in g.vertices.indices where used.contains(i) {
            remap[i] = vs.count
            vs.append(g.vertices[i])
        }
        g.vertices = vs
        g.edges = g.edges.map { (a: remap[$0.a]!, b: remap[$0.b]!) }
        return g
    }

    // MARK: - 门窗投影

    struct EdgeHit {
        var edgeId: String
        var projIn: Double    // 沿边自 a 起的英寸
        var edgeLenIn: Double
    }

    static func nearestEdge(to p: SIMD2<Double>, in g: Graph, maxDist: Double) -> EdgeHit? {
        var best: (dist: Double, hit: EdgeHit)?
        for (i, e) in g.edges.enumerated() {
            let a = g.vertices[e.a]
            let b = g.vertices[e.b]
            let ab = b - a
            let len = length(ab)
            guard len > 0 else { continue }
            let t = max(0, min(1, dot(p - a, ab) / (len * len)))
            let proj = a + ab * t
            let d = length(p - proj)
            guard d <= maxDist else { continue }
            if best == nil || d < best!.dist {
                best = (
                    d,
                    EdgeHit(
                        edgeId: "e-\(i + 1)",
                        projIn: t * len / gridPx,
                        edgeLenIn: len / gridPx
                    )
                )
            }
        }
        return best?.hit
    }

    // MARK: - 几何小件

    static func rotate(_ p: SIMD2<Double>, _ rad: Double) -> SIMD2<Double> {
        SIMD2(
            p.x * cos(rad) - p.y * sin(rad),
            p.x * sin(rad) + p.y * cos(rad)
        )
    }

    static func snappedRotation(axisDeg: Double) -> Int {
        let n = Int((normalizeDeg(axisDeg) / 90).rounded()) % 4
        return n * 90
    }

    static func normalizeDeg(_ d: Double) -> Double {
        var v = d.truncatingRemainder(dividingBy: 360)
        if v < 0 { v += 360 }
        return v
    }

    static func round1(_ v: Double) -> Double {
        (v * 10).rounded() / 10
    }

    static func shoelace(_ poly: [SIMD2<Double>]) -> Double {
        guard poly.count >= 3 else { return 0 }
        var s = 0.0
        for i in poly.indices {
            let a = poly[i]
            let b = poly[(i + 1) % poly.count]
            s += a.x * b.y - b.x * a.y
        }
        return s / 2
    }

    static func zoneId(containing p: SIMD2<Double>, zones: [HomeOSProject.Zone]) -> String? {
        for z in zones {
            let poly = z.polygon.map { SIMD2($0.x, $0.y) }
            if pointInPolygon(p, poly) { return z.id }
        }
        return nil
    }

    static func pointInPolygon(_ p: SIMD2<Double>, _ poly: [SIMD2<Double>]) -> Bool {
        guard poly.count >= 3 else { return false }
        var inside = false
        var j = poly.count - 1
        for i in poly.indices {
            let a = poly[i]
            let b = poly[j]
            if (a.y > p.y) != (b.y > p.y),
               p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x {
                inside.toggle()
            }
            j = i
        }
        return inside
    }

    static func emptyProject(scanId: String, nameZh: String, warnings: [String]) -> HomeOSProject {
        HomeOSProject(
            wallGraph: .init(
                pxPerFt: pxPerFt,
                margin: .init(x: marginPx, y: marginPx),
                vertices: [],
                edges: []
            ),
            graphOpenings: [],
            zones: [],
            placements: [],
            fixtures: [],
            viewpoints: [],
            meta: .init(id: "scan-\(scanId.prefix(8))", nameZh: nameZh, sqft: nil, scanWarnings: warnings, sourceNote: nil)
        )
    }
}

private func length(_ v: SIMD2<Double>) -> Double {
    (v.x * v.x + v.y * v.y).squareRoot()
}

private func dot(_ a: SIMD2<Double>, _ b: SIMD2<Double>) -> Double {
    a.x * b.x + a.y * b.y
}

private func round1(_ v: Double) -> Double {
    (v * 10).rounded() / 10
}
