#if canImport(ActivityKit)
import ActivityKit
import Foundation

/// Shared ActivityAttributes for Training / Deep Work / Home Organize Live Activities.
/// Compiled into KenosIOS + KenosWidget (must stay identical in both targets).
public struct KenosDomainActivityAttributes: ActivityAttributes {
    public enum Kind: String, Codable, Hashable, Sendable, CaseIterable {
        case training
        case focus
        case tidy
    }

    public struct ContentState: Codable, Hashable, Sendable {
        public var title: String
        public var subtitle: String
        public var progress: Double?
        public var endsAt: Date?
        /// 本次会话的**具体**深链(如 `kenos://training?path=/day/abs/focus`)。
        /// 随每次 upsert 更新 —— 灵动岛显示的是当前会话,点它就该进当前会话。
        /// 早于本字段的活动解码为 nil,回退到 attributes 的静态 kind 深链。
        public var deepLink: String?

        public init(
            title: String,
            subtitle: String,
            progress: Double? = nil,
            endsAt: Date? = nil,
            deepLink: String? = nil
        ) {
            self.title = title
            self.subtitle = subtitle
            self.progress = progress.map { min(1, max(0, $0)) }
            self.endsAt = endsAt
            self.deepLink = deepLink
        }

        /// 点击目标:优先用本次会话的具体深链,回退到静态 kind 深链。
        public func tapURL(fallback: URL) -> URL {
            if let deepLink, let url = URL(string: deepLink) { return url }
            return fallback
        }
    }

    /// Static kind — one Live Activity instance per kind.
    public var kind: String

    public init(kind: String) {
        self.kind = kind
    }

    public init(kind: Kind) {
        self.kind = kind.rawValue
    }

    public var resolvedKind: Kind? {
        Kind(rawValue: kind)
    }

    /// 静态**回退**落地页(当 ContentState 未带具体会话深链时用)。
    ///
    /// 关键:回退目标必须是**确定性落地页**,不能是会经域内 resume 猜测「上一个
    /// 挂起会话」的路径 —— 否则缺 deepLink 的旧活动一点就可能落到错误实例
    /// (training 曾用 `kenos://training/session`,正是这个 resume 陷阱)。
    /// training 回退到 `/program`(选练日的确定性入口),不是进行中的某个 session。
    public var deepLinkURL: URL {
        switch resolvedKind {
        case .training:
            return URL(string: "kenos://training?path=/program")!
        case .focus:
            return URL(string: "kenos://work")!
        case .tidy:
            return URL(string: "kenos://domain/home?path=/tidy/go")!
        case .none:
            return URL(string: "kenos://today")!
        }
    }

    /// 该 kind 是否**实例作用域**(代表某个具体会话/实体,存在"落到错误实例"风险)。
    /// 这类活动 upsert 时应带具体 `deepLink`;缺失会被 DEBUG 守卫记一笔。
    public var isInstanceScoped: Bool {
        resolvedKind == .training
    }

    public var systemImageName: String {
        switch resolvedKind {
        case .training: return "figure.strengthtraining.traditional"
        case .focus: return "brain.head.profile"
        case .tidy: return "house"
        case .none: return "circle.grid.2x2"
        }
    }

    public var accentRGB: UInt32 {
        switch resolvedKind {
        case .training: return 0xC45C4A
        case .focus: return 0x6A9BE0
        case .tidy: return 0x7AA0C8
        case .none: return 0x5B8CFF
        }
    }
}
#endif
