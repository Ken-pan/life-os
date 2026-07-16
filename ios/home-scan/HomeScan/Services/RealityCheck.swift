import Foundation
import simd

/// 扫完的「现实核对」—— 一分钟确认的地基:把这次扫描的家具变换进永久户型
/// 坐标,与户型家具做身份匹配,分类成 认出原位 / 挪过 / 新发现 / 没扫到。
/// 认出的直接换上户型里的真名(「洗手台下柜」),预览页不再是一排「柜」。
///
/// 纯函数:扫描 project(自己的 plan px 帧)+ 户型副本 → 结果;
/// 配准/身份都是已移植的同源算法(HomeFrame / ScanIdentity)。
enum RealityCheck {
    struct Recognized {
        var scanPlacementId: String
        var label: String
        var movedFt: Double
        var moved: Bool
    }

    struct Result {
        /// 配准残差(cm);nil = 配准没过门,只报数不敢分类
        var registeredCm: Double?
        var recognized: [Recognized]
        /// 新发现(户型里没有的):扫描件 id + 标签
        var added: [(id: String, label: String)]
        /// 户型里有、这次没扫到的(钉死件与手录件已剔除)
        var missing: [String]
        /// 证据不足不敢认的(保守当新件,但点出来)
        var possiblySame: Int
    }

    static func run(scan project: HomeOSProject, home: CanonicalHome) -> Result? {
        guard !home.placements.isEmpty else { return nil }

        // 1) 扫描 px 帧 → 户型 px 帧:双方墙段都转米,量化刚性配准
        let scanSegs = HomeFrame.segments(fromWallGraph: project.wallGraph)
        let homeSegs = HomeFrame.segments(fromWallGraph: home.wallGraph)
        let reg = HomeFrame.register(scan: scanSegs, home: homeSegs)
        guard reg.ok else { return nil }

        let scanMPerPx = 0.3048 / project.wallGraph.pxPerFt
        let homePxPerM = home.wallGraph.pxPerFt / 0.3048
        func toHomePx(_ p: SIMD2<Double>) -> SIMD2<Double> {
            HomeFrame.toHome(p * scanMPerPx, reg) * homePxPerM
        }

        // 2) 扫描件 → 户型坐标(yaw 90/270 时宽高互换 —— 变换两角取包围盒)
        let next = project.placements.map { pl -> ScanIdentity.Object in
            let a = toHomePx(SIMD2(pl.x, pl.y))
            let b = toHomePx(SIMD2(pl.x + pl.w, pl.y + pl.h))
            return ScanIdentity.Object(
                id: pl.id,
                kind: pl.kind,
                label: pl.label,
                x: min(a.x, b.x),
                y: min(a.y, b.y),
                w: abs(b.x - a.x),
                h: abs(b.y - a.y),
                confidence: pl.attrs?.confidence,
                colorHex: pl.attrs?.colorHex,
                styleZh: pl.attrs?.styleZh,
                elevIn: pl.attrs?.elevIn
            )
        }
        let prev = home.placements.map { pl in
            ScanIdentity.Object(
                id: pl.id,
                kind: pl.kind,
                label: pl.label,
                x: pl.x, y: pl.y, w: pl.w, h: pl.h,
                confidence: pl.attrs?.confidence,
                colorHex: pl.attrs?.colorHex,
                styleZh: pl.attrs?.styleZh,
                elevIn: pl.attrs?.elevIn,
                // 锁定件跳过尺寸一票否决(折叠桌展开态也要认得回来)
                identityLocked: home.identityHints?[pl.id]?.identityLocked ?? false
            )
        }

        // 3) 身份匹配 → 分类
        let m = ScanIdentity.match(prev: prev, next: next)
        let prevById = Dictionary(uniqueKeysWithValues: home.placements.map { ($0.id, $0) })
        var recognized: [Recognized] = []
        var possiblySame = 0
        var matchedNextIds = Set<String>()
        for pair in m.pairs {
            if pair.state == .possiblySame {
                possiblySame += 1
                continue
            }
            matchedNextIds.insert(pair.nextId)
            recognized.append(Recognized(
                scanPlacementId: pair.nextId,
                label: prevById[pair.prevId]?.label ?? pair.prevId,
                movedFt: pair.movedFt,
                moved: pair.state == .moved
            ))
        }
        let nextById = Dictionary(uniqueKeysWithValues: project.placements.map { ($0.id, $0) })
        let added = m.added.compactMap { id -> (id: String, label: String)? in
            guard let pl = nextById[id] else { return nil }
            return (id, pl.label)
        } + m.pairs.filter { $0.state == .possiblySame }.compactMap { pair in
            guard let pl = nextById[pair.nextId] else { return nil }
            return (pair.nextId, pl.label)
        }
        // 没扫到:只点名「扫描出身且没钉死」的 —— 钉死件(马桶/内嵌柜)扫不到
        // 是常态,手录件(围挡/地毯)RoomPlan 本来就认不出,点名只会狼来了。
        // 房间更新(partial)再多一道:只看这次扫描 coverage 里的 —— 扫一间
        // 卫生间,不该把全屋家具都喊「没扫到」
        let partial = project.meta.scanScope == "partial"
        let coverage: [[SIMD2<Double>]] = partial
            ? project.zones.map { z in z.polygon.map { toHomePx(SIMD2($0.x, $0.y)) } }
            : []
        func inCoverage(_ pl: HomeOSProject.Placement) -> Bool {
            guard partial else { return true }
            let c = SIMD2(pl.x + pl.w / 2, pl.y + pl.h / 2)
            return coverage.contains { HomeFrame.contains($0, c) }
        }
        let missing = m.removed.compactMap { id -> String? in
            guard let pl = prevById[id],
                  pl.fixed != true,
                  pl.attrs?.measuredWIn != nil,
                  inCoverage(pl) else { return nil }
            return pl.label
        }

        return Result(
            registeredCm: reg.medianCm,
            recognized: recognized,
            added: added,
            missing: missing,
            possiblySame: possiblySame
        )
    }

    /// 认出的换真名:扫描件的「柜」变成户型里的「洗手台下柜」。
    /// 与网页端 merge 的「名字跟着身份走」同一语义,只是提前到了设备端。
    static func adoptLabels(into project: inout HomeOSProject, result: Result) {
        let byScanId = Dictionary(uniqueKeysWithValues: result.recognized.map { ($0.scanPlacementId, $0.label) })
        for i in project.placements.indices {
            if let label = byScanId[project.placements[i].id] {
                project.placements[i].label = label
            }
        }
    }
}
