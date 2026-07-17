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

    static func projectScene(
        _ scene: FlatScene,
        scanId: String,
        nameZh: String,
        scanScope: String? = nil,
        canonicalHome: CanonicalHome? = nil,
        geo: GeoContext.Summary? = nil
    ) -> Projection {
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

        // 3.5) 权威参照:把永久户型配准进扫描帧,供去重仲裁与检测陷阱纠正
        //     (配准不过验收门 → 空列表,权威值不掺和这次扫描)
        let identityRefs = canonicalHome
            .map { canonicalRefs(scanGraph: graph.toModel(), home: $0) } ?? []

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
                    swing: op.kind == .door ? "in" : nil,
                    // 洞口纵向实测(LiDAR):窗台高是「窗下能放多高柜子」的答案
                    heightIn: op.heightM > 0 ? round1(op.heightM * 39.3700787) : nil,
                    sillIn: op.kind == .window && op.elevM > 0.05
                        ? round1(op.elevM * 39.3700787) : nil
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
        //    去重后过一遍权威纠正(别名认亲/误检压制,见 reconcileWithCanonical)。
        let deduped = dedupMapped(
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
                // 尺寸/高度二次细化:table → 升降桌/书桌/折叠桌/餐桌 + kindConfidence
                let inPerM = 39.3700787
                let refined = KindMaps.refineKind(
                    kind: styled.kind,
                    label: styled.label,
                    styleZh: styled.styleZh,
                    confidence: item.confidence,
                    longIn: max(item.widthM, item.depthM) * inPerM,
                    shortIn: min(item.widthM, item.depthM) * inPerM,
                    heightIn: item.heightM > 0 ? item.heightM * inPerM : nil
                )
                return MappedItem(
                    kind: refined.kind,
                    label: refined.label,
                    isFixture: isFixture,
                    center: c,
                    axisDeg: item.axisDeg + phi * 180 / .pi,
                    widthPx: item.widthM * pxPerM,
                    depthPx: item.depthM * pxPerM,
                    draftIdx: di,
                    heightIn: item.heightM > 0 ? round1(item.heightM * 39.3700787) : nil,
                    // 离地 <5cm 视为落地噪声不导出;≥5cm 才是真架空(吊柜/挂墙件)
                    elevIn: item.elevM >= 0.05 ? round1(item.elevM * 39.3700787) : nil,
                    confidence: item.confidence,
                    styleKeys: item.styleKeys.isEmpty ? nil : item.styleKeys,
                    styleZh: refined.styleZh,
                    colorHex: item.colorHex,
                    colorConfidence: item.colorConfidence,
                    kindConfidence: refined.kindConfidence,
                    photoHash: item.photoHash,
                    photos: item.photos.isEmpty ? nil : item.photos,
                    requiredShots: {
                        let side = max(item.widthM, item.depthM)
                        if side >= 0.9 { return 3 }
                        if side >= 0.45 { return 2 }
                        return 1
                    }()
                )
            },
            refs: identityRefs,
            warnings: &warnings
        )
        // 权威副本把 RoomPlan 并成一件的整排柜拆回 N 件(见 unmergeByCanonical),
        // 再过认亲/纠正。ScanLog 记拆了几件,真机 QA 看它是否如期触发。
        let unmerged = unmergeByCanonical(deduped, refs: identityRefs, warnings: &warnings)
        if unmerged.count > deduped.count {
            ScanLog.shared.counter { $0.add("unmerge_split_added", Double(unmerged.count - deduped.count)) }
        }
        let mapped = reconcileWithCanonical(unmerged, refs: identityRefs, warnings: &warnings)

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
            // 与 90° 网格的偏角:rotation 量化后斜摆家具的真朝向就靠它了。
            // 折到 (-45,45](snappedRotation 取的是最近档);≤3° 视为贴轴噪声不发
            let yawDev = normalizeDeg(m.axisDeg - Double(snapped) + 180) - 180
            let attrs = HomeOSProject.ObjectAttrs(
                styleKeys: m.styleKeys,
                styleZh: m.styleZh,
                heightIn: m.heightIn,
                elevIn: m.elevIn,
                // 实测脚印真值(英寸,gridPx=3px/in):w/h 之后随用户编辑漂,这两个不动
                measuredWIn: round1(fw / gridPx),
                measuredHIn: round1(fh / gridPx),
                confidence: m.confidence,
                colorHex: m.colorHex,
                colorConfidence: m.colorConfidence.map { ($0 * 100).rounded() / 100 },
                kindConfidence: m.kindConfidence.map { ($0 * 100).rounded() / 100 },
                photoPath: nil, // 上传时回填桶内路径
                photoHash: m.photoHash,
                yawDeg: abs(yawDev) > 3 ? round1(yawDev) : nil
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
                    // 证据需求之外的方位不上传:小件 1 张就够,别灌满 4 桶浪费桶空间
                    objectPhotos[id] = ph.prefix(m.requiredShots)
                        .map { .init(url: $0.fileURL, azimuthDeg: $0.azimuthDeg) }
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
                    objectPhotos[id] = ph.prefix(m.requiredShots)
                        .map { .init(url: $0.fileURL, azimuthDeg: $0.azimuthDeg) }
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

        // 吊顶高:墙板高中位数(LiDAR 实测)。中位数不吃半墙/矮隔断的偏差
        let wallHeights = scene.walls.map(\.heightM).filter { $0 > 0 }.sorted()
        let ceilingHeightIn = wallHeights.isEmpty
            ? nil : round1(wallHeights[wallHeights.count / 2] * 39.3700787)

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
                sourceNote: "iOS HomeScan · RoomPlan 实测",
                scanScope: scanScope,
                ceilingHeightIn: ceilingHeightIn,
                geo: geoMeta(geo, phi: phi)
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

    // MARK: - 权威参照(检测陷阱纠正)

    /// 几何吻合门槛:footprint IoU ≥0.3(或中心互含)才算「同一个位置的东西」——
    /// 与网页端并行实现同一判据
    static let geomIoUMin = 0.3
    /// 同位同 kind 两次测量差超过它(100cm)= 「整排柜被并成一件」量级,
    /// 不再走普通去重仲裁(真扫连续两轮:厨房上柜整排被检成一只 12.3ft 巨柜)
    static let splitSuspectPx = 1.0 * pxPerM

    /// 轴对齐脚印(plan px)—— 几何吻合判定的最小单元
    struct BoxPx {
        var x: Double
        var y: Double
        var w: Double
        var h: Double
        var cx: Double { x + w / 2 }
        var cy: Double { y + h / 2 }

        func contains(_ px: Double, _ py: Double) -> Bool {
            px >= x && px <= x + w && py >= y && py <= y + h
        }
    }

    /// 权威副本里的一件已知物,已配准到**扫描 px 帧**。
    /// scanAliases / identityLocked 是三端同源契约字段(权威件 attrs 下):
    /// 扫描惯把这件误检成哪些 kind / kind·label·几何以权威为准。
    struct CanonicalRef {
        var id: String
        var kind: String
        var label: String
        var box: BoxPx
        var elevIn: Double?
        /// 权威件住在哪个列表(认亲跨列表跟着走:鸟笼是 placement,
        /// 误检进来的「冰箱」是 fixture,认作鸟笼后要落回 placements)
        var isFixture: Bool
        var scanAliases: [String]
        var identityLocked: Bool
    }

    /// 把权威副本配准到扫描帧 → 参照列表。配准不过门(HomeFrame 验收门)
    /// 返回空:几何都对不上时,不许拿权威值硬改这次扫描。
    static func canonicalRefs(
        scanGraph: HomeOSProject.WallGraph,
        home: CanonicalHome
    ) -> [CanonicalRef] {
        let scanSegs = HomeFrame.segments(fromWallGraph: scanGraph)
        let homeSegs = HomeFrame.segments(fromWallGraph: home.wallGraph)
        let reg = HomeFrame.register(scan: scanSegs, home: homeSegs)
        guard reg.ok else { return [] }
        let homeMPerPx = 0.3048 / home.wallGraph.pxPerFt
        let scanPxPerM = scanGraph.pxPerFt / 0.3048
        // 家坐标(px)→ 扫描帧(px):toHome 的精确逆
        func toScanPx(_ p: SIMD2<Double>) -> SIMD2<Double> {
            HomeFrame.fromHome(p * homeMPerPx, reg) * scanPxPerM
        }
        func box(_ x: Double, _ y: Double, _ w: Double, _ h: Double) -> BoxPx {
            let a = toScanPx(SIMD2(x, y))
            let b = toScanPx(SIMD2(x + w, y + h))
            return BoxPx(
                x: min(a.x, b.x), y: min(a.y, b.y),
                w: abs(b.x - a.x), h: abs(b.y - a.y)
            )
        }
        func hint(_ id: String) -> CanonicalHome.IdentityHint {
            home.identityHints?[id] ?? CanonicalHome.IdentityHint()
        }
        var out: [CanonicalRef] = []
        for pl in home.placements {
            let hi = hint(pl.id)
            out.append(CanonicalRef(
                id: pl.id, kind: pl.kind, label: pl.label,
                box: box(pl.x, pl.y, pl.w, pl.h),
                elevIn: pl.attrs?.elevIn, isFixture: false,
                scanAliases: hi.scanAliases, identityLocked: hi.identityLocked
            ))
        }
        for fx in home.fixtures ?? [] {
            let hi = hint(fx.id)
            out.append(CanonicalRef(
                id: fx.id, kind: fx.kind, label: fx.label,
                box: box(fx.bounds.x, fx.bounds.y, fx.bounds.w, fx.bounds.h),
                elevIn: fx.attrs?.elevIn, isFixture: true,
                scanAliases: hi.scanAliases, identityLocked: hi.identityLocked
            ))
        }
        return out
    }

    static func footprintIoU(_ a: BoxPx, _ b: BoxPx) -> Double {
        let ix = max(0, min(a.x + a.w, b.x + b.w) - max(a.x, b.x))
        let iy = max(0, min(a.y + a.h, b.y + b.h) - max(a.y, b.y))
        let inter = ix * iy
        let union = a.w * a.h + b.w * b.h - inter
        guard union > 0 else { return 0 }
        return inter / union
    }

    /// 几何吻合(与网页端同一契约判据):footprint IoU ≥0.3 或中心互含
    static func geomMatch(_ a: BoxPx, _ b: BoxPx) -> Bool {
        footprintIoU(a, b) >= geomIoUMin
            || (a.contains(b.cx, b.cy) && b.contains(a.cx, a.cy))
    }

    /// 同 kind 或同族(cabinet/shelf/wall_cabinet…,族表与 ScanIdentity 单一权威)
    static func sameKindOrFamily(_ a: String, _ b: String) -> Bool {
        a == b || (ScanIdentity.kindFamily.first { $0.contains(a) }?.contains(b) ?? false)
    }

    /// 跨 kind 同位判重的足迹 IoU 门槛(比权威纠正的 geomIoUMin 0.3 严:
    /// 没有权威背书,只有几何自己说话,得压得更实才敢判重)
    static let storageDupIoUMin = 0.5

    /// 设备端同位去重的跨 kind 判定(真扫实测:同一台架子被同时检成
    /// shelf 与 cabinet,按 kind 比对漏网,导出成两件):
    /// 双方 kind 同属储物族(ScanIdentity.storageFamily 单一权威)、
    /// 足迹 IoU ≥0.5、且 elev 高度带相容(差 ≤18″,缺省视为 0 落地 ——
    /// 阈值与 ScanIdentity 的 elev 项同一约定)。
    /// 高度带是防误杀叠放的防线:电视架在格子柜上、吊柜在地柜正上方
    /// 都是合法同位不同物,一实测架空一落地(差 >18″)就不判重。
    static func storageColocatedDup(_ a: MappedItem, _ b: MappedItem) -> Bool {
        guard a.kind != b.kind,
              ScanIdentity.storageFamily.contains(a.kind),
              ScanIdentity.storageFamily.contains(b.kind),
              abs((a.elevIn ?? 0) - (b.elevIn ?? 0)) <= ScanIdentity.elevDiffMinIn
        else { return false }
        return footprintIoU(footprint(of: a), footprint(of: b)) >= storageDupIoUMin
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
        var elevIn: Double?
        var confidence: String?
        var styleKeys: [String]?
        var styleZh: String?
        var colorHex: String?
        /// 主色可信度(0..1);与 colorHex 配对,合并时同进同出
        var colorConfidence: Double?
        /// kind 识别可信度(0..1)
        var kindConfidence: Double?
        /// 最佳抓拍图 dHash(与 colorHex/photos 同属最佳一张,合并时随之继承)
        var photoHash: String?
        var photos: [FlatScene.ObjectPhoto]?
        /// 证据需求(EvidenceGuide 同一套分级:大件 3 / 中件 2 / 小件 1)——
        /// 上传的照片按它裁剪,多余方位不进桶(省流量省空间)
        var requiredShots: Int = 1
    }

    /// MappedItem 落盘时的轴对齐脚印(与第 8 步 placements/fixtures 的框同一算法)
    static func footprint(of m: MappedItem) -> BoxPx {
        let snapped = snappedRotation(axisDeg: m.axisDeg)
        let fw = (snapped == 0 || snapped == 180) ? m.widthPx : m.depthPx
        let fh = (snapped == 0 || snapped == 180) ? m.depthPx : m.widthPx
        return BoxPx(x: m.center.x - fw / 2, y: m.center.y - fh / 2, w: fw, h: fh)
    }

    /// 同 **kind** 且中心距 <0.6m 视为同一件。谁的尺寸可信:
    /// **置信度高的赢**(RoomPlan 对扫得不全的物体给偏小的包围盒,同时置信度掉级,
    /// 盲取更大的会把「误检的大框」当真);同级才取脚印更大(更完整)的那件。
    /// 两次测量差 >10cm 时留告警 —— 这正是「该补扫一圈」的信号。
    ///
    /// 例外:两次测量差 >100cm(`splitSuspectPx`)不再简单二选一 —— 真扫连续两轮,
    /// 厨房上柜整排被 RoomPlan 检成一只 12.3ft 巨柜,在 low-vs-low 对决里「大框」获胜,
    /// 方向反了。此时:权威副本里有几何吻合的已知件 → 取与权威尺寸更接近的那次;
    /// 没有权威参照 → 置信度高者赢,同级取**更小**的那件(RoomPlan 的误检偏大不偏小)。
    /// 按 kind 而非原始类目:oven/stove 都映射成 stove,一体机否则会重合两遍。
    /// 储物族补跨 kind 判定(storageColocatedDup):shelf+cabinet 同位重复识别
    /// 走同一套仲裁与合并,置信度优先保留。
    static func dedupMapped(
        _ items: [MappedItem],
        refs: [CanonicalRef] = [],
        warnings: inout [String]
    ) -> [MappedItem] {
        let mergeDistPx = 0.6 * pxPerM
        let disagreePx = 0.10 * pxPerM // 10cm:分米级承诺的红线
        var kept: [MappedItem] = []
        var dropped = 0
        for item in items {
            if let i = kept.firstIndex(where: { other in
                (other.kind == item.kind && length(other.center - item.center) < mergeDistPx)
                    || storageColocatedDup(other, item)
            }) {
                dropped += 1
                let old = kept[i]
                let dw = abs(old.widthPx - item.widthPx)
                let dd = abs(old.depthPx - item.depthPx)
                let oldRank = confidenceRank(old.confidence)
                let newRank = confidenceRank(item.confidence)
                let newWins: Bool
                if max(dw, dd) > splitSuspectPx {
                    let cm = Int((max(dw, dd) / pxPerM * 100).rounded())
                    warnings.append("「\(old.label)」两次测量尺寸差 \(cm)cm,疑似整排柜被并成一件,建议网页端拆分核对")
                    if let ref = arbitrationRef(old: old, new: item, refs: refs) {
                        // 权威副本是用户逐件校对过的一等数据:尺寸更接近它的那次赢
                        newWins = sizeDeltaToRef(item, ref) < sizeDeltaToRef(old, ref)
                    } else if newRank != oldRank {
                        newWins = newRank > oldRank
                    } else {
                        // 同级取更小:低置信度大框不许自动赢
                        newWins = item.widthPx * item.depthPx < old.widthPx * old.depthPx
                    }
                } else {
                    if max(dw, dd) > disagreePx {
                        let cm = Int((max(dw, dd) / pxPerM * 100).rounded())
                        warnings.append("「\(old.label)」两次测量尺寸差 \(cm)cm,已取更可信一次;建议对着它补扫确认")
                    }
                    newWins = newRank != oldRank
                        ? newRank > oldRank
                        : item.widthPx * item.depthPx > old.widthPx * old.depthPx
                }
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

    /// **prior-informed un-merge**:RoomPlan 把整排柜检成一个巨框时,用权威副本拆回原来的
    /// N 件。dedupMapped 的 >100cm 分支只会二选一挑更可信的一次测量 —— 从不拆分,一排三件
    /// 柜子最终还是一件。这里补上:一件扫描件的脚印**框住**了 ≥2 件同 kind/同族权威件
    /// (权威中心落进扫描框)且扫描件大到可疑(长边 > splitSuspectPx)→ 用那 N 件权威的
    /// 位置/尺寸/名字替换这一巨框。保守:命中 <2 原样留(单件走正常 reconcile);拆出的件
    /// **外观留空** —— 共享巨框裁剪不能可信地归给某一件(网页端认亲会接回权威照片,几何
    /// 以权威为准,重扫再补拍)。dedup 之后跑:拆出的件在各自权威位置,不会被再合并。纯函数。
    static func unmergeByCanonical(
        _ items: [MappedItem], refs: [CanonicalRef], warnings: inout [String]
    ) -> [MappedItem] {
        guard !refs.isEmpty else { return items }
        var out: [MappedItem] = []
        for item in items {
            guard max(item.widthPx, item.depthPx) > splitSuspectPx else { out.append(item); continue }
            let box = BoxPx(
                x: item.center.x - item.widthPx / 2, y: item.center.y - item.depthPx / 2,
                w: item.widthPx, h: item.depthPx
            )
            let hits = refs.filter { sameKindOrFamily(item.kind, $0.kind) && box.contains($0.box.cx, $0.box.cy) }
            guard hits.count >= 2 else { out.append(item); continue }
            warnings.append("用权威副本把「\(item.label)」拆回 \(hits.count) 件(RoomPlan 把整排并成了一件)")
            for r in hits {
                out.append(MappedItem(
                    kind: r.kind, label: r.label, isFixture: r.isFixture,
                    center: SIMD2(r.box.cx, r.box.cy), axisDeg: item.axisDeg,
                    widthPx: r.box.w, depthPx: r.box.h, draftIdx: item.draftIdx,
                    heightIn: nil, elevIn: r.elevIn, confidence: item.confidence,
                    styleKeys: nil, styleZh: nil, colorHex: nil, colorConfidence: nil,
                    kindConfidence: nil, photoHash: nil, photos: nil, requiredShots: 1
                ))
            }
        }
        return out
    }

    /// >100cm 仲裁用的权威参照:同 kind/同族、且与任一次测量几何吻合;
    /// 多个命中取 IoU 最大的
    private static func arbitrationRef(
        old: MappedItem,
        new: MappedItem,
        refs: [CanonicalRef]
    ) -> CanonicalRef? {
        let boxes = [footprint(of: old), footprint(of: new)]
        var best: (ref: CanonicalRef, iou: Double)?
        for ref in refs where sameKindOrFamily(old.kind, ref.kind) {
            guard boxes.contains(where: { geomMatch($0, ref.box) }) else { continue }
            let iou = boxes.map { footprintIoU($0, ref.box) }.max() ?? 0
            if best == nil || iou > best!.iou { best = (ref, iou) }
        }
        return best?.ref
    }

    /// 测量与权威尺寸的差(忽略 90° 朝向差,与 ScanIdentity.sizeDiff 同思路)
    private static func sizeDeltaToRef(_ m: MappedItem, _ ref: CanonicalRef) -> Double {
        let box = footprint(of: m)
        let direct = max(abs(box.w - ref.box.w), abs(box.h - ref.box.h))
        let swapped = max(abs(box.w - ref.box.h), abs(box.h - ref.box.w))
        return min(direct, swapped)
    }

    /// 检测陷阱纠正(权威件的用户纠正一等数据,去重之后、命名/落盘之前):
    ///
    /// 1) **别名认亲**:检测 kind ∈ 某权威件 `scanAliases` 且几何吻合
    ///    (IoU ≥0.3 或中心互含)→ 认作该件,沿用权威 kind 与 label;
    ///    跨列表跟着权威走(鸟笼是 placement,误检成 fixture「冰箱」也落回
    ///    placements);`identityLocked` 时尺寸也用权威值。
    ///    每个权威件至多认一件(几何最吻合者),多余的进第 2 步。
    /// 2) **压制**:认不上、却压在 identityLocked 件足迹上的跨族检测,
    ///    直接不进 payload —— 真扫实测:鸟笼被检成「冰箱」,认亲被跨 kind
    ///    否决拦不住,payload 里就出现了两台冰箱。跨列表也查(不能只比同列表)。
    ///    双方 elev 差 >18″ 不压制:吊柜叠在冰箱正上方是合法共存
    ///    (缺省视为 0 落地,阈值与 ScanIdentity 的 elev 项同一约定)。
    static func reconcileWithCanonical(
        _ items: [MappedItem],
        refs: [CanonicalRef],
        warnings: inout [String]
    ) -> [MappedItem] {
        guard !refs.isEmpty else { return items }

        // 1) 别名认亲:贪心按 IoU 配对,一个权威件只认一件
        struct Cand {
            var ii: Int
            var ri: Int
            var iou: Double
        }
        var cands: [Cand] = []
        for (ii, m) in items.enumerated() {
            let box = footprint(of: m)
            for (ri, ref) in refs.enumerated()
            where ref.scanAliases.contains(m.kind) && geomMatch(box, ref.box) {
                cands.append(Cand(ii: ii, ri: ri, iou: footprintIoU(box, ref.box)))
            }
        }
        cands.sort { $0.iou > $1.iou }
        var adoption: [Int: Int] = [:] // item idx → ref idx
        var usedRefs = Set<Int>()
        for c in cands where adoption[c.ii] == nil && !usedRefs.contains(c.ri) {
            adoption[c.ii] = c.ri
            usedRefs.insert(c.ri)
        }
        var out = items
        for (ii, ri) in adoption {
            let ref = refs[ri]
            out[ii].kind = ref.kind
            out[ii].label = ref.label
            out[ii].isFixture = ref.isFixture
            if ref.identityLocked {
                // 尺寸以权威为准:按落盘旋转对齐宽深,footprint 恰为权威框
                let snapped = snappedRotation(axisDeg: out[ii].axisDeg)
                if snapped == 90 || snapped == 270 {
                    out[ii].widthPx = ref.box.h
                    out[ii].depthPx = ref.box.w
                } else {
                    out[ii].widthPx = ref.box.w
                    out[ii].depthPx = ref.box.h
                }
            }
        }

        // 2) 压制疑似误检
        var suppressed = Set<Int>()
        for (ii, m) in out.enumerated() where adoption[ii] == nil {
            let box = footprint(of: m)
            for (ri, ref) in refs.enumerated() where ref.identityLocked {
                guard geomMatch(box, ref.box) else { continue }
                // 同 kind/同族是「它本人」,交给正常身份匹配,不压
                if sameKindOrFamily(m.kind, ref.kind) { continue }
                // 别名候选只是没抢到未占用的权威件 → 权威件空着就不压
                if ref.scanAliases.contains(m.kind), !usedRefs.contains(ri) { continue }
                // 立体分层共存(吊柜 vs 冰箱):elev 差 >18″ 不压
                if abs((m.elevIn ?? 0) - (ref.elevIn ?? 0)) > ScanIdentity.elevDiffMinIn { continue }
                suppressed.insert(ii)
                warnings.append("压制 1 件疑似误检(\(m.label) → \(ref.label),权威已锁定)")
                break
            }
        }
        guard !suppressed.isEmpty else { return out }
        return out.enumerated().filter { !suppressed.contains($0.offset) }.map(\.element)
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
        out.elevIn = out.elevIn ?? loser.elevIn
        out.confidence = out.confidence ?? loser.confidence
        out.styleKeys = out.styleKeys ?? loser.styleKeys
        out.styleZh = out.styleZh ?? loser.styleZh
        // colorHex 与 colorConfidence 是一对:winner 没颜色才整对取 loser 的,不混搭
        if out.colorHex == nil {
            out.colorHex = loser.colorHex
            out.colorConfidence = loser.colorConfidence
        }
        out.kindConfidence = out.kindConfidence ?? loser.kindConfidence
        // photoHash 与 photos 同源(都来自最佳一张):winner 没照片才整对取 loser 的
        if out.photos == nil { out.photoHash = loser.photoHash }
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

    // MARK: - 地理上下文

    /// 罗盘偏移 + 投影主方向旋转 → 平面图北向。
    /// GeoContext 给的是「场景系航向 → 真实方位」的偏移(bearing = sceneYaw +
    /// offset);投影又把场景整体转了 phi 对齐墙轴 —— 平面图正上 (0,-1) 对应
    /// 场景方向 rotate((0,-1), -phi),它的真实方位就是 planNorthDeg。
    static func planNorthDeg(offsetDeg: Double, phi: Double) -> Double {
        let u = rotate(SIMD2(0, -1), -phi)
        let sceneYaw = atan2(u.x, -u.y) * 180 / .pi
        return normalizeDeg(sceneYaw + offsetDeg)
    }

    /// GeoContext 摘要 → payload 的 meta.geo。没定位就整个不发(加法式字段)。
    static func geoMeta(
        _ geo: GeoContext.Summary?, phi: Double
    ) -> HomeOSProject.Meta.Geo? {
        guard let geo else { return nil }
        return .init(
            lat: round5(geo.lat),
            lon: round5(geo.lon),
            elevM: geo.elevM.map { round1($0) },
            horizAccM: geo.horizAccM.map { round1($0) },
            planNorthDeg: geo.offsetDeg.map {
                round1(planNorthDeg(offsetDeg: $0, phi: phi))
            },
            headingAccDeg: geo.headingAccDeg.map { round1($0) }
        )
    }

    /// 经纬度保留 5 位小数(~1.1m),再多是虚假精度、还徒增隐私面
    private static func round5(_ v: Double) -> Double {
        (v * 100000).rounded() / 100000
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
