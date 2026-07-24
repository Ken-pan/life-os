import Foundation

#if os(iOS)

/// Korben 的助手**人设**。默认 Korben(管家);Leo 模式把助手换成陪伴向角色 Leo。
///
/// 真源边界:实际驱动 LLM 的人设卡在 web(`leoPersona.core.js` / `S.settings
/// .assistantPersona`)。原生这层只负责**在场感与切换意图** —— 存偏好、下发给
/// web(镜像主题/语言的广播链路)、并原生渲染 Leo 的头像与表情。原生不复制
/// web 那套按对话文本推断表情的启发式(那含亲密/尺度向的正则,该留在 LLM 文本
/// 所在的 web 层);原生的表情由**壳状态**驱动(空闲 / 有 agent 在跑 / 温柔在场)。
enum KorbenAssistantPersona: String, CaseIterable, Equatable {
    case korben
    case leo

    static let storageDefault: KorbenAssistantPersona = .korben

    static func normalize(_ raw: String?) -> KorbenAssistantPersona {
        switch (raw ?? "").lowercased() {
        case "leo": return .leo
        default: return .korben
        }
    }

    var isLeo: Bool { self == .leo }

    /// 展示名(用户面)。Korben 是管家本名;Leo 是角色本名,两者都直接用。
    var displayName: String {
        switch self {
        case .korben: return "Korben"
        case .leo: return "Leo"
        }
    }
}

/// Leo 的 5 种表情静帧(与 web `leoAvatar.core.js` 的 SSOT 同名同集)。
/// 原生资源名对齐 Assets.xcassets/Leo/leo_<expression>。
enum KorbenLeoExpression: String, CaseIterable, Equatable {
    case neutral
    case smile
    case serious
    case soft
    case thinking

    var assetName: String { "leo_\(rawValue)" }

    /// 升级优先级(用于流式/连续状态下防抖:只升不降回 neutral,对齐 web
    /// stabilizeLeoExpression 的意图)。soft 最高(温柔在场压过其它)。
    var rank: Int {
        switch self {
        case .soft: return 4
        case .serious: return 3
        case .smile: return 2
        case .thinking: return 1
        case .neutral: return 0
        }
    }
}

/// **原生表情驱动 —— 由壳状态而非对话文本推断**(理由见 KorbenAssistantPersona)。
///
/// 输入是壳早已掌握的信号:有没有 agent/runtime 在跑、有没有待确认、是不是刚
/// 记了一条。输出一个"在场"表情。纯函数,可单测,不碰任何 LLM 文本。
enum KorbenLeoPresence {
    struct Signals: Equatable {
        /// 有正在进行的 runtime(训练/播放/续播…)——像"在忙但在陪你"。
        var hasActiveRuntime: Bool = false
        /// 有待确认事项 —— 认真、在意。
        var hasPendingAttention: Bool = false
        /// 刚发生一次正向动作(如创建草稿)——短暂微笑。
        var justActedPositively: Bool = false
    }

    /// 默认在场表情:Leo 模式下用 soft(温柔在场)而非冷淡的 neutral。
    static let restingExpression: KorbenLeoExpression = .soft

    /// 由信号选表情。优先级:正向瞬间 > 待确认(认真) > 运行中(在想) > 温柔在场。
    static func expression(for signals: Signals) -> KorbenLeoExpression {
        if signals.justActedPositively { return .smile }
        if signals.hasPendingAttention { return .serious }
        if signals.hasActiveRuntime { return .thinking }
        return restingExpression
    }

    /// 流式/连续切换防抖:同一段"在场"里表情只升不降(避免 neutral↔soft 抖动)。
    /// 对齐 web `stabilizeLeoExpression` 的"情绪一旦确立就稳住"。
    static func stabilize(
        previous: KorbenLeoExpression?,
        next: KorbenLeoExpression,
        streaming: Bool
    ) -> KorbenLeoExpression {
        guard streaming, let previous else { return next }
        return next.rank >= previous.rank ? next : previous
    }
}

#endif
