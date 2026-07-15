import Foundation
import simd

/// 家具多视角证据完备度 —— 判断「哪件家具还缺哪个侧面的照片」并给出
/// 具体站位引导(纯几何 + 文案,无 ARKit 依赖,模拟器单测全覆盖)。
///
/// 方位桶与 ObjectShotCapture 同一套定义:物体中心 → 相机的俯视方位角
/// (atan2 惯例,0..360°),每 90° 一桶共 4 桶。大件家具要求 ≥3 桶、中件
/// ≥2 桶、小件 ≥1 桶 —— 但**靠墙的方位拍不到**(人站不进去/视线穿墙),
/// 用实时墙体把不可达的桶剔出要求,否则会永远引导用户「绕到沙发背后」。
enum EvidenceGuide {
    struct Furniture {
        var id: UUID
        var category: String
        /// 世界系俯视中心 (x, z),米
        var center: SIMD2<Double>
        var widthM: Double
        var depthM: Double
        /// 已有照片的方位桶(0-3)
        var binsCovered: Set<Int>
    }

    struct Wall {
        var a: SIMD2<Double>
        var b: SIMD2<Double>
    }

    /// 一件家具的证据缺口
    struct Deficit {
        var furniture: Furniture
        /// 已覆盖桶数(含碰巧拍到的「不可达」桶)
        var covered: Int
        /// 对这件的要求(已按可达桶数收缩)
        var required: Int
        /// 还能去补拍的方位桶 → 实际能站的补拍点(按桶号升序)
        var missing: [(bin: Int, standpoint: SIMD2<Double>)]
        var missingBins: [Int] { missing.map(\.bin) }
    }

    /// 站位离墙至少这么近就算「站不进去」
    static let minWallClearance = 0.35
    /// 退无可退:比它还近就拍不出有效视角了
    static let minStandRadius = 0.7
    /// 理想站位半径:家具越大退得越远才能全身入画
    static func standRadius(_ f: Furniture) -> Double {
        min(max(1.0, 0.6 + max(f.widthM, f.depthM)), 2.4)
    }

    /// 按平面尺寸分级的视角要求:大件(床/沙发/柜)3 桶,中件 2 桶,小件 1 桶
    static func requiredBins(_ f: Furniture) -> Int {
        let side = max(f.widthM, f.depthM)
        if side >= 0.9 { return 3 }
        if side >= 0.45 { return 2 }
        return 1
    }

    /// 桶中心方位角(度):桶 k 覆盖 [90k, 90k+90)
    static func binCenterDeg(_ bin: Int) -> Double {
        Double(bin) * 90 + 45
    }

    /// 理想站位(不考虑墙;实际补拍点见 clearStandpoint)
    static func standpoint(for f: Furniture, bin: Int) -> SIMD2<Double> {
        point(for: f, bin: bin, radius: standRadius(f))
    }

    private static func point(for f: Furniture, bin: Int, radius: Double) -> SIMD2<Double> {
        let az = binCenterDeg(bin) * .pi / 180
        return f.center + SIMD2(cos(az), sin(az)) * radius
    }

    /// 这个方位实际能站的补拍点:从理想半径往里退着试(小房间站不到 2.4m
    /// 远,但退到 1m 一样能拍),视线不穿墙、站位不贴墙才算数;
    /// 退到 minStandRadius 还不行 → nil(家具这一侧贴墙,拍不到)。
    static func clearStandpoint(_ f: Furniture, bin: Int, walls: [Wall]) -> SIMD2<Double>? {
        var radius = standRadius(f)
        while radius >= minStandRadius {
            let p = point(for: f, bin: bin, radius: radius)
            let blocked = walls.contains { w in
                segmentsIntersect(f.center, p, w.a, w.b)
                    || distanceToSegment(p, w.a, w.b) < minWallClearance
            }
            if !blocked { return p }
            radius *= 0.75
        }
        return nil
    }

    /// 这个方位桶能不能站人(家具背面贴墙 → 那一桶不可达,不该要求也不该引导)
    static func reachable(_ f: Furniture, bin: Int, walls: [Wall]) -> Bool {
        clearStandpoint(f, bin: bin, walls: walls) != nil
    }

