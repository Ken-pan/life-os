import SwiftUI

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
    /// Extra web scroll-end pad (CSS px) in Domain Mode under Korben chrome —
    /// the domain destination capsule adds a second chrome row above the dock,
    /// so the legacy single-row `.domainDock` pad is not enough clearance.
    /// 需覆盖 dock(~56)+ 胶囊行(~50)+ 间距,否则最后一项滚不到 chrome 上方
    /// (截图 12/13/15 被遮)。滚动收敛后到底时胶囊已隐,此值保静止态短页也不压。
    static let domainCapsuleWebExtraPadPx = 96
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

    // ── P5 Korben Assist ──
    @Published var showsAssist = false
}

#endif
