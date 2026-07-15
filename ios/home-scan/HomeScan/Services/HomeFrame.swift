import Foundation
import simd

/// 设备端 Home Frame 重定位 —— 扫描现场就把「正在扫的墙」对齐到永久户型坐标,
/// HUD 实时显示「已对齐 ✓(残差)」,并据此算出「哪个房间还没扫」。
///
/// 算法与网页端 `apps/home/src/lib/spatial/scan-register.js` **同源移植**
/// (改动需两处同步):轴对齐墙段 1D 投票求 SE(2),yaw ∈ {0,90,180,270},
/// **永远禁止缩放**;验收门 ≥3 段匹配墙 + 两朝向都有 + 中位 ≤7cm + P95 ≤15cm。
/// 差异只有单位:这里全程用**米**(实时墙是 ARKit 世界系米),网页端用 plan px。
///
/// 实时墙是任意朝向的(ARKit 世界系跟启动位姿走),先用主方向对齐拉平
/// (与 PlanProjector.dominantRotation 同一套数学),再走量化 yaw 配准。
enum HomeFrame {
    /// 轴对齐墙段(米)。vertical=true:x=at 恒定,y 从 lo 到 hi
    struct Segment {
        var vertical: Bool
        var at: Double
        var lo: Double
        var hi: Double
        var len: Double { hi - lo }
    }

    struct Registration {
        var ok: Bool
        /// 量化朝向差(度)+ 平移(米):axisAligned(live) → home
        var yawDeg: Int
        var tx: Double
        var ty: Double
        var medianCm: Double
        var p95Cm: Double
        var matchedWalls: Int
        var reason: String?
        /// 主方向拉平角(弧度)—— 完整变换 = rotate(phi) → rotate(yaw) → +t
        var phi: Double
    }

    // 验收门与聚类参数(米;与 scan-register.js 的 px 常数一一对应)
    static let shiftClusterM = 0.10
    static let lenRatio = 0.5...2.0
    static let minOverlap = 0.3
    static let acceptMedianM = 0.07
    static let acceptP95M = 0.15
    static let acceptMinWalls = 3
    /// 拉平后仍偏轴超过 ~3° 的墙段不参与(斜墙/噪声)
    static let axisToleranceRad = 3.0 * .pi / 180

    /// 户型 wallGraph(plan px)→ 轴对齐墙段(米)
    static func segments(fromWallGraph g: HomeOSProject.WallGraph) -> [Segment] {
        let mPerPx = 0.3048 / g.pxPerFt
        var byId: [String: HomeOSProject.Vertex] = [:]
        for v in g.vertices { byId[v.id] = v }
        var out: [Segment] = []
        for e in g.edges {
            guard let a = byId[e.a], let b = byId[e.b] else { continue }
            if abs(a.x - b.x) < 1.5 {
                let lo = min(a.y, b.y) * mPerPx
                let hi = max(a.y, b.y) * mPerPx
                out.append(Segment(vertical: true, at: a.x * mPerPx, lo: lo, hi: hi))
            } else if abs(a.y - b.y) < 1.5 {
                let lo = min(a.x, b.x) * mPerPx
                let hi = max(a.x, b.x) * mPerPx
                out.append(Segment(vertical: false, at: a.y * mPerPx, lo: lo, hi: hi))
            }
        }
        return out.filter { $0.len > 0.03 }
    }

    /// 实时墙(世界系线段)→ 主方向拉平 → 轴对齐墙段。返回 (segments, phi)
    static func axisAlign(walls: [(a: SIMD2<Double>, b: SIMD2<Double>)]) -> ([Segment], Double) {
        // 加权圆均值(角度对 90° 取模)—— 与 PlanProjector.dominantRotation 同源
        var sx = 0.0
        var sy = 0.0
        for w in walls {
            let d = w.b - w.a
            let len = length(d)
            guard len > 0.05 else { continue }
            let theta = atan2(d.y, d.x)
            sx += cos(4 * theta) * len
            sy += sin(4 * theta) * len
        }
        let phi = (sx == 0 && sy == 0) ? 0 : -atan2(sy, sx) / 4
        let rot = SIMD2(cos(phi), sin(phi))
        func apply(_ p: SIMD2<Double>) -> SIMD2<Double> {
            SIMD2(p.x * rot.x - p.y * rot.y, p.x * rot.y + p.y * rot.x)
        }
        var out: [Segment] = []
        for w in walls {
            let a = apply(w.a)
            let b = apply(w.b)
            let d = b - a
            let len = length(d)
            guard len > 0.15 else { continue }
            let ang = abs(atan2(d.y, d.x))
            let offV = abs(ang - .pi / 2)
            let offH = min(ang, abs(ang - .pi))
            if offV < axisToleranceRad {
                out.append(Segment(vertical: true, at: (a.x + b.x) / 2, lo: min(a.y, b.y), hi: max(a.y, b.y)))
            } else if offH < axisToleranceRad {
                out.append(Segment(vertical: false, at: (a.y + b.y) / 2, lo: min(a.x, b.x), hi: max(a.x, b.x)))
            }
        }
        return (out, phi)
    }

