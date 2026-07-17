import Foundation

/// 跨扫描物体身份(设备端)—— 「这次扫的柜子」是不是户型里那台「洗手台下柜」。
///
/// 与网页端 `apps/home/src/lib/spatial/scan-identity.js` **同源移植**
/// (常数、打分、贪心配对、歧义边距逐行对应,改动需两处同步)。
/// 单位:plan px(36px/ft)—— 调用方先把扫描件变换到户型坐标再来配。
enum ScanIdentity {
    struct Object {
        var id: String
        var kind: String
        var label: String
        var x: Double
        var y: Double
        var w: Double
        var h: Double
        var confidence: String?
        var colorHex: String?
        var styleZh: String?
        /// 底面离地高度(英寸,attrs.elevIn)。nil 视为 0(落地)—— 见 elev 项
        var elevIn: Double? = nil
        /// 权威侧 attrs.identityLocked(用户手工校对过的一等身份)。
        /// 只对 prev 有意义:锁定件跳过尺寸一票否决(见 matchScore)
        var identityLocked: Bool = false
        /// 用户纠正的一等数据 attrs.scanAliases:「扫描惯把这件误检成哪些 kind」。
        /// 只对 prev(权威件)有意义 —— next.kind ∈ prev.scanAliases 时视同同 kind,
        /// 不吃跨族否决、不吃 crossKindPenalty(用户纠正 > RoomPlan 惯性误检)。
        var scanAliases: [String] = []
        /// 最佳抓拍图的感知哈希 attrs.photoHash(dHash,16 位 hex)。外观特征:
        /// 尺寸抖动被拆成「消失+新增」的柜子,靠两次照片长得一样认回来(见 hashBonus)
        var photoHash: String? = nil
        /// 设备侧抓色置信度 attrs.colorConfidence 0..1。给 colorDist 的加分做权重:
        /// 罩布/反光把色搅花时(置信度低),别让不可靠的颜色抬高匹配分(见 colorTrust)
        var colorConfidence: Double? = nil
    }

    enum State {
        case unchanged, moved, possiblySame
    }

    struct Pair {
        var prevId: String
        var nextId: String
        var state: State
        var movedFt: Double
        var score: Double
    }

    struct Match {
        var pairs: [Pair]
        var added: [String]
        var removed: [String]
    }

    // 与 scan-identity.js 一一对应的常数
    static let sizeTolPx = 12.0
    static let sizeTolRatio = 0.15
    static let lowConfSizeFactor = 2.5
    static let distNormPx = 216.0
    static let unmovedPx = 30.0
    static let acceptScore = 0.5
    static let ambiguityMargin = 0.08
    /// 储物族(单一权威,三处引用:下面 kindFamily 的跨 kind 打分 /
    /// PlanProjector 设备端同位去重 / 网页端 scan-identity.js 同名常量)。
    /// RoomPlan 把吊柜/拉篮架/推车统统检成 cabinet 是常态(真扫实测:
    /// 「冰箱顶吊柜」「拉篮架 wire_rack」都被检成 cabinet,跨族一票否决
    /// 就认不回来了)。pet_crate 形似柜但不入族 —— 宠物笼不是储物家具。
    static let storageFamily = [
        "cabinet", "shelf", "wall_cabinet", "wire_rack",
        "cube_shelf", "utility_cart", "equipment_rack",
    ]
    static let kindFamily: [[String]] = [
        ["chair", "office_chair"],
        ["sofa", "armchair"],
        ["table", "coffee_table"],
        storageFamily,
    ]
    static let crossKindPenalty = 0.05
    /// elev 项(与 scan-identity.js 的 ELEV_SAME_MAX_IN / ELEV_SAME_BONUS /
    /// ELEV_DIFF_MIN_IN / ELEV_DIFF_PENALTY 一一对应)。两端约定:
    /// 加分 +0.1 仅当**双方都实测过**(两个 elevIn 都非 nil)且差 ≤6″;
    /// 罚分 -0.15 在差 >18″ 时,一方缺省视为 0(落地);双方都缺 → 0 ——
    /// 「都默认落地」不算证据,全场落地家具白涨 0.1 会顶翻既有打分边界。
    /// 落地柜与吊柜(差 5ft+)靠罚分分开;吊柜重扫抖 2-3″ 靠加分认回来。
    static let elevSameMaxIn = 6.0
    static let elevSameBonus = 0.1
    static let elevDiffMinIn = 18.0
    static let elevDiffPenalty = 0.15
    /// 外观项(照片 dHash,与网页 photo-hash.js 同源:HASH_SAME_MAX/HASH_DIFF_MIN)。
    /// 强像加大分、明显不像轻罚(拍摄方位/光照抬升汉明距离,不一票否决)。
    static let hashSameMax = 10
    static let hashDiffMin = 26
    static let hashSameBonus = 0.2
    static let hashDiffPenalty = 0.1