    /// 全部家具的证据缺口(covered ≥ required 的不出现在结果里)
    static func deficits(furnitures: [Furniture], walls: [Wall]) -> [Deficit] {
        var out: [Deficit] = []
        for f in furnitures {
            var missing: [(bin: Int, standpoint: SIMD2<Double>)] = []
            var reachableBins: Set<Int> = []
            for bin in 0..<4 {
                guard let p = clearStandpoint(f, bin: bin, walls: walls) else { continue }
                reachableBins.insert(bin)
                if !f.binsCovered.contains(bin) {
                    missing.append((bin: bin, standpoint: p))
                }
            }
            // 碰巧从「不可达」方位拍到的照片一样是证据,计入分母上限
            let attainable = reachableBins.union(f.binsCovered)
            let required = min(requiredBins(f), attainable.count)
            guard f.binsCovered.count < required else { continue }
            out.append(
                Deficit(
                    furniture: f,
                    covered: f.binsCovered.count,
                    required: required,
                    missing: missing
                )
            )
        }
        return out
    }

    // MARK: - 扫描中 HUD 引导

    struct Guidance {
        var objectId: UUID
        var bin: Int
        var text: String
    }

    /// 挑最值得补的一件(缺口最大,平手取离相机最近),给出具体走位。
    /// `holdTarget` 传上一次的目标 —— 只要它还缺,就继续引导同一件同一桶,
    /// 避免 HUD 在多件家具之间来回跳。
    static func guidance(
        deficits: [Deficit],
        cameraPos: SIMD2<Double>,
        cameraForwardDeg: Double,
        holdTarget: (objectId: UUID, bin: Int)? = nil
    ) -> Guidance? {
        guard !deficits.isEmpty else { return nil }

        // 上一个目标还在缺 → 锁定不换(文案里的距离会随走动实时刷新)
        if let hold = holdTarget,
           let d = deficits.first(where: { $0.furniture.id == hold.objectId }),
           let m = d.missing.first(where: { $0.bin == hold.bin }) {
            return Guidance(
                objectId: hold.objectId,
                bin: hold.bin,
                text: text(for: d, at: m.standpoint, cameraPos: cameraPos, cameraForwardDeg: cameraForwardDeg)
            )
        }

        // 缺口在但没有可去的补拍点(缺的方位全贴墙)的,引导不了,跳过
        let target = deficits.filter { !$0.missing.isEmpty }.max { a, b in
            let ga = a.required - a.covered
            let gb = b.required - b.covered
            if ga != gb { return ga < gb }
            return simd_length(a.furniture.center - cameraPos)
                > simd_length(b.furniture.center - cameraPos)
        }
        guard let target, !target.missing.isEmpty else { return nil }

        // 缺的几个方位里挑走过去最近的
        let pick = target.missing.min { a, b in
            simd_length(a.standpoint - cameraPos) < simd_length(b.standpoint - cameraPos)
        }!
        return Guidance(
            objectId: target.furniture.id,
            bin: pick.bin,
            text: text(for: target, at: pick.standpoint, cameraPos: cameraPos, cameraForwardDeg: cameraForwardDeg)
        )
    }

    private static func text(
        for deficit: Deficit,
        at stand: SIMD2<Double>,
        cameraPos: SIMD2<Double>,
        cameraForwardDeg: Double
    ) -> String {
        let name = zhName(deficit.furniture.category)
        let dist = simd_length(stand - cameraPos)
        if dist < 0.8 {
            return "就在这里:对准「\(name)」稳住 2 秒,补上这一侧"
        }
        let dir = relativeDirection(
            from: cameraPos,
            forwardDeg: cameraForwardDeg,
            to: stand
        )
        let meters = (dist * 2).rounded() / 2
        let distText = meters == meters.rounded()
            ? String(format: "%.0f", meters)
            : String(format: "%.1f", meters)
        return "「\(name)」还缺一个侧面:朝\(dir)走约 \(distText) 米,对准它稳住 2 秒"
    }