    private static func rotate(_ yaw: Int, _ p: SIMD2<Double>) -> SIMD2<Double> {
        switch yaw {
        case 90: return SIMD2(-p.y, p.x)
        case 180: return SIMD2(-p.x, -p.y)
        case 270: return SIMD2(p.y, -p.x)
        default: return p
        }
    }

    private static func rotateSeg(_ yaw: Int, _ s: Segment) -> Segment {
        let a = rotate(yaw, s.vertical ? SIMD2(s.at, s.lo) : SIMD2(s.lo, s.at))
        let b = rotate(yaw, s.vertical ? SIMD2(s.at, s.hi) : SIMD2(s.hi, s.at))
        if abs(a.x - b.x) < 0.015 {
            return Segment(vertical: true, at: a.x, lo: min(a.y, b.y), hi: max(a.y, b.y))
        }
        return Segment(vertical: false, at: a.y, lo: min(a.x, b.x), hi: max(a.x, b.x))
    }

    private struct Cand {
        var delta: Double
        var weight: Double
    }

    private static func bestShift(_ cands: [Cand]) -> (delta: Double, weight: Double)? {
        guard !cands.isEmpty else { return nil }
        let sorted = cands.sorted { $0.delta < $1.delta }
        var best: (delta: Double, weight: Double)?
        for i in sorted.indices {
            var weight = 0.0
            var sum = 0.0
            for j in i..<sorted.count {
                if sorted[j].delta - sorted[i].delta > shiftClusterM { break }
                weight += sorted[j].weight
                sum += sorted[j].delta * sorted[j].weight
            }
            if best == nil || weight > best!.weight {
                best = (sum / weight, weight)
            }
        }
        return best
    }

    private static func weightedPercentile(_ items: [(value: Double, weight: Double)], _ q: Double) -> Double {
        guard !items.isEmpty else { return .infinity }
        let sorted = items.sorted { $0.value < $1.value }
        let total = sorted.reduce(0) { $0 + $1.weight }
        var acc = 0.0
        for it in sorted {
            acc += it.weight
            if acc >= total * q { return it.value }
        }
        return sorted[sorted.count - 1].value
    }

    private struct Score {
        var medianM: Double
        var p95M: Double
        var matchedLen: Double
        var matchedV: Int
        var matchedH: Int
    }

    private static func score(_ scanSegs: [Segment], _ homeSegs: [Segment], yaw: Int, tx: Double, ty: Double) -> Score {
        var residuals: [(value: Double, weight: Double)] = []
        var matchedLen = 0.0
        var matchedV = 0
        var matchedH = 0
        for raw in scanSegs {
            let s = rotateSeg(yaw, raw)
            let at = s.at + (s.vertical ? tx : ty)
            let lo = s.lo + (s.vertical ? ty : tx)
            let hi = s.hi + (s.vertical ? ty : tx)
            var best: Double?
            for l in homeSegs where l.vertical == s.vertical {
                let overlap = min(l.hi, hi) - max(l.lo, lo)
                guard overlap >= s.len * minOverlap else { continue }
                let d = abs(l.at - at)
                if best == nil || d < best! { best = d }
            }
            guard let best else { continue }
            residuals.append((best, s.len))
            if best <= acceptP95M {
                matchedLen += s.len
                if s.vertical { matchedV += 1 } else { matchedH += 1 }
            }
        }
        return Score(
            medianM: weightedPercentile(residuals, 0.5),
            p95M: weightedPercentile(residuals, 0.95),
            matchedLen: matchedLen,
            matchedV: matchedV,
            matchedH: matchedH
        )
    }

