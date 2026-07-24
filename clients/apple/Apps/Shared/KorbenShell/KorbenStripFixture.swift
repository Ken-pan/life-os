import Foundation

#if os(iOS)

/// Gate5D —— System Strip 的**测试夹具**。
///
/// 为什么需要它:Strip 的三态(Attention / Runtime / 多 Runtime)都依赖真实
/// 运行态 —— 得真的在训练、真的有待批准的 Agent。截图评审跑了好几轮,
/// Strip 一直是空的,`ACTIVE / TRAY / MULTI-RUNTIME` 因此**从未被证明过**,
/// 只能记成 NOT TESTED。夹具把这三态变成可复现的启动参数。
///
/// 安全边界与 `KenosDevMode` 同源:**生产构建永不激活**。夹具只影响 Strip
/// 的显示数据,不写任何库、不发任何请求、不改 approval 真值 —— 它是
/// 一块假布景,不是假数据源。
enum KorbenStripFixture {
    static let argumentPrefix = "-korbenStripFixture"

    enum Mode: String {
        /// 只有待确认(Attention 单元)
        case attention
        /// 只有一个 Runtime
        case runtime
        /// Attention + Runtime + 次要 Runtime(满 3 单元,验优先级与截断)
        case both
    }

    /// 冻结在启动那一刻(与 flag 同样的理由:中途变化会让证据不可复现)。
    static let current: Mode? = resolve(
        isDevelopmentBuild: KenosDevMode.isDevelopmentBuild,
        arguments: ProcessInfo.processInfo.arguments
    )

    /// 纯解析器 —— 可单测,不碰进程状态。
    /// 形式:`-korbenStripFixture both`(值作为下一个参数)。
    static func resolve(isDevelopmentBuild: Bool, arguments: [String]) -> Mode? {
        guard isDevelopmentBuild else { return nil }
        guard let i = arguments.firstIndex(of: argumentPrefix),
              arguments.indices.contains(i + 1)
        else { return nil }
        return Mode(rawValue: arguments[i + 1])
    }

    /// 夹具提供的 Strip 输入。返回 nil = 不干预,走真实状态。
    static func stripInputs(
        for mode: Mode
    ) -> (attentionCount: Int, primaryRuntimeTitle: String?, activeRuntimeCount: Int) {
        switch mode {
        case .attention:
            return (2, nil, 0)
        case .runtime:
            return (0, "训练 · 上肢", 1)
        case .both:
            // 规范优先级的关键验证点:Attention 必须排在 Runtime 前面。
            return (2, "训练 · 上肢", 3)
        }
    }
}

#endif
