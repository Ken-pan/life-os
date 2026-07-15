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

    /// 投影结果:payload 本体 + 「placement/fixture id → 本机多视角抓拍图」
    /// (照片是本地临时文件,不进 payload;上传时换成桶内路径回填
    /// attrs.photoPath / attrs.photos)
    struct Projection {
        var project: HomeOSProject
        var objectPhotos: [String: [ShotAsset]]

        struct ShotAsset {
            var url: URL
            var azimuthDeg: Double?
        }
    }

    /// 兼容旧签名(单测/预览只关心 payload 本体)
    static func project(_ scene: FlatScene, scanId: String, nameZh: String) -> HomeOSProject {
        projectScene(scene, scanId: scanId, nameZh: nameZh).project
    }

    static func projectScene(_ scene: FlatScene, scanId: String, nameZh: String) -> Projection {
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
            return Projection(
                project: emptyProject(scanId: scanId, nameZh: nameZh, warnings: ["扫描里没有墙体"]),
                objectPhotos: [:]
            )
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

        // 5) 分区:全屋扫描常只给**一整块地板 + 多个功能区**(真扫实测 1 floor /
        //    5 sections),不切就会得到一个「厨房·卧室·卫生间」巨区,zoneId 失去意义。
        //    → 先按 sections 做 Voronoi 半平面裁切,再合并真正重叠的地板。
        let planSections = scene.sections.map {
            (label: $0.label, center: toPlan($0.center))
        }
        var zoneDrafts: [(labels: [String], poly: [SIMD2<Double>])] = []
        for (i, room) in scene.rooms.enumerated() {
            let poly = rawRooms[i].map { $0 + shift }
            guard poly.count >= 3 else { continue }
            let mine = planSections.filter { pointInPolygon($0.center, poly) }
            if mine.count > 1 {
                for cell in voronoiCells(floor: poly, sections: mine) {
                    zoneDrafts.append((labels: [cell.label], poly: cell.poly))
                }
            } else {
                let labels = mine.isEmpty ? room.labels : mine.map(\.label)
                zoneDrafts.append((labels: labels, poly: poly))
            }
        }
        zoneDrafts = mergeOverlappingZones(zoneDrafts, warnings: &warnings)
        if zoneDrafts.isEmpty { warnings.append("扫描未识别出房间地板,平面图分区为空") }

        // 6) 物体:先映射 kind(sink 按所在区改判厨房水槽/卫生间洗手台),
        //    再按**映射后的 kind** 去重 —— oven 与 stove 同映射成 stove,
        //    一体机会在同一坐标画两遍(真扫实测 0px 重合);按原始类目比是抓不到的。
        let mapped = dedupMapped(
            scene.items.compactMap { item -> MappedItem? in
                let c = toPlan(item.center)
                let di = zoneDrafts.firstIndex { pointInPolygon(c, $0.poly) }
                let inBathroom = di.map { zoneDrafts[$0].labels.contains("bathroom") } ?? false
                var mapping: (kind: String, label: String)?
                var isFixture = true
                if item.category == "sink" {
                    mapping = KindMaps.sinkKind(inBathroom: inBathroom)
                } else if let fx = KindMaps.fixtureKinds[item.category] {
                    mapping = fx
                } else if let pl = KindMaps.placementKinds[item.category] {
                    mapping = pl
                    isFixture = false
                }
                guard let m = mapping else {
                    warnings.append(
                        KindMaps.skippedCategories.contains(item.category)
                            ? "跳过不支持的物体:\(item.category)"
                            : "未知物体类目:\(item.category),已跳过"
                    )
                    return nil
                }
                // 样式属性精化:L形沙发/茶几/转椅/开放架…(细分 kind 仍在网页词表内)
                let styled = KindMaps.applyStyle(
                    baseKind: m.kind,
                    baseLabel: m.label,
                    styleKeys: item.styleKeys
                )
                return MappedItem(
                    kind: styled.kind,
                    label: styled.label,
                    isFixture: isFixture,
                    center: c,
                    axisDeg: item.axisDeg + phi * 180 / .pi,
                    widthPx: item.widthM * pxPerM,
                    depthPx: item.depthM * pxPerM,
                    draftIdx: di,
                    heightIn: item.heightM > 0 ? round1(item.heightM * 39.3700787) : nil,
                    confidence: item.confidence,
                    styleKeys: item.styleKeys.isEmpty ? nil : item.styleKeys,
                    styleZh: styled.styleZh,
                    colorHex: item.colorHex,
                    photos: item.photos.isEmpty ? nil : item.photos
                )
            },
            warnings: &warnings
        )

        // 7) RoomPlan 认不出功能的区(unidentified),按区内家具反推名字;同名加序号
        let zones = namedZones(drafts: zoneDrafts, items: mapped)

        // 低置信度的尺寸不许静默进图 —— 点名提示补扫(分米级承诺的另一半)
        let shaky = mapped.filter { $0.confidence == "low" }.map(\.label)
        if !shaky.isEmpty {
            warnings.append(
                "低置信度识别:\(Set(shaky).sorted().joined(separator: "、")) —— 尺寸可能不准,建议贴近补扫几秒"
            )
        }

        // 8) 物体 → placements / fixtures(外观信息进 attrs,抓拍图按 id 带出)
        var placements: [HomeOSProject.Placement] = []
        var fixtures: [HomeOSProject.Fixture] = []
        var objectPhotos: [String: [Projection.ShotAsset]] = [:]
        for m in mapped {
            let snapped = snappedRotation(axisDeg: m.axisDeg)
            // 局部 x 轴贴屏幕横向(0/180)时,footprint 宽=物宽;竖向(90/270)时对调
            let fw = (snapped == 0 || snapped == 180) ? m.widthPx : m.depthPx
            let fh = (snapped == 0 || snapped == 180) ? m.depthPx : m.widthPx
            let x = round1(m.center.x - fw / 2)
            let y = round1(m.center.y - fh / 2)
            let attrs = HomeOSProject.ObjectAttrs(
                styleKeys: m.styleKeys,
                styleZh: m.styleZh,
                heightIn: m.heightIn,
                // 实测脚印真值(英寸,gridPx=3px/in):w/h 之后随用户编辑漂,这两个不动
                measuredWIn: round1(fw / gridPx),
                measuredHIn: round1(fh / gridPx),
                confidence: m.confidence,
                colorHex: m.colorHex,
                photoPath: nil // 上传时回填桶内路径
            )
            if m.isFixture {
                let id = "fx-\(fixtures.count + 1)"
                fixtures.append(
                    HomeOSProject.Fixture(
                        id: id,
                        kind: m.kind,
                        label: m.label,
                        bounds: .init(x: x, y: y, w: round1(fw), h: round1(fh)),
                        rotation: snapped,
                        attrs: attrs.isEmpty ? nil : attrs
                    )
                )
                if let ph = m.photos, !ph.isEmpty {
                    objectPhotos[id] = ph.map { .init(url: $0.fileURL, azimuthDeg: $0.azimuthDeg) }
                }
            } else {
                let id = "pl-\(placements.count + 1)"
                placements.append(
                    HomeOSProject.Placement(
                        id: id,
                        kind: m.kind,
                        label: m.label,
                        x: x,
                        y: y,
                        w: round1(fw),
                        h: round1(fh),
                        rotation: snapped,
                        zoneId: m.draftIdx.map { "z-\($0 + 1)" },
                        attrs: attrs.isEmpty ? nil : attrs
                    )
                )
                if let ph = m.photos, !ph.isEmpty {
                    objectPhotos[id] = ph.map { .init(url: $0.fileURL, azimuthDeg: $0.azimuthDeg) }
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

        let project = HomeOSProject(
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
        return Projection(project: project, objectPhotos: objectPhotos)
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

    // MARK: - 物体映射与去重

    /// 已定 kind 的物体(plan px)。去重、命名推断、落盘都基于它。
    struct MappedItem {
        var kind: String
        var label: String
        var isFixture: Bool
        var center: SIMD2<Double>
        var axisDeg: Double
        var widthPx: Double
        var depthPx: Double
        /// 所属 zoneDrafts 下标(区外为 nil)
        var draftIdx: Int?
        // 外观/实测补充(→ attrs)
        var heightIn: Double?
        var confidence: String?
        var styleKeys: [String]?
        var styleZh: String?
        var colorHex: String?
        var photos: [FlatScene.ObjectPhoto]?
    }

    /// 同 **kind** 且中心距 <0.6m 视为同一件。谁的尺寸可信:
    /// **置信度高的赢**(RoomPlan 对扫得不全的物体给偏小的包围盒,同时置信度掉级,
    /// 盲取更大的会把「误检的大框」当真);同级才取脚印更大(更完整)的那件。
    /// 两次测量差 >10cm 时留告警 —— 这正是「该补扫一圈」的信号。
    /// 按 kind 而非原始类目:oven/stove 都映射成 stove,一体机否则会重合两遍。
    static func dedupMapped(
        _ items: [MappedItem],
        warnings: inout [String]
    ) -> [MappedItem] {
        let mergeDistPx = 0.6 * pxPerM
        let disagreePx = 0.10 * pxPerM // 10cm:分米级承诺的红线
        var kept: [MappedItem] = []
        var dropped = 0
        for item in items {
            if let i = kept.firstIndex(where: { other in
                other.kind == item.kind && length(other.center - item.center) < mergeDistPx
            }) {
                dropped += 1
                let old = kept[i]
                let dw = abs(old.widthPx - item.widthPx)
                let dd = abs(old.depthPx - item.depthPx)
                if max(dw, dd) > disagreePx {
                    let cm = Int((max(dw, dd) / pxPerM * 100).rounded())
                    warnings.append("「\(old.label)」两次测量尺寸差 \(cm)cm,已取更可信一次;建议对着它补扫确认")
                }
                let oldRank = confidenceRank(old.confidence)
                let newRank = confidenceRank(item.confidence)
                let newWins = newRank != oldRank
                    ? newRank > oldRank
                    : item.widthPx * item.depthPx > old.widthPx * old.depthPx
                kept[i] = newWins
                    ? mergedAttrs(into: item, from: old)
                    : mergedAttrs(into: old, from: item)
            } else {
                kept.append(item)
            }
        }
        if dropped > 0 { warnings.append("合并 \(dropped) 件重复识别的物体(同位重合/扫描重叠区)") }
        return kept
    }

    /// nil(mock/未知)排在 low 之上、medium 之下:没证据说它差,但也不该赢过实测 high。
    static func confidenceRank(_ c: String?) -> Int {
        switch c {
        case "high": return 3
        case "medium": return 2
        case nil: return 1
        default: return 0 // low
        }
    }

    /// 去重时别把外观信息丢了:winner 缺的字段从 loser 补
    /// (烤箱灶一体机常常只有其中一个类目抓到了照片)。
    private static func mergedAttrs(into winner: MappedItem, from loser: MappedItem) -> MappedItem {
        var out = winner
        out.heightIn = out.heightIn ?? loser.heightIn
        out.confidence = out.confidence ?? loser.confidence
        out.styleKeys = out.styleKeys ?? loser.styleKeys
        out.styleZh = out.styleZh ?? loser.styleZh
        out.colorHex = out.colorHex ?? loser.colorHex
        out.photos = out.photos ?? loser.photos
        return out
    }

    // MARK: - 分区命名

    /// unidentified 区按区内家具反推;同名区加序号(卧室 1 / 卧室 2)。
    static func namedZones(
        drafts: [(labels: [String], poly: [SIMD2<Double>])],
        items: [MappedItem]
    ) -> [HomeOSProject.Zone] {
        var names = drafts.map { KindMaps.zoneName(for: $0.labels) }
        // 真实 section 名先占位,推断名避开它们(否则真厨房旁边又冒一个「厨房」)
        var used = Set(names.filter { $0 != "房间" })
        for i in names.indices where names[i] == "房间" {
            let kinds = items.filter { $0.draftIdx == i }.map(\.kind)
            let candidates = KindMaps.inferredNames(fromKinds: kinds)
            guard let pick = candidates.first(where: { !used.contains($0) }) ?? candidates.first
            else { continue }
            names[i] = pick
            used.insert(pick)
        }
        var counts: [String: Int] = [:]
        for n in names { counts[n, default: 0] += 1 }
        var seen: [String: Int] = [:]
        return drafts.enumerated().map { i, d in
            var name = names[i]
            if (counts[name] ?? 0) > 1 {
                seen[name, default: 0] += 1
                name = "\(name) \(seen[name]!)"
            }
            return HomeOSProject.Zone(
                id: "z-\(i + 1)",
                nameZh: name,
                polygon: d.poly.map { .init(x: round1($0.x), y: round1($0.y)) }
            )
        }
    }

    // MARK: - 功能区切分(Voronoi)

    /// 把一整块地板按 sections 切成各自的 Voronoi cell:
    /// cell_i = 地板 ∩ (所有 j≠i 的「离 i 更近」半平面)。
    /// 用 Sutherland-Hodgman 逐条垂直平分线裁剪;太碎的(<12 ft²)丢弃。
    static func voronoiCells(
        floor: [SIMD2<Double>],
        sections: [(label: String, center: SIMD2<Double>)]
    ) -> [(label: String, poly: [SIMD2<Double>])] {
        guard sections.count > 1 else {
            return sections.first.map { [(label: $0.label, poly: floor)] } ?? []
        }
        let minCellPx2 = 12.0 * pxPerFt * pxPerFt
        var out: [(label: String, poly: [SIMD2<Double>])] = []
        for (i, s) in sections.enumerated() {
            var poly = floor
            for (j, other) in sections.enumerated() where j != i {
                poly = clipByBisector(poly, keep: s.center, other: other.center)
                if poly.count < 3 { break }
            }
            guard poly.count >= 3, abs(shoelace(poly)) >= minCellPx2 else { continue }
            out.append((label: s.label, poly: poly))
        }
        return out
    }

    /// 用 keep/other 的垂直平分线裁多边形,保留 keep 一侧(Sutherland-Hodgman)
    static func clipByBisector(
        _ poly: [SIMD2<Double>],
        keep: SIMD2<Double>,
        other: SIMD2<Double>
    ) -> [SIMD2<Double>] {
        guard poly.count >= 3 else { return [] }
        let mid = (keep + other) / 2
        let dir = other - keep // 法向:>0 侧离 other 更近
        func side(_ p: SIMD2<Double>) -> Double { dot(p - mid, dir) }
        var out: [SIMD2<Double>] = []
        for i in poly.indices {
            let cur = poly[i]
            let prev = poly[(i + poly.count - 1) % poly.count]
            let dCur = side(cur)
            let dPrev = side(prev)
            if dCur <= 0 {
                if dPrev > 0 {
                    let t = dPrev / (dPrev - dCur)
                    out.append(prev + (cur - prev) * t)
                }
                out.append(cur)
            } else if dPrev <= 0 {
                let t = dPrev / (dPrev - dCur)
                out.append(prev + (cur - prev) * t)
            }
        }
        return out
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
