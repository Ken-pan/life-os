import Foundation

/// 上传前覆盖差报 —— 对照云端权威副本(CanonicalHomeStore 拉的优化副本),
/// 回答一句「这轮少了什么」:哪个分区整间没扫到、门窗是不是少了一截、
/// 哪间只留了一两张状态照。纯函数、无 ARKit,模拟器单测全覆盖。
///
/// 为什么要有它:真机实测一轮 650 sqft 扫完,洗衣区整间漏掉、门窗比档案
/// 少了三个、两间房一张状态照都没有 —— 而复核页零提示,用户满心以为扫全了。
/// 机位照片是每轮扫描的主要日常价值,漏了必须在**还能补扫的时候**说出来。
///
/// 产出的每一条都进 ReviewView 的「提醒」区,并追加进 meta.scanWarnings
/// 随 payload 上传(网页端原样展示)。权威副本不可用时调用方直接不调 ——
/// 差报是锦上添花,永远不挡上传。
enum CoverageDiff {
    /// 分区认领的最大中心距(canonical plan px)——
    /// 与网页端 scan-merge.js 的 CLAIM_MAX_DIST_PX 同源,改一处必须同步另一处
    static let claimMaxDistPx = 400.0
    /// 门窗数低于档案的这个比例(含压线)就报。真机案例 7/10 恰好压在 70%,
    /// 所以边界取「≤」:压线正是要抓的那种「差一间没扫全」
    static let openingRatioFloor = 0.7
    /// 每个已扫分区至少该有的状态照数
    static let minShotsPerZone = 2

    /// 差报入口。scan = 本轮转换结果(plan px),canonical = 权威副本。
    /// 房间更新(scanScope == "partial")时只查机位:整间没扫、门窗变少
    /// 都是用户**故意**的,报出来只会教人学会无视警告。
    ///
    /// `canonicalOpeningCount`:档案里的门窗总数(CanonicalHome.graphOpenings?.count,
    /// ReviewView 接线)。nil = 旧缓存还没这个字段,门窗这条静默跳过
    /// (与「权威副本不可用整个跳过」同一条哲学:差报不挡上传、不猜数)。
    static func warnings(
        scan: HomeOSProject,
        canonical: CanonicalHome,
        canonicalOpeningCount: Int? = nil
    ) -> [String] {
        var out: [String] = []
        let isFull = (scan.meta.scanScope ?? "full") == "full"
        if isFull {
            out += zoneWarnings(scan: scan, canonical: canonical)
            out += openingWarnings(
                scanCount: scan.graphOpenings.count,
                canonicalCount: canonicalOpeningCount
            )
        }
        out += viewpointWarnings(scan: scan)
        return out
    }

    // MARK: - 分区:扫描分区中心 → 就近认领权威分区

    /// 没被任何扫描分区认领的权威分区 = 整间没扫到。
    /// 两边坐标系可能差一个平移/缩放(RoomPlan 每轮世界系不同,margin 归一
    /// 也可能变),所以先按两边 wallGraph 包围盒把扫描点归一到权威坐标再比。
    static func zoneWarnings(scan: HomeOSProject, canonical: CanonicalHome) -> [String] {
        let canonZones = canonical.zones.filter { $0.polygon.count >= 3 }
        let scanZones = scan.zones.filter { $0.polygon.count >= 3 }
        // 本轮一个分区都没转出来 = 上游转换已经坏了,别再往上叠 5 条「没扫到」
        guard !canonZones.isEmpty, !scanZones.isEmpty,
              let toCanon = normalizer(
                  from: scan.wallGraph.vertices,
                  to: canonical.wallGraph.vertices
              )
        else { return [] }

        var claimed = Set<String>()
        for zone in scanZones {
            let c = toCanon(centroid(zone.polygon))
            var best: (id: String, d: Double)?
            for cz in canonZones {
                let cc = centroid(cz.polygon)
                let d = ((c.x - cc.x) * (c.x - cc.x) + (c.y - cc.y) * (c.y - cc.y)).squareRoot()
                if best == nil || d < best!.d { best = (cz.id, d) }
            }
            if let best, best.d <= claimMaxDistPx {
                claimed.insert(best.id)
            }
        }
        return canonZones
            .filter { !claimed.contains($0.id) }
            .map { "「\($0.nameZh)」这轮没扫到 —— 拉取时该区会保持档案里的原样;想更新它,回去补扫一间就行" }
    }

    // MARK: - 门窗:总数掉到档案七成(含压线)就报

    static func openingWarnings(scanCount: Int, canonicalCount: Int?) -> [String] {
        guard let canonCount = canonicalCount, canonCount > 0, scanCount < canonCount,
              Double(scanCount) <= Double(canonCount) * openingRatioFloor
        else { return [] }
        return ["门窗只扫到 \(scanCount) 个,比档案少 \(canonCount - scanCount) 个 —— 可能有房间没扫全,补扫时多在门洞和窗边停留几秒"]
    }

