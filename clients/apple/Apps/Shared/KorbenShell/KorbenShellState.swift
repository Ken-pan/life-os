import SwiftUI
import KenosDesign

#if os(iOS)

/// Korben shell chrome insets — the contract the shell exposes to the Web
/// canvas so content never hides behind native chrome.
///
/// P1: static values wired through the existing `KenosWebChrome` CSS-pad
/// pipeline (`--kenos-dock-scroll-end-pad`). Later phases extend these for
/// System Strip / Quick Capture detents without touching the Web contract.
enum KorbenShellMetrics {
    /// Future System Strip slot — hard cap per spec (32–36 pt band).
    static let topChromeMaxHeight: CGFloat = 36
    /// Intent Dock pill height (54–58 pt band per spec).
    static let intentDockHeight: CGFloat = 56
    /// Orb visual diameter (52–56 pt band; hit target padded to ≥60).
    static let orbVisualSize: CGFloat = 54
    /// Minimum hit target for Orb / dock controls.
    static let minHitTarget: CGFloat = 60
    static let chromeHorizontalInset: CGFloat = 16
    static let orbDockGap: CGFloat = 8
    static let bottomSafeAreaGap: CGFloat = 12
    /// 最后一项与 chrome 顶边之间的视觉呼吸(Owner 验收要求 12–16pt)。
    static let contentBreathingRoom: CGFloat = 14
    /// 域子导航胶囊行实高(项 44 + 上下内边距 2×2)。
    static let domainCapsuleRowHeight: CGFloat = 48
    /// 两层 chrome 之间的间距(与 KorbenBottomChrome 的 VStack spacing 同源)。
    /// 收紧到 6 —— 胶囊与 Dock 同列时更紧凑,读作一个 chrome 栈。
    static let chromeRowGap: CGFloat = 6
    /// 供 KorbenBottomChrome 直接消费的同名别名(避免两处写死数字)。
    static var chromeStackGap: CGFloat { chromeRowGap }

    /// **底部 chrome 遮挡高度 —— shared derived metric(单一真源)**。
    /// Today(Kenos 态)与各 Domain 同源消费,禁止任何页面写死数字。
    ///
    /// 注意定性:这是**由同一批 token 推导**出的值,不是运行时从视图实测的
    /// live measurement。当前 Dock / Orb / 胶囊尺寸都由这些 token 驱动,故对本
    /// Gate 足够;若将来引入 Dynamic Type 驱动的可变高度,需升级为运行时测量
    /// (GeometryReader/PreferenceKey 上报真实 chrome 高度)。
    ///
    /// 组成 = Orb/Dock 行高(取二者较大的命中高:Orb 命中 60 > Dock 56)
    ///      + dock 距安全区间距 + 内容呼吸;域态再 += 胶囊行高 + 两层间距。
    /// 不含 home indicator —— CSS 侧已叠加 `env(safe-area-inset-bottom)`。
    static func bottomObstruction(hasDomainCapsule: Bool) -> CGFloat {
        let dockRow = max(intentDockHeight, minHitTarget)
        var total = dockRow + bottomSafeAreaGap + contentBreathingRoom
        if hasDomainCapsule { total += domainCapsuleRowHeight + chromeRowGap }
        return total
    }

    /// 传给 web 的**额外** scroll-end pad:`KenosWebChrome` 枚举已贡献
    /// `KenosGlass.dockScrollEndPadPx`(按旧 dock 几何算),这里只补差额,避免双计。
    static func webBottomExtraPadPx(hasDomainCapsule: Bool) -> Int {
        let needed = bottomObstruction(hasDomainCapsule: hasDomainCapsule)
        return max(0, Int(needed.rounded(.up)) - KenosGlass.dockScrollEndPadPx)
    }
}

/// Who owns the GLOBAL chrome (dock / shelf trigger / capture entry).
///
/// `.legacyOwned` — legacy behavior, Domain shell draws its own global dock +
/// shelf (Flag Off path; byte-for-byte unchanged).
/// `.externalKorbenShell` — Korben Shell V2 owns all global chrome; the Domain
/// shell renders content + domain-specific overlays only (router-back edge,
/// More sheet, leave-confirm). Single decision point — do NOT scatter feature
/// flag checks through Domain views.
enum KenosGlobalChromePolicy {
    case legacyOwned
    case externalKorbenShell
}

/// Shell-level presentation state owned by the Korben shell (NOT by Domains).
/// P1 is skeleton-only: a single placeholder presentation used to prove that
/// chrome/overlay state changes never remount the Web surfaces. The full
/// `ShellPresentation` state machine (peek/center/capture/assist/…) lands with
/// its overlays in later phases — one primary overlay at a time, coordinated
/// here, never presented by individual Domains.
@MainActor
final class KorbenShellState: ObservableObject {
    /// Immersive routes (Focus web surfaces etc.) suppress all Korben chrome.
    @Published var immersiveOverride = false
    /// Debug-only placeholder toggle — proves overlay flips don't reload web.
    @Published var showsTopChromePlaceholder = false
    /// P2 System Tray overlay(同一时间只此一个壳级 overlay)。
    @Published var showsSystemTray = false

    // ── P3 Orb 手势状态(Fan / Assist 预览由 ShellView overlay 渲染)──
    @Published var orbFanVisible = false
    @Published var orbFanTargets: [KorbenFanTarget] = []
    @Published var orbFanHighlight: Int?
    /// Orb 圆心(korben.shell 坐标系;chrome 布局时上报,Fan 绘制与命中共用)
    @Published var orbCenter: CGPoint = .zero
    /// Drag Right 进度(0=无,>=72 预览,>=132 提交)
    @Published var assistDragDistance: CGFloat = 0

    // ── P4A Intent Dock 三层 ──
    @Published var showsQuickCapture = false
    @Published var quickCaptureDetent: PresentationDetent = KorbenQuickCaptureSheet.captureDetent

    // ── P4B Receipt / Undo(10s 窗口)──
    @Published var undoReceipt: KorbenActionReceipt?

    // ── Gate5C-1 Space Peek(Orb Tap;与 Space Center 是两种意图,不是两种尺寸)──
    @Published var showsSpacePeek = false

    // ── P5 Korben Assist ──
    @Published var showsAssist = false
}

#endif
