import Foundation

#if os(iOS)

/// Read-only projection of the legacy `KenosAppModel` state that the Korben
/// shell chrome actually needs — a thin seam so Korben views never grow direct
/// dependencies on the 3000-line super-model beyond this file.
///
/// P1 scope only. Do NOT add mutation here; actions keep routing through the
/// existing model APIs (`openSpaceSwitcher`, `openCapture`, `enterDomainMode`)
/// so there is exactly one owner of shell state.
@MainActor
struct KorbenShellProjection {
    /// `kenos` while in shell mode; the Domain space id in domain mode.
    let currentSpaceId: String
    let shellMode: KenosAppModel.ShellMode
    let selectedTab: KenosAppModel.Tab
    /// Domain Continuity surface exists (keep-alive layer mounted).
    let hasDomainSurface: Bool
    /// Ask conversation active — bottom chrome must hide (web owns composer).
    let hidesBottomChromeForConversation: Bool
    /// Settings modal is up — Done is the only exit; hide dock underneath.
    let hidesBottomChromeForSettings: Bool
    let hasLiveAccessory: Bool
    let liveAccessoryMinimized: Bool
    /// Domain web route is immersive (Focus / Summary / organize-go) — all
    /// external chrome hides, mirroring the legacy Domain dock rules.
    let isDomainImmersive: Bool
    /// Domain web overlay is up (editor / drawer / sheet / capture / compose) —
    /// floating chrome must not cover it.
    let isDomainOverlayActive: Bool

    static func make(from model: KenosAppModel) -> KorbenShellProjection {
        let inDomain = model.shellMode == .domain
        let immersive = inDomain
            && KenosDomainModeShell.isImmersiveWebPath(model.continuityURL?.path ?? "")
        let overlay: Bool = inDomain && {
            switch model.domainWebLiveState.lowercased() {
            case "editing", "drawer", "sheet", "capturing", "scanning", "immersive", "compose":
                return true
            default:
                return false
            }
        }()
        return KorbenShellProjection(
            currentSpaceId: inDomain ? model.domainSpaceId : "kenos",
            shellMode: model.shellMode,
            selectedTab: model.selectedTab,
            hasDomainSurface: model.continuityURL != nil,
            hidesBottomChromeForConversation: model.hideGlobalDockForAssistantConversation,
            hidesBottomChromeForSettings: model.showSettingsSheet,
            hasLiveAccessory: model.liveAccessory != nil,
            liveAccessoryMinimized: model.liveAccessoryMinimized,
            isDomainImmersive: immersive,
            isDomainOverlayActive: overlay
        )
    }

    /// P1B: Korben chrome is global — Kenos Mode AND every Domain. It yields
    /// only to conversation composer, Settings modal, and Domain immersive /
    /// overlay surfaces (same rules the legacy Domain dock followed).
    var showsKorbenChrome: Bool {
        !hidesBottomChromeForConversation
            && !hidesBottomChromeForSettings
            && !isDomainImmersive
            && !isDomainOverlayActive
    }

    /// **当前 web 面自带主输入条** —— Ask(问答)页底部常驻自己的 composer
    /// (Scope chip + 输入 + 发送)。此时再叠 Korben Intent Dock 会出现
    /// 「同屏两个输入口、两个发送键」(真机 review P0-2 实拍)。
    ///
    /// 与 `hidesBottomChromeForConversation` 的区别:后者依赖 web 上报
    /// `liveState=conversation`,只在**已开始对话**后为真;Ask **落地页**不上报,
    /// 双输入条照常出现。这里按「路由即事实」判定,不依赖 web 上报。
    var surfaceOwnsComposer: Bool {
        shellMode != .domain && selectedTab == .assistant
    }

    /// Intent Dock 是否显示。Orb 不受影响 —— 它是全局导航,不是输入口。
    var showsIntentDock: Bool {
        showsKorbenChrome && !surfaceOwnsComposer
    }
}

#endif