    /// 目标相对相机朝向的人话方向。
    /// 俯视图 x 右、z 下与楼层平面同手性:方位角正向偏移 = 右手边。
    static func relativeDirection(
        from cameraPos: SIMD2<Double>,
        forwardDeg: Double,
        to target: SIMD2<Double>
    ) -> String {
        let v = target - cameraPos
        let bearing = atan2(v.y, v.x) * 180 / .pi
        var d = (bearing - forwardDeg).truncatingRemainder(dividingBy: 360)
        if d > 180 { d -= 360 }
        if d < -180 { d += 360 }
        switch d {
        case -25...25: return "正前方"
        case 25...70: return "右前方"
        case 70...110: return "右手边"
        case 110...155: return "右后方"
        case -70 ..< -25: return "左前方"
        case -110 ..< -70: return "左手边"
        case -155 ..< -110: return "左后方"
        default: return "正后方"
        }
    }

    // MARK: - 扫描完成后的证据总结(进 scanWarnings,预览页「提醒」区显示)

    /// FlatScene → 证据不足家具的汇总警告(最多一条,免得刷屏)。
    static func sceneWarnings(_ scene: FlatScene) -> [String] {
        let walls = scene.walls.map { Wall(a: $0.a, b: $0.b) }
        let furnitures = scene.items.map { item in
            Furniture(
                id: UUID(),
                category: item.category,
                center: item.center,
                widthM: item.widthM,
                depthM: item.depthM,
                binsCovered: Set(item.photos.compactMap { p in
                    p.azimuthDeg.map { min(3, max(0, Int($0 / 90))) }
                })
            )
        }
        let short = deficits(furnitures: furnitures, walls: walls)
        guard !short.isEmpty else { return [] }
        let names = short
            .sorted { ($0.required - $0.covered) > ($1.required - $1.covered) }
            .map { "\(zhName($0.furniture.category)) \($0.covered)/\($0.required) 个方位" }
        let head = names.prefix(4).joined(separator: "、")
        let tail = names.count > 4 ? " 等 \(names.count) 件" : ""
        return ["\(names.count) 件家具照片证据不足:\(head)\(tail) —— 下次扫描绕它们多拍几个侧面,颜色和尺寸会更准"]
    }

    /// RoomPlan 类目 → 中文名(引导文案用)
    static func zhName(_ category: String) -> String {
        KindMaps.placementKinds[category]?.label
            ?? KindMaps.fixtureKinds[category]?.label
            ?? category
    }

    // MARK: - 几何小件

    /// 线段相交(含端点触碰按相交算 —— 视线擦着墙也算被挡)
    static func segmentsIntersect(
        _ p1: SIMD2<Double>, _ p2: SIMD2<Double>,
        _ q1: SIMD2<Double>, _ q2: SIMD2<Double>
    ) -> Bool {
        func cross(_ o: SIMD2<Double>, _ a: SIMD2<Double>, _ b: SIMD2<Double>) -> Double {
            (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
        }
        let d1 = cross(q1, q2, p1)
        let d2 = cross(q1, q2, p2)
        let d3 = cross(p1, p2, q1)
        let d4 = cross(p1, p2, q2)
        if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)),
           ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)) {
            return true
        }
        // 共线/端点触碰:投影重叠即算
        func onSegment(_ a: SIMD2<Double>, _ b: SIMD2<Double>, _ p: SIMD2<Double>) -> Bool {
            abs(cross(a, b, p)) < 1e-12
                && p.x >= min(a.x, b.x) - 1e-12 && p.x <= max(a.x, b.x) + 1e-12
                && p.y >= min(a.y, b.y) - 1e-12 && p.y <= max(a.y, b.y) + 1e-12
        }
        return onSegment(q1, q2, p1) || onSegment(q1, q2, p2)
            || onSegment(p1, p2, q1) || onSegment(p1, p2, q2)
    }

    static func distanceToSegment(
        _ p: SIMD2<Double>, _ a: SIMD2<Double>, _ b: SIMD2<Double>
    ) -> Double {
        let ab = b - a
        let len2 = simd_length_squared(ab)
        guard len2 > 1e-12 else { return simd_length(p - a) }
        let t = max(0, min(1, simd_dot(p - a, ab) / len2))
        return simd_length(p - (a + ab * t))
    }
}