    /// 扫描墙段(已主方向拉平)→ 家坐标系的量化刚性配准
    static func register(scan scanSegs: [Segment], home homeSegs: [Segment], phi: Double = 0) -> Registration {
        func fail(_ reason: String) -> Registration {
            Registration(ok: false, yawDeg: 0, tx: 0, ty: 0, medianCm: .infinity, p95Cm: .infinity,
                         matchedWalls: 0, reason: reason, phi: phi)
        }
        guard !scanSegs.isEmpty else { return fail("还没有可用的墙段") }
        guard !homeSegs.isEmpty else { return fail("户型没有可用墙段") }

        var best: (yaw: Int, tx: Double, ty: Double, score: Score)?
        for yaw in [0, 90, 180, 270] {
            var txCands: [Cand] = []
            var tyCands: [Cand] = []
            for raw in scanSegs {
                let s = rotateSeg(yaw, raw)
                for l in homeSegs where l.vertical == s.vertical {
                    let ratio = s.len / l.len
                    guard lenRatio.contains(ratio) else { continue }
                    let cand = Cand(delta: l.at - s.at, weight: min(s.len, l.len))
                    if s.vertical { txCands.append(cand) } else { tyCands.append(cand) }
                }
            }
            guard let sx = bestShift(txCands), let sy = bestShift(tyCands) else { continue }
            let sc = score(scanSegs, homeSegs, yaw: yaw, tx: sx.delta, ty: sy.delta)
            if best == nil || sc.matchedLen > best!.score.matchedLen {
                best = (yaw, sx.delta, sy.delta, sc)
            }
        }
        guard let best else { return fail("与户型墙体对不上(朝向差异过大或缺扫)") }

        let matchedWalls = best.score.matchedV + best.score.matchedH
        var reason: String?
        if matchedWalls < acceptMinWalls {
            reason = "匹配墙段太少(\(matchedWalls))"
        } else if best.score.matchedV < 1 || best.score.matchedH < 1 {
            reason = "只有单一朝向的墙匹配上"
        } else if best.score.medianM > acceptMedianM {
            reason = String(format: "墙面中位残差 %.0fcm 超过 7cm", best.score.medianM * 100)
        } else if best.score.p95M > acceptP95M {
            reason = String(format: "墙面 P95 残差 %.0fcm 超过 15cm", best.score.p95M * 100)
        }
        return Registration(
            ok: reason == nil,
            yawDeg: best.yaw,
            tx: best.tx,
            ty: best.ty,
            medianCm: (best.score.medianM * 1000).rounded() / 10,
            p95Cm: (best.score.p95M * 1000).rounded() / 10,
            matchedWalls: matchedWalls,
            reason: reason,
            phi: phi
        )
    }

    /// 完整点变换:ARKit 世界系俯视点 → 家坐标(米)
    static func toHome(_ p: SIMD2<Double>, _ r: Registration) -> SIMD2<Double> {
        let rot = SIMD2(cos(r.phi), sin(r.phi))
        let q = SIMD2(p.x * rot.x - p.y * rot.y, p.x * rot.y + p.y * rot.x)
        let y = rotate(r.yawDeg, q)
        return SIMD2(y.x + r.tx, y.y + r.ty)
    }

    // MARK: - 房间覆盖(漏扫检测)

    /// 配准成功后:已扫墙的端点投到家坐标,离房间多边形 ≤tol 或落在里面就算「到过」。
    /// 返回**还没扫到**的房间名(按户型 zones 顺序)。
    static func uncoveredRooms(
        zones: [HomeOSProject.Zone],
        pxPerFt: Double,
        liveWalls: [(a: SIMD2<Double>, b: SIMD2<Double>)],
        registration r: Registration,
        tolM: Double = 1.0
    ) -> [String] {
        guard r.ok else { return [] }
        let mPerPx = 0.3048 / pxPerFt
        var pts: [SIMD2<Double>] = []
        for w in liveWalls {
            pts.append(toHome(w.a, r))
            pts.append(toHome(w.b, r))
            pts.append(toHome((w.a + w.b) / 2, r))
        }
        var missing: [String] = []
        for z in zones {
            let poly = z.polygon.map { SIMD2($0.x * mPerPx, $0.y * mPerPx) }
            guard poly.count >= 3 else { continue }
            let touched = pts.contains { p in
                contains(poly, p) || distance(toPolygon: poly, from: p) <= tolM
            }
            if !touched { missing.append(z.nameZh) }
        }
        return missing
    }

    static func contains(_ poly: [SIMD2<Double>], _ p: SIMD2<Double>) -> Bool {
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

    private static func distance(toPolygon poly: [SIMD2<Double>], from p: SIMD2<Double>) -> Double {
        var best = Double.infinity
        var j = poly.count - 1
        for i in poly.indices {
            let a = poly[j]
            let b = poly[i]
            let ab = b - a
            let t = max(0, min(1, dot(p - a, ab) / max(1e-9, dot(ab, ab))))
            best = min(best, length(p - (a + ab * t)))
            j = i
        }
        return best
    }
}
