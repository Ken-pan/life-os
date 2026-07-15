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
        /// 主方向拉平角(弧度)—— 完整变换 = rotate(phi) → rotate(yaw) → +t → 精修
        var phi: Double
        /// 点到线小角精修(与 scan-register.js 同源,改动两处同步):
        /// 量化 yaw 只到 90° 网格,手持残余 0.5-1.5° 由这一步补掉。
        /// 全 0 = 没精修或没变好。绕 (refineCx, refineCy) 转 refineTheta 再平移。
        var refineTheta: Double = 0
        var refineCx: Double = 0
        var refineCy: Double = 0
        var refineDx: Double = 0
        var refineDy: Double = 0
        /// 展示用(度)
        var refineDeg: Double = 0
    }

    /// 精修的小角度上限(弧度):超过说明配错了,别让精修焊死错误
    static let refineMaxRad = 3.0 * .pi / 180
    /// 精修最少采样点(≈2 段墙)
    static let refineMinSamples = 6

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
        let segs = scanSegs.map { raw -> Segment in
            let s = rotateSeg(yaw, raw)
            return Segment(
                vertical: s.vertical,
                at: s.at + (s.vertical ? tx : ty),
                lo: s.lo + (s.vertical ? ty : tx),
                hi: s.hi + (s.vertical ? ty : tx)
            )
        }
        return scoreSegs(segs, homeSegs)
    }

    /// 量化解之后的点到线小角精修(与 scan-register.js refineTransform 同源):
    /// 匹配墙段采样(两端+中点)对目标墙线做加权最小二乘,解 (θ, dx, dy),
    /// 绕采样质心转(大坐标绕原点解病态)。样本不足/解奇异返回 nil。
    private static func refine(
        _ scanSegs: [Segment], _ homeSegs: [Segment], yaw: Int, tx: Double, ty: Double
    ) -> (theta: Double, dx: Double, dy: Double, cx: Double, cy: Double)? {
        struct Sample {
            var x: Double
            var y: Double
            var vertical: Bool
            var target: Double
            var w: Double
        }
        var samples: [Sample] = []
        for raw in scanSegs {
            let s0 = rotateSeg(yaw, raw)
            let at = s0.at + (s0.vertical ? tx : ty)
            let lo = s0.lo + (s0.vertical ? ty : tx)
            let hi = s0.hi + (s0.vertical ? ty : tx)
            var bestL: Segment?
            var bestD: Double?
            for l in homeSegs where l.vertical == s0.vertical {
                let overlap = min(l.hi, hi) - max(l.lo, lo)
                guard overlap >= s0.len * minOverlap else { continue }
                let d = abs(l.at - at)
                if bestD == nil || d < bestD! {
                    bestD = d
                    bestL = l
                }
            }
            // 离群墙(超 P95 门)不进精修 —— 会把最小二乘拽歪
            guard let target = bestL?.at, let d = bestD, d <= acceptP95M else { continue }
            let w = s0.len / 3
            for t in [lo, (lo + hi) / 2, hi] {
                samples.append(
                    s0.vertical
                        ? Sample(x: at, y: t, vertical: true, target: target, w: w)
                        : Sample(x: t, y: at, vertical: false, target: target, w: w)
                )
            }
        }
        guard samples.count >= refineMinSamples else { return nil }

        var wSum = 0.0
        var cx = 0.0
        var cy = 0.0
        for p in samples {
            wSum += p.w
            cx += p.x * p.w
            cy += p.y * p.w
        }
        cx /= wSum
        cy /= wSum

        // 未知量 u = [θ, dx, dy];竖墙行 [-(y-cy),1,0]·u = target-x,
        // 横墙行 [(x-cx),0,1]·u = target-y。加权正规方程 3×3。
        var A = [[0.0, 0, 0], [0.0, 0, 0], [0.0, 0, 0]]
        var b = [0.0, 0, 0]
        for p in samples {
            let row = p.vertical ? [-(p.y - cy), 1, 0] : [p.x - cx, 0, 1]
            let rhs = p.vertical ? p.target - p.x : p.target - p.y
            for i in 0..<3 {
                for j in 0..<3 { A[i][j] += p.w * row[i] * row[j] }
                b[i] += p.w * row[i] * rhs
            }
        }
        guard let u = solve3x3(A, b) else { return nil }
        return (u[0], u[1], u[2], cx, cy)
    }

    /// 3×3 线性方程组(带主元高斯消元);奇异返回 nil
    private static func solve3x3(_ A: [[Double]], _ b: [Double]) -> [Double]? {
        var m = A.enumerated().map { $0.element + [b[$0.offset]] }
        for col in 0..<3 {
            var pivot = col
            for r in (col + 1)..<3 where abs(m[r][col]) > abs(m[pivot][col]) { pivot = r }
            guard abs(m[pivot][col]) > 1e-9 else { return nil }
            m.swapAt(col, pivot)
            for r in 0..<3 where r != col {
                let f = m[r][col] / m[col][col]
                for c in col..<4 { m[r][c] -= f * m[col][c] }
            }
        }
        return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]]
    }

    /// 精修后的打分:精确旋转端点,按主方向重建(近)轴对齐段再对墙线打分
    private static func scoreRefined(
        _ scanSegs: [Segment], _ homeSegs: [Segment],
        apply: (SIMD2<Double>) -> SIMD2<Double>
    ) -> Score {
        var segs: [Segment] = []
        for raw in scanSegs {
            let p1 = raw.vertical ? SIMD2(raw.at, raw.lo) : SIMD2(raw.lo, raw.at)
            let p2 = raw.vertical ? SIMD2(raw.at, raw.hi) : SIMD2(raw.hi, raw.at)
            let q1 = apply(p1)
            let q2 = apply(p2)
            let vertical = abs(q2.x - q1.x) < abs(q2.y - q1.y)
            segs.append(Segment(
                vertical: vertical,
                at: vertical ? (q1.x + q2.x) / 2 : (q1.y + q2.y) / 2,
                lo: vertical ? min(q1.y, q2.y) : min(q1.x, q2.x),
                hi: vertical ? max(q1.y, q2.y) : max(q1.x, q2.x)
            ))
        }
        return scoreSegs(segs, homeSegs)
    }

    /// 一组(近)轴对齐段对户型墙打分 —— score/scoreRefined 共用
    private static func scoreSegs(_ segs: [Segment], _ homeSegs: [Segment]) -> Score {
        var residuals: [(value: Double, weight: Double)] = []
        var matchedLen = 0.0
        var matchedV = 0
        var matchedH = 0
        for s in segs {
            var best: Double?
            for l in homeSegs where l.vertical == s.vertical {
                let overlap = min(l.hi, s.hi) - max(l.lo, s.lo)
                guard overlap >= s.len * minOverlap else { continue }
                let d = abs(l.at - s.at)
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

        // 点到线小角精修:只有真把中位残差降下来才收(与 scan-register.js 同源)
        var finalScore = best.score
        var refined: (theta: Double, dx: Double, dy: Double, cx: Double, cy: Double)?
        if let ref = refine(scanSegs, homeSegs, yaw: best.yaw, tx: best.tx, ty: best.ty),
           abs(ref.theta) <= refineMaxRad {
            let ct = cos(ref.theta)
            let st = sin(ref.theta)
            let applyRefined: (SIMD2<Double>) -> SIMD2<Double> = { p0 in
                let q = rotate(best.yaw, p0)
                let v = SIMD2(q.x + best.tx, q.y + best.ty)
                let d = v - SIMD2(ref.cx, ref.cy)
                return SIMD2(
                    ref.cx + d.x * ct - d.y * st + ref.dx,
                    ref.cy + d.x * st + d.y * ct + ref.dy
                )
            }
            let refinedScore = scoreRefined(scanSegs, homeSegs, apply: applyRefined)
            if refinedScore.medianM < best.score.medianM {
                finalScore = refinedScore
                refined = ref
            }
        }

        let matchedWalls = finalScore.matchedV + finalScore.matchedH
        var reason: String?
        if matchedWalls < acceptMinWalls {
            reason = "匹配墙段太少(\(matchedWalls))"
        } else if finalScore.matchedV < 1 || finalScore.matchedH < 1 {
            reason = "只有单一朝向的墙匹配上"
        } else if finalScore.medianM > acceptMedianM {
            reason = String(format: "墙面中位残差 %.0fcm 超过 7cm", finalScore.medianM * 100)
        } else if finalScore.p95M > acceptP95M {
            reason = String(format: "墙面 P95 残差 %.0fcm 超过 15cm", finalScore.p95M * 100)
        }
        return Registration(
            ok: reason == nil,
            yawDeg: best.yaw,
            tx: best.tx,
            ty: best.ty,
            medianCm: (finalScore.medianM * 1000).rounded() / 10,
            p95Cm: (finalScore.p95M * 1000).rounded() / 10,
            matchedWalls: matchedWalls,
            reason: reason,
            phi: phi,
            refineTheta: refined?.theta ?? 0,
            refineCx: refined?.cx ?? 0,
            refineCy: refined?.cy ?? 0,
            refineDx: refined?.dx ?? 0,
            refineDy: refined?.dy ?? 0,
            refineDeg: refined.map { ($0.theta * 180 / .pi * 100).rounded() / 100 } ?? 0
        )
    }

    /// 完整点变换:ARKit 世界系俯视点 → 家坐标(米)
    static func toHome(_ p: SIMD2<Double>, _ r: Registration) -> SIMD2<Double> {
        let rot = SIMD2(cos(r.phi), sin(r.phi))
        let q = SIMD2(p.x * rot.x - p.y * rot.y, p.x * rot.y + p.y * rot.x)
        let y = rotate(r.yawDeg, q)
        let v = SIMD2(y.x + r.tx, y.y + r.ty)
        // 精修(有才应用):绕质心小角旋转 + 平移
        guard r.refineTheta != 0 || r.refineDx != 0 || r.refineDy != 0 else { return v }
        let ct = cos(r.refineTheta)
        let st = sin(r.refineTheta)
        let d = v - SIMD2(r.refineCx, r.refineCy)
        return SIMD2(
            r.refineCx + d.x * ct - d.y * st + r.refineDx,
            r.refineCy + d.x * st + d.y * ct + r.refineDy
        )
    }

    /// toHome 的精确逆:家坐标(米)→ ARKit 世界系俯视点。AR 寻物指路用 ——
    /// 目标在户型里的位置,要画回相机所在的世界系
    static func fromHome(_ h: SIMD2<Double>, _ r: Registration) -> SIMD2<Double> {
        var v = h
        // 先撤精修
        if r.refineTheta != 0 || r.refineDx != 0 || r.refineDy != 0 {
            let d = SIMD2(v.x - r.refineDx - r.refineCx, v.y - r.refineDy - r.refineCy)
            let ct = cos(-r.refineTheta)
            let st = sin(-r.refineTheta)
            v = SIMD2(r.refineCx + d.x * ct - d.y * st, r.refineCy + d.x * st + d.y * ct)
        }
        // 撤平移与量化 yaw
        let q = rotate((360 - r.yawDeg) % 360, SIMD2(v.x - r.tx, v.y - r.ty))
        // 撤主方向拉平
        let rot = SIMD2(cos(-r.phi), sin(-r.phi))
        return SIMD2(q.x * rot.x - q.y * rot.y, q.x * rot.y + q.y * rot.x)
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
