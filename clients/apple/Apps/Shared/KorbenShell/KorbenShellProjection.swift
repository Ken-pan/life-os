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
}

#endif