    private static func center(_ o: Object) -> (x: Double, y: Double) {
        (o.x + o.w / 2, o.y + o.h / 2)
    }

    /// 忽略 90° 朝向差异的尺寸差(同一件家具可能被转着扫)
    private static func sizeDiff(_ a: Object, _ b: Object) -> Double {
        let direct = max(abs(a.w - b.w), abs(a.h - b.h))
        let swapped = max(abs(a.w - b.h), abs(a.h - b.w))
        return min(direct, swapped)
    }

    private static func colorDist(_ a: Object, _ b: Object) -> Double? {
        guard let pa = a.colorHex, let pb = b.colorHex,
              pa.count == 7, pb.count == 7 else { return nil }
        func rgb(_ s: String) -> [Double]? {
            let hex = Array(s)
            var out: [Double] = []
            for i in [1, 3, 5] {
                guard let v = UInt8(String(hex[i...i + 1]), radix: 16) else { return nil }
                out.append(Double(v))
            }
            return out
        }
        guard let va = rgb(pa), let vb = rgb(pb) else { return nil }
        return ((va[0] - vb[0]) * (va[0] - vb[0])
            + (va[1] - vb[1]) * (va[1] - vb[1])
            + (va[2] - vb[2]) * (va[2] - vb[2])).squareRoot()
    }

    /// next.kind 落在 prev(权威件)的 scanAliases 里 —— 用户纠正的误检别名,视同同 kind。
    private static func aliasHit(_ prev: Object, _ next: Object) -> Bool {
        prev.scanAliases.contains(next.kind)
    }

    /// colorDist 加分的权重:两侧抓色置信度取小,任一低(罩布/反光)就少信颜色。
    /// 缺省视为 1(老扫描无 colorConfidence)—— 与改动前行为一致。
    private static func colorTrust(_ a: Object, _ b: Object) -> Double {
        min(a.colorConfidence ?? 1, b.colorConfidence ?? 1)
    }

    /// 两个 16 位 hex dHash 的汉明距离(与网页 photo-hash.js hammingHex 同源)。
    /// 任一缺失/格式不对返回 nil(中立,不参与打分)。
    static func hammingHex(_ a: String?, _ b: String?) -> Int? {
        guard let a, let b, a.count == 16, b.count == 16 else { return nil }
        let ca = Array(a), cb = Array(b)
        var dist = 0
        for i in 0..<16 {
            guard let xa = UInt8(String(ca[i]), radix: 16),
                  let xb = UInt8(String(cb[i]), radix: 16) else { return nil }
            dist += (xa ^ xb).nonzeroBitCount
        }
        return dist
    }

    /// 外观项:强像 +0.2、明显不像 -0.1、中间/缺失 0。见 hashSameMax/hashDiffMin。
    private static func hashBonus(_ a: Object, _ b: Object) -> Double {
        guard let d = hammingHex(a.photoHash, b.photoHash) else { return 0 }
        if d <= hashSameMax { return hashSameBonus }
        if d >= hashDiffMin { return -hashDiffPenalty }
        return 0
    }