    // MARK: - 机位:已扫分区状态照太少就报

    /// 机位照片是每轮扫描的主要日常价值 —— 网页端 photos 模式全靠它。
    /// 每张机位按「落在哪个分区多边形里」归属;落在边界外(门洞里拍的)
    /// 归给中心最近的分区,别把一张好照片记成无主。
    static func viewpointWarnings(scan: HomeOSProject) -> [String] {
        let zones = scan.zones.filter { $0.polygon.count >= 3 }
        guard !zones.isEmpty else { return [] }

        var counts: [String: Int] = [:]
        for vp in scan.viewpoints {
            let p = HomeOSProject.Point(x: vp.x, y: vp.y)
            var owner = zones.first { contains(polygon: $0.polygon, point: p) }?.id
            if owner == nil {
                var bestD = Double.infinity
                for z in zones {
                    let c = centroid(z.polygon)
                    let d = ((p.x - c.x) * (p.x - c.x) + (p.y - c.y) * (p.y - c.y)).squareRoot()
                    if d < bestD { bestD = d; owner = z.id }
                }
            }
            if let owner { counts[owner, default: 0] += 1 }
        }
        return zones.compactMap { zone in
            let n = counts[zone.id] ?? 0
            guard n < minShotsPerZone else { return nil }
            return n == 0
                ? "「\(zone.nameZh)」没留下状态照 —— 网页端会看不到这间现在的样子;补扫时在里面多站两个角落"
                : "「\(zone.nameZh)」只有 \(n) 张状态照 —— 一个角度看不全一间房,补扫时换个角落多留一张"
        }
    }

    // MARK: - 几何小件(internal:单测直接打)

    /// 扫描坐标 → 权威坐标:两边 wallGraph 包围盒对齐(逐轴平移+缩放)。
    /// 任一边包围盒退化(顶点 <2 或边长近零)= 没法归一,nil = 整个分区差报跳过。
    static func normalizer(
        from src: [HomeOSProject.Vertex],
        to dst: [HomeOSProject.Vertex]
    ) -> ((HomeOSProject.Point) -> HomeOSProject.Point)? {
        guard let s = bounds(of: src), let d = bounds(of: dst),
              s.w > 1, s.h > 1
        else { return nil }
        let sx = d.w / s.w
        let sy = d.h / s.h
        return { p in
            HomeOSProject.Point(
                x: (p.x - s.minX) * sx + d.minX,
                y: (p.y - s.minY) * sy + d.minY
            )
        }
    }

    private static func bounds(
        of vertices: [HomeOSProject.Vertex]
    ) -> (minX: Double, minY: Double, w: Double, h: Double)? {
        guard vertices.count >= 2,
              let minX = vertices.map(\.x).min(), let maxX = vertices.map(\.x).max(),
              let minY = vertices.map(\.y).min(), let maxY = vertices.map(\.y).max()
        else { return nil }
        return (minX, minY, maxX - minX, maxY - minY)
    }

    /// 多边形面积加权质心(shoelace);面积退化(共线)退回顶点平均。
    /// L 形分区(真机的厨房就是)用顶点平均会被拐角一侧拽偏,认领会认错邻居。
    static func centroid(_ polygon: [HomeOSProject.Point]) -> HomeOSProject.Point {
        let n = polygon.count
        guard n >= 3 else {
            let sx = polygon.reduce(0) { $0 + $1.x }
            let sy = polygon.reduce(0) { $0 + $1.y }
            let c = Double(max(n, 1))
            return HomeOSProject.Point(x: sx / c, y: sy / c)
        }
        var area = 0.0, cx = 0.0, cy = 0.0
        for i in 0..<n {
            let p = polygon[i], q = polygon[(i + 1) % n]
            let cross = p.x * q.y - q.x * p.y
            area += cross
            cx += (p.x + q.x) * cross
            cy += (p.y + q.y) * cross
        }
        guard abs(area) > 1e-9 else {
            let sx = polygon.reduce(0) { $0 + $1.x }
            let sy = polygon.reduce(0) { $0 + $1.y }
            return HomeOSProject.Point(x: sx / Double(n), y: sy / Double(n))
        }
        area *= 0.5
        return HomeOSProject.Point(x: cx / (6 * area), y: cy / (6 * area))
    }

    /// 射线法点在多边形内(边上算在内外无所谓 —— 机位不会精确压线)
    static func contains(polygon: [HomeOSProject.Point], point p: HomeOSProject.Point) -> Bool {
        guard polygon.count >= 3 else { return false }
        var hit = false
        var j = polygon.count - 1
        for i in 0..<polygon.count {
            let a = polygon[i], b = polygon[j]
            if (a.y > p.y) != (b.y > p.y),
               p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x {
                hit.toggle()
            }
            j = i
        }
        return hit
    }
}
