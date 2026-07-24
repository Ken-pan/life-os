import Foundation

#if os(iOS)

/// **Per-Space Surface Continuity — LRU 域 WebView 池(纯模型)。**
///
/// 背景(ARCH-OPEN PER_SPACE_SURFACE_CONTINUITY):Korben 壳此前域这层只有
/// 一个 `KenosDomainModeShell`,其 WKWebView 绑定全局 `continuityURL`。Space↔Space
/// 切换改 `continuityURL` → 同一 WebView hardLoad 到新 URL → **滚动位置/表单/
/// 未提交编辑全丢**,且反复 hardLoad 触发 WebContent 进程 churn(真机实测 EXC_GUARD 噪音)。
///
/// 池化后:每个最近用过的 Space 保留**自己**那个还活着的 WKWebView(≤capacity 个),
/// 切回时直接显示、不重载 → 状态原样保留。这个 enum 只管**哪些 Space 该常驻、
/// 谁被淘汰**;真正的 WebView 托管/显隐由 `KorbenDomainSurfacePoolView` 承担。
///
/// 纯函数 + 无副作用 → 可 XCTest 锁契约(参照 KorbenOrbGestureResolver / KorbenStripModel)。
enum KorbenDomainSurfacePool {
    /// 常驻上限。≤3 是 P0 审计的推荐值:每个域 WebView 带独立 WebContent 进程,
    /// 内存约 ×capacity;内存告警时收缩到 1(见 shrinkToActive)。
    static let defaultCapacity = 3

    /// 一个常驻 Space。`spaceId` 是稳定身份(切回不重载的关键);`url` 只是**首次
    /// 创建**该 Space WebView 时的入口 URL —— 切回一个已常驻的 Space **绝不**用它
    /// 重设 URL(否则又变成 hardLoad),WebView 停在用户离开时的状态。
    struct Resident: Equatable, Identifiable {
        let spaceId: String
        let url: URL
        var id: String { spaceId }
    }

    /// 进入某 Space:置于最近端(index 0)、按 spaceId 去重、超容量淘汰最久未用(末端)。
    ///
    /// - 若 `spaceId` 已常驻:移到最近端,**保留原有 `url`**(维持"切回不重载"语义);
    ///   仅当它此前不在池中才用传入 `url` 建新条目。
    /// - 返回淘汰掉的 spaceId 列表(调用方据此让对应 WebView 下线释放)。
    static func touch(
        _ residents: [Resident],
        spaceId: String,
        url: URL,
        capacity: Int = defaultCapacity
    ) -> (residents: [Resident], evicted: [String]) {
        let cap = max(1, capacity)
        // 已存在则复用其原 url(不重载);否则用传入 url 建新。
        let existing = residents.first { $0.spaceId == spaceId }
        let head = Resident(spaceId: spaceId, url: existing?.url ?? url)
        var next = residents.filter { $0.spaceId != spaceId }
        next.insert(head, at: 0)
        var evicted: [String] = []
        while next.count > cap {
            evicted.append(next.removeLast().spaceId)
        }
        return (next, evicted)
    }

    /// 内存告警 / 后台:收缩到只留当前活跃 Space,其余全淘汰释放。
    /// 返回被淘汰的 spaceId(调用方下线其 WebView)。
    static func shrinkToActive(
        _ residents: [Resident],
        activeSpaceId: String?
    ) -> (residents: [Resident], evicted: [String]) {
        guard let active = activeSpaceId,
              let kept = residents.first(where: { $0.spaceId == active })
        else {
            // 没有活跃项(理论上不该发生):全清。
            return ([], residents.map(\.spaceId))
        }
        let evicted = residents.filter { $0.spaceId != active }.map(\.spaceId)
        return ([kept], evicted)
    }

    /// 显式移除某 Space(如用户在切换器长按关闭)。
    static func remove(
        _ residents: [Resident],
        spaceId: String
    ) -> [Resident] {
        residents.filter { $0.spaceId != spaceId }
    }

    /// 某 Space 是否已常驻(= 切回时可零重载显示)。
    static func contains(_ residents: [Resident], spaceId: String) -> Bool {
        residents.contains { $0.spaceId == spaceId }
    }
}

#endif
