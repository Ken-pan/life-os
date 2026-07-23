import Foundation

#if os(iOS)

/// P2 System Strip 的**内容优先级模型**(纯函数,可单测)。
///
/// 规范优先级(高→低):
/// ```
/// P0 需要立即确认的高影响事件
/// P1 等待用户输入的 Korben Agent
/// P2 当前主要 Runtime
/// P3 次要 Runtime 数量
/// P4 普通未读计数
/// ```
/// 关键语义:`Korben 等待确认 · 2 项` **优先于** `♪ Daily Mix · 1:42` ——
/// Attention 排在 Runtime 之前(此前实现把 runtime 排前面,与规范相反)。
/// Strip 最多 3 个单元;无任何单元时 Strip 整条隐藏。
enum KorbenStripModel {
    /// Strip 上的一个状态单元。
    enum Unit: Equatable {
        /// 待确认 / 待审批(P0–P1)
        case attention(count: Int)
        /// 当前主要 Runtime(P2)
        case runtime(title: String)
        /// 次要 Runtime 数量(P3)—— 主 runtime 之外还在跑的条数
        case secondaryRuntimes(count: Int)
    }

    static let maxUnits = 3

    /// 按优先级排产 Strip 单元。
    /// - Parameters:
    ///   - attentionCount: 待确认/待审批条数(0 = 无)
    ///   - primaryRuntimeTitle: 当前主要 Runtime 标题(nil = 无运行态)
    ///   - activeRuntimeCount: 同时在跑的 Runtime 总数(含主要那个)
    static func units(
        attentionCount: Int,
        primaryRuntimeTitle: String?,
        activeRuntimeCount: Int
    ) -> [Unit] {
        var out: [Unit] = []
        // P0/P1 —— Attention 先于 Runtime。
        if attentionCount > 0 { out.append(.attention(count: attentionCount)) }
        // P2 —— 当前主要 Runtime。
        if let title = primaryRuntimeTitle, !title.isEmpty {
            out.append(.runtime(title: title))
        }
        // P3 —— 次要 Runtime 数量(仅当确实多于一个在跑)。
        let secondary = max(0, activeRuntimeCount - 1)
        if secondary > 0, primaryRuntimeTitle != nil {
            out.append(.secondaryRuntimes(count: secondary))
        }
        return Array(out.prefix(maxUnits))
    }

    /// Strip 是否该渲染(无单元时整条隐藏,不占位)。
    static func hasContent(
        attentionCount: Int,
        primaryRuntimeTitle: String?,
        activeRuntimeCount: Int
    ) -> Bool {
        !units(
            attentionCount: attentionCount,
            primaryRuntimeTitle: primaryRuntimeTitle,
            activeRuntimeCount: activeRuntimeCount
        ).isEmpty
    }
}

#endif
