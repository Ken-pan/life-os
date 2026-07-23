import SwiftUI
import KenosDesign

#if os(iOS)

/// Hosts the **persistent Web Space surfaces** inside the Korben shell.
///
/// Ownership contract (P1 hard constraint — see docs/mobile/KORBEN_SHELL_V2_P0_AUDIT.md):
///
///     Persistent Web Surface Owner (unchanged)
///       KenosWebSurfaceView (makeUIView creates the WKWebView)
///       ├─ shell surface:  KenosDailyBetaSurface — ONE instance, path swaps per tab
///       ├─ domain surface: KenosDomainModeShell (stayInApp Continuity)
///       └─ KenosActiveWebRegistry (weak registry — bridge/bug-report consumers)
///             ▲ mounts (flag OFF)          ▲ mounts (flag ON)
///       Legacy Shell Host             Korben Shell Host (this file)
///
/// `KorbenShellV2Feature.isEnabled` is frozen at launch, so exactly one host
/// tree exists per process — Korben re-hosts the SAME surface components in the
/// same keep-alive pattern (opacity/scale + `isActive`, never remount), it does
/// NOT create a second set of WKWebViews. Korben chrome layers around this host
/// in `KorbenShellView`; chrome/overlay state changes must never alter the
/// structural identity of anything in this ZStack.
struct KorbenSpaceSurfaceHost: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// P2 System Strip 可见时,web 顶部加余隙(34pt 条 + 10px 缓冲)。
    private var stripTopPadPx: Int {
        KorbenSystemStrip.hasUnits(model: model) ? 44 : 0
    }

    var body: some View {
        ZStack {
            KenosChromeAppearance.dark.canvasColor.ignoresSafeArea()

            // ── Kenos shell surface (Today / Ask / Spaces / Inbox web routes) ──
            // Same single-instance pattern as legacy iPhoneTabs: path updates
            // reuse one WKWebView; no `.id(tab)` (remount = white flash).
            Group {
                if KenosDailyBetaConfig.isEnabled {
                    KenosDailyBetaSurface(
                        path: model.dailyBetaPath(
                            for: model.selectedTab == .settings ? .today : model.selectedTab
                        ),
                        isActive: model.shellMode != .domain,
                        // P2: 顶部 System Strip 取代底部 LiveAccessory —— 底部
                        // accessory pad 归零,顶部按 strip 可见加余隙。
                        accessoryBottomPadPx: 0,
                        chrome: model.hideGlobalDockForAssistantConversation
                            ? .kenosConversation
                            : .kenosTabs,
                        topExtraPadPx: stripTopPadPx
                    )
                } else {
                    // Rare non-beta fallback — native views, no web surface.
                    NavigationStack { korbenNativeFallback }
                }
            }
            .scaleEffect(
                KenosMotion.shellSurfaceScale(
                    reduceMotion: reduceMotion,
                    isForeground: model.shellMode != .domain
                )
            )
            .opacity(model.shellMode == .domain ? 0 : 1)
            .allowsHitTesting(model.shellMode != .domain)
            .accessibilityHidden(model.shellMode == .domain)

            // ── Domain Continuity surface (keep-alive dual layer) ──
            // P1: Domain Mode keeps its full legacy in-shell chrome (dock +
            // shelf morph live inside KenosDomainModeShell) — unified Korben
            // chrome over Domains lands in later phases.
            if model.continuityURL != nil {
                KenosDomainModeShell(
                    model: model,
                    isActive: model.shellMode == .domain,
                    // Korben shell owns ALL global chrome — Domain shell renders
                    // content + domain-specific overlays only (P1B).
                    globalChromePolicy: .externalKorbenShell,
                    topExtraPadPx: stripTopPadPx
                )
                .scaleEffect(
                    KenosMotion.shellSurfaceScale(
                        reduceMotion: reduceMotion,
                        isForeground: model.shellMode == .domain
                    )
                )
                .opacity(model.shellMode == .domain ? 1 : 0)
                .allowsHitTesting(model.shellMode == .domain)
                .accessibilityHidden(model.shellMode != .domain)
            }
        }
        .animation(
            KenosMotion.shellMode(reduceMotion: reduceMotion),
            value: model.shellMode
        )
        .sensoryFeedback(
            .impact(flexibility: .soft, intensity: 0.65),
            trigger: model.shellMode
        )
        .accessibilityIdentifier("korben.surfaceHost")
        .onAppear {
            // Same migration as legacy: stale selectedTab=.settings → sheet over Today.
            if model.selectedTab == .settings {
                model.selectedTab = .today
                model.showSettingsSheet = true
            }
            model.syncLiveAccessoryMinimizeState()
        }
        .onChange(of: model.liveAccessory?.id) { _, _ in
            model.syncLiveAccessoryMinimizeState()
        }
        .onReceive(NotificationCenter.default.publisher(for: .kenosLiveAccessoryMinimize)) { note in
            let minimized = (note.userInfo?["minimized"] as? Bool) ?? false
            model.setLiveAccessoryMinimized(minimized)
        }
    }

    @ViewBuilder
    private var korbenNativeFallback: some View {
        switch model.selectedTab {
        case .today, .settings: TodayView(model: model)
        case .assistant: AssistantView(model: model)
        case .spaces: SpacesHubView(model: model)
        case .inbox: InboxView(model: model)
        }
    }
}

#endif
