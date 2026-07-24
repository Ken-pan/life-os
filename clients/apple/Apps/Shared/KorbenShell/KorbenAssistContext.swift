import Foundation

#if os(iOS)

/// Gate5C-2 —— Assist 面板的**事实层**。
///
/// 此前 Assist 只知道「你在哪个 Space」,面板内容因此在任何页面上都长一样
/// (真机 review P1-2:「内容仍通用」)。这里把壳**已经掌握、但没用起来**的
/// 信息接进来:当前路由落在这个域的哪个区、是不是已经在该区首页、有没有
/// runtime、有多少待确认。
///
/// 纪律不变:这些都是**确定性投影**,不是 AI 判断。面板不许出现
/// 「我看了你的计划」这类话术 —— 那只允许真 agent(web Ask 面)说。
/// 做成纯结构体 + 纯函数,是为了它能被单测锁住,而不是只能靠截图证明。
struct KorbenAssistContext: Equatable {
    /// 当前 Space 展示名(域外为 Today)。
    let spaceLabel: String
    /// 当前路由落在该域的哪个区(匹配不上时为 nil —— 宁可不说,也不猜)。
    let sectionLabel: String?
    /// 同域内可跳的其它区(≤2,按 dock 顺序,排除当前区)。
    let siblingSections: [Section]
    let runtimeTitle: String?
    let pendingApprovals: Int

    struct Section: Equatable {
        let index: Int
        let title: String
    }

    /// 路由 → 区的匹配。规则:取 path 前缀最长且匹配的那一项。
    ///
    /// 为什么是最长前缀而不是相等:域内二级页(`/home/accounts/detail`)必须
    /// 仍归属它所在的区(`/home`),否则一进详情页 Assist 就"失忆"。
    /// 根路径 `/` 只在没有更长匹配时兜底,否则它会吃掉所有路由。
    static func matchSection(path: String, items: [(title: String, path: String)]) -> Int? {
        var best: (index: Int, length: Int)?
        for (i, item) in items.enumerated() {
            let p = item.path
            let matches = p == "/" ? path == "/" || path.isEmpty : path == p || path.hasPrefix(p + "/")
            guard matches else { continue }
            if p.count > (best?.length ?? -1) { best = (i, p.count) }
        }
        if best == nil, let rootIndex = items.firstIndex(where: { $0.path == "/" }) {
            return rootIndex
        }
        return best?.index
    }

    static func make(
        spaceLabel: String,
        path: String,
        items: [(title: String, path: String)],
        runtimeTitle: String?,
        pendingApprovals: Int
    ) -> KorbenAssistContext {
        let current = matchSection(path: path, items: items)
        let siblings = items.enumerated()
            .filter { $0.offset != current }
            .prefix(2)
            .map { Section(index: $0.offset, title: $0.element.title) }
        return KorbenAssistContext(
            spaceLabel: spaceLabel,
            sectionLabel: current.map { items[$0].title },
            siblingSections: Array(siblings),
            runtimeTitle: runtimeTitle,
            pendingApprovals: pendingApprovals
        )
    }

    /// 上下文首行 —— 「Space · 区」而不是光秃秃一个 Space 名。
    func locationLine(chinese: Bool) -> String {
        guard let section = sectionLabel else {
            return chinese ? "当前空间:\(spaceLabel)" : "Space: \(spaceLabel)"
        }
        return chinese
            ? "当前:\(spaceLabel) · \(section)"
            : "In \(spaceLabel) · \(section)"
    }
}

#endif