    /// 0..1+bonuses;kind 不同但同族(样式精化翻转)可匹配,跨族一票否决
    static func matchScore(_ prev: Object, _ next: Object) -> Double {
        var penalty = 0.0
        // 用户纠正的别名命中 → 视同同 kind,不否决不罚分(用户纠正 > 惯性误检)
        if prev.kind != next.kind, !aliasHit(prev, next) {
            guard let fam = kindFamily.first(where: { $0.contains(prev.kind) }),
                  fam.contains(next.kind) else { return 0 }
            penalty = crossKindPenalty
        }
        let sd = sizeDiff(prev, next)
        let lowConf = prev.confidence == "low" || next.confidence == "low"
        let sizeLimit = max(sizeTolPx, sizeTolRatio * max(prev.w, prev.h))
            * (lowConf ? lowConfSizeFactor : 1)
        // 尺寸一票否决 —— 但权威侧 identityLocked(用户手工锁定的身份)豁免:
        // 折叠长桌展开态被 RoomPlan 扫出近两倍长,锁定件不许因此判 0;
        // sizeScore 仍按原公式算(此时通常已是 0,只剩位置分说话)
        if sd > sizeLimit * 2, !prev.identityLocked { return 0 }
        let sizeScore = max(0, 1 - sd / sizeLimit)
        let ca = center(prev)
        let cb = center(next)
        let d = ((ca.x - cb.x) * (ca.x - cb.x) + (ca.y - cb.y) * (ca.y - cb.y)).squareRoot()
        let posScore = max(0, 1 - d / distNormPx)
        var bonus = 0.0
        // 颜色加分按置信度打权:罩布/反光把色搅花时(置信度低)少信颜色
        if let cd = colorDist(prev, next), cd <= 60 { bonus += 0.15 * colorTrust(prev, next) }
        if let s = prev.styleZh, s == next.styleZh { bonus += 0.1 }
        // 外观项(dHash):尺寸抖动被拆成消失+新增的柜子,靠照片认回来
        bonus += hashBonus(prev, next)
        // elev 项:加分只认双方实测;罚分把缺省当 0(落地);都缺 → 0(常数见上)
        if let pe = prev.elevIn, let ne = next.elevIn, abs(pe - ne) <= elevSameMaxIn {
            bonus += elevSameBonus
        } else if abs((prev.elevIn ?? 0) - (next.elevIn ?? 0)) > elevDiffMinIn {
            bonus -= elevDiffPenalty
        }
        return 0.45 * sizeScore + 0.45 * posScore + bonus - penalty
    }

    /// 贪心最优配对(件数个位数到几十,不需要匈牙利)
    static func match(prev prevList: [Object], next nextList: [Object]) -> Match {
        struct Cand {
            var score: Double
            var pi: Int
            var ni: Int
        }
        var cands: [Cand] = []
        for (pi, p) in prevList.enumerated() {
            for (ni, n) in nextList.enumerated() {
                let score = matchScore(p, n)
                if score >= acceptScore { cands.append(Cand(score: score, pi: pi, ni: ni)) }
            }
        }
        cands.sort { $0.score > $1.score }

        var usedP = Set<Int>()
        var usedN = Set<Int>()
        var pairs: [Pair] = []
        for (idx, c) in cands.enumerated() {
            if usedP.contains(c.pi) || usedN.contains(c.ni) { continue }
            // 歧义检查:同一个新件的第二候选分数太接近 → 不敢认,保守当新件
            let rival = cands.enumerated().contains { j, o in
                j != idx && o.ni == c.ni && !usedP.contains(o.pi) && c.score - o.score < ambiguityMargin
            }
            usedP.insert(c.pi)
            usedN.insert(c.ni)
            let ca = center(prevList[c.pi])
            let cb = center(nextList[c.ni])
            let d = ((ca.x - cb.x) * (ca.x - cb.x) + (ca.y - cb.y) * (ca.y - cb.y)).squareRoot()
            pairs.append(Pair(
                prevId: prevList[c.pi].id,
                nextId: nextList[c.ni].id,
                state: rival ? .possiblySame : (d <= unmovedPx ? .unchanged : .moved),
                movedFt: (d / 36 * 10).rounded() / 10,
                score: (c.score * 100).rounded() / 100
            ))
        }
        return Match(
            pairs: pairs,
            added: nextList.enumerated().filter { !usedN.contains($0.offset) }.map(\.element.id),
            removed: prevList.enumerated().filter { !usedP.contains($0.offset) }.map(\.element.id)
        )
    }
}
