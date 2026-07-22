import SwiftUI
import KenosClient
import KenosContracts
import KenosDesign
import KenosNotifications
import KenosStore
#if os(iOS)
import CoreSpotlight
import UIKit
#endif

struct KenosRootView: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    #if os(iOS)
    @Environment(\.scenePhase) private var scenePhase
    #endif

    var body: some View {
        Group {
            if !model.shellUnlocked {
                KenosShellUnlockGate(model: model)
            } else if model.focusStore.showCompletedSummary {
                NavigationStack {
                    FocusSummaryView(model: model)
                }
            } else if model.hideGlobalNavForFocus || model.focusStore.isPaused {
                // Focus Mode — immersive; no Kenos/Domain dock.
                NavigationStack {
                    FocusSessionView(model: model)
                }
            } else {
                #if os(iOS)
                KenosLaunchVeilHost {
                    KenosShellWithSpaceShelf(model: model) {
                        // Dual-layer keep-alive: depth morph + opacity (not remount).
                        ZStack {
                            Group {
                                if UIDevice.current.userInterfaceIdiom == .pad {
                                    iPadSplit
                                } else {
                                    iPhoneTabs
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

                            if model.continuityURL != nil {
                                KenosDomainModeShell(
                                    model: model,
                                    isActive: model.shellMode == .domain
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
                        // One soft impact on Mode flip only — dock already owns selection haptics.
                        .sensoryFeedback(
                            .impact(flexibility: .soft, intensity: 0.65),
                            trigger: model.shellMode
                        )
                    }
                }
                #else
                macSidebar
                #endif
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            // Live Accessory owns Focus return when present — avoid dual chrome.
            if model.focusStore.showReturnBanner, model.liveAccessory?.kind != .focus {
                FocusReturnBanner(model: model)
            }
        }
        .sheet(isPresented: $model.showCaptureSheet) {
            #if os(macOS)
            // Quick-entry panel — not a settings Form (macOS Form clips labels in sheets).
            KenosMacCapturePanel(model: model)
            #else
            NavigationStack {
                CaptureView(model: model)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Close") { model.showCaptureSheet = false }
                        }
                    }
            }
            #endif
        }
        .sheet(isPresented: $model.showApprovalsSheet) {
            NavigationStack {
                ApprovalsView(model: model)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Close") { model.showApprovalsSheet = false }
                        }
                    }
            }
            #if os(macOS)
            .frame(minWidth: 420, idealWidth: 520, minHeight: 420, idealHeight: 560)
            #endif
        }
        .sheet(isPresented: $model.showSpaceSwitcher) {
            #if os(macOS)
            KenosMacSpaceSwitcherPanel(model: model)
            #else
            SpaceSwitcherSheet(model: model)
            #endif
        }
        #if os(iOS)
        .sheet(isPresented: $model.showSettingsSheet) {
            NavigationStack {
                DailyBetaSettingsView(model: model)
            }
            // Follow Continuity shell theme (Light must stay Light — Round 1 P0).
            .preferredColorScheme(KenosShellSettingsStore.preferredColorScheme())
        }
        .sheet(isPresented: $model.showBugReportSheet, onDismiss: {
            model.clearBugReportDraftIfIdle()
        }) {
            KenosBugReportSheet(model: model)
                .preferredColorScheme(KenosShellSettingsStore.preferredColorScheme())
        }
        // Elevated UIWindow — visible above Capture / Space Switcher / Domain More sheets.
        .onAppear {
            KenosScreenshotBugPromptPresenter.sync(model: model)
        }
        .onChange(of: model.showScreenshotBugPrompt) { _, _ in
            KenosScreenshotBugPromptPresenter.sync(model: model)
        }
        .onChange(of: model.showBugReportSheet) { _, open in
            // Full sheet lives in the key window; never leave alert+1 overlay above it.
            if open { KenosScreenshotBugPromptPresenter.dismiss() }
            else { KenosScreenshotBugPromptPresenter.sync(model: model) }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.userDidTakeScreenshotNotification)) { _ in
            guard scenePhase == .active else { return }
            Task { @MainActor in
                await model.handleSystemScreenshot()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                KenosScreenshotBugPromptPresenter.sync(model: model)
                KenosWebRuntime.recoverAfterForeground()
                model.consumeWidgetPendingDeepLink()
                // TTL expiry → show gate again; live grant → restore shellUnlocked.
                model.reconcileShellUnlockOnForeground()
            } else if model.showScreenshotBugPrompt {
                // Leaving foreground cancels the quiet offer so it cannot block the next screenshot.
                model.dismissScreenshotBugPrompt()
            } else {
                KenosScreenshotBugPromptPresenter.dismiss()
            }
        }
        .onDisappear {
            // View teardown only — do not clear model flag here (would race tab/Focus swaps).
            KenosScreenshotBugPromptPresenter.dismiss()
        }
        #endif
        // Unlock prompt lives on KenosShellUnlockGate only — a RootView `.task` here
        // restarts when the gate unmounts and used to stack a second Face ID / bootstrap.
        .onChange(of: model.shellUnlocked) { _, unlocked in
            guard unlocked else { return }
            Task { @MainActor in
                await model.bootstrapIfNeeded()
            }
        }
        .task {
            // Cached grant (same process) — skip gate flash and hydrate immediately.
            if KenosUnlockGrantStore.isShellUnlocked() {
                _ = await model.unlockShellAndHydrate(prompt: false)
                await model.bootstrapIfNeeded()
            }
        }
        .onOpenURL { url in
            model.open(urlString: url.absoluteString)
        }
        #if os(iOS)
        .onContinueUserActivity(KenosUserActivityFoundation.activityType) { activity in
            if let link = KenosUserActivityFoundation.deepLink(from: activity) {
                model.open(urlString: link)
            }
        }
        .onContinueUserActivity(CSSearchableItemActionType) { activity in
            if let link = KenosUserActivityFoundation.deepLink(from: activity) {
                model.open(urlString: link)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .kenosOpenDomainContinuity)) { note in
            guard let url = note.object as? URL else { return }
            Task { @MainActor in
                model.enterDomainMode(url: url)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .kenosHandleDeepLink)) { note in
            guard let raw = note.object as? String else { return }
            model.open(urlString: raw)
        }
        #endif
        #if os(macOS)
        // Mac content canvas is dark-only (web shell forces #08090a) — keep native
        // chrome, sheets and the unlock gate on the same dark language.
        .preferredColorScheme(.dark)
        #endif
    }
    #if os(iOS)
    private var iPhoneTabs: some View {
        // Custom dock owns IA — no system TabView chrome (avoids ghost labels under Liquid Glass).
        // Single Daily Beta surface for all tabs — path updates reuse one WKWebView
        // (switch-per-tab used to remount + re-probe → white flash).
        // Settings is a modal sheet (showSettingsSheet) — never replaces this tab surface.
        // Kenos Mode stays on dark canvas; Domain polarity lives on Domain shell + root preferredColorScheme.
        return ZStack {
            KenosChromeAppearance.dark.canvasColor.ignoresSafeArea()
            if KenosDailyBetaConfig.isEnabled {
                KenosDailyBetaSurface(
                    path: model.dailyBetaPath(for: model.selectedTab == .settings ? .today : model.selectedTab),
                    isActive: model.shellMode != .domain,
                    accessoryBottomPadPx: model.hideGlobalDockForAssistantConversation
                        ? 0
                        : model.liveAccessoryWebBottomExtraPx,
                    chrome: model.hideGlobalDockForAssistantConversation
                        ? .kenosConversation
                        : .kenosTabs
                )
            } else {
                kenosTabSurface(model.selectedTab == .settings ? .today : model.selectedTab)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(KenosChromeAppearance.dark.canvasColor.ignoresSafeArea())
        .accessibilityIdentifier("kenos.tabs")
        // Daily Beta WK is full-bleed under the Liquid Glass dock (content may pass
        // behind while scrolling). Scroll-end clearance is CSS padding on #main-content.
        // Non-beta native tabs still need a layout inset so Form rows clear the dock.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !KenosDailyBetaConfig.isEnabled {
                KenosBottomChromeClearance(model: model)
            }
        }
        .onAppear {
            // Migrate stale selectedTab=.settings (pre-modal) → sheet over Today.
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
    private func kenosTabSurface(_ tab: KenosAppModel.Tab) -> some View {
        switch tab {
        case .today:
            kenosTabBody(
                .today,
                dailyPath: model.dailyBetaPath(for: .today),
                showSettings: false
            ) { TodayView(model: model) }
        case .assistant:
            kenosTabBody(
                .assistant,
                dailyPath: model.dailyBetaPath(for: .assistant),
                showSettings: false
            ) { AssistantView(model: model) }
        case .spaces:
            kenosTabBody(
                .spaces,
                dailyPath: model.dailyBetaPath(for: .spaces),
                showSettings: false
            ) { SpacesHubView(model: model) }
        case .inbox:
            kenosTabBody(
                .inbox,
                dailyPath: model.dailyBetaPath(for: .inbox),
                showSettings: false
            ) { InboxView(model: model) }
        case .settings:
            NavigationStack {
                DailyBetaSettingsView(model: model)
            }
        }
    }

    /// Daily Beta: full-bleed WKWebView. Page title + actions live in web scroll
    /// content (Apple Music large-title pattern) — not a fixed native overlay.
    /// Native fallback keeps NavigationStack for non-beta builds.
    @ViewBuilder
    private func kenosTabBody<Native: View>(
        _ tab: KenosAppModel.Tab,
        dailyPath: String,
        showSettings: Bool = false,
        @ViewBuilder native: () -> Native
    ) -> some View {
        Group {
            if KenosDailyBetaConfig.isEnabled {
                KenosDailyBetaSurface(
                    path: dailyPath,
                    accessoryBottomPadPx: model.liveAccessoryWebBottomExtraPx
                )
            } else {
                NavigationStack {
                    native()
                        .toolbar {
                            spaceSwitcherToolbar
                            if showSettings {
                                ToolbarItem(placement: .primaryAction) {
                                    Button("Settings", systemImage: "gearshape") {
                                        model.presentSettings()
                                    }
                                }
                            }
                        }
                }
            }
        }
        // No .id(tab) — remounting WKWebView on every dock switch flashes white.
    }

    private var spaceSwitcherToolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button {
                model.openContinue()
            } label: {
                Label("Continue", systemImage: "clock.arrow.circlepath")
            }
            .labelStyle(.iconOnly)
            .accessibilityLabel("Continue")
            .accessibilityHint("Opens recent resume targets only")
            .accessibilityIdentifier("kenos.continue.trigger")
            // Space switching: dock Spaces Orb → Space Shelf only.
        }
    }

    private var iPadSplit: some View {
        NavigationSplitView {
            // Settings is Today account-only; Spaces opens from toolbar → Shelf.
            List([KenosAppModel.Tab.today, .assistant, .inbox], selection: Binding(
                get: { Optional(model.selectedTab) },
                set: { if let value = $0 { model.selectedTab = value } }
            )) { tab in
                Text(tab.title).tag(tab)
            }
            .navigationTitle("Kenos")
            .accessibilityIdentifier("kenos.ipad.sidebar")
            .toolbar {
                ToolbarItem {
                    Button("Spaces", systemImage: "square.grid.2x2.fill") {
                        // Chrome owns spring via showSpaceShelf onChange.
                        model.openSpaceShelf()
                    }
                        .accessibilityIdentifier("kenos.dock.spaces")
                        .accessibilityHint("Opens Space Shelf to switch Spaces")
                }
                ToolbarItem {
                    Button("Capture", systemImage: "plus") { model.openCapture() }
                }
            }
        } detail: {
            NavigationStack { detailForSelection }
        }
    }
    #endif

    #if os(macOS)
    private var macSidebar: some View {
        NavigationSplitView(columnVisibility: $model.macSplitVisibility) {
            List(selection: Binding(
                get: { Optional(model.macSidebarSelection) },
                set: { if let value = $0 { model.selectMacSidebar(value) } }
            )) {
                Section("Kenos") {
                    macSidebarRow(.today)
                    macSidebarRow(.assistant)
                    macSidebarRow(.inbox)
                        .badge(model.pendingApprovalCount)
                }
                Section("Spaces") {
                    ForEach(KenosAppModel.macSidebarDomainOrder, id: \.self) { domainId in
                        macSidebarRow(.domain(domainId))
                    }
                }
            }
            .listStyle(.sidebar)
            .navigationSplitViewColumnWidth(min: 200, ideal: 240, max: 320)
            .navigationTitle("Kenos")
            .accessibilityIdentifier("kenos.mac.sidebar")
            // Settings opens a window (⌘,) — a pinned footer button avoids the
            // fake List-selection flash a sidebar row caused.
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
                    Divider()
                    Button {
                        model.presentSettings()
                    } label: {
                        Label("Settings", systemImage: "gearshape")
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .padding(6)
                    .accessibilityIdentifier("kenos.mac.sidebar.tab.settings")
                }
            }
            .toolbar {
                ToolbarItem {
                    Button("Spaces", systemImage: "square.grid.2x2.fill") {
                        model.openSpaceShelf()
                    }
                    .keyboardShortcut("s", modifiers: [.command, .shift])
                    .accessibilityIdentifier("kenos.dock.spaces")
                    .accessibilityHint("Opens Space Shelf to switch Spaces")
                }
                ToolbarItem {
                    Button("Capture", systemImage: "plus") {
                        model.openCapture()
                    }
                    .keyboardShortcut("n", modifiers: [.command, .shift])
                    .accessibilityIdentifier("kenos.mac.capture")
                }
            }
        } detail: {
            NavigationStack {
                macDetail
            }
        }
        // MAC-P2-02: prominentDetail avoids the empty middle column .balanced leaves.
        .navigationSplitViewStyle(.prominentDetail)
        .frame(minWidth: 960, minHeight: 640)
        .onReceive(NotificationCenter.default.publisher(for: .kenosOpenDomainContinuity)) { note in
            guard let url = note.object as? URL else { return }
            Task { @MainActor in
                model.enterDomainMode(url: url)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .kenosHandleDeepLink)) { note in
            guard let raw = note.object as? String else { return }
            model.open(urlString: raw)
        }
        .onReceive(NotificationCenter.default.publisher(for: .kenosDailyBetaOriginDidChange)) { _ in
            model.objectWillChange.send()
        }
    }

    private func macSidebarRow(_ item: KenosAppModel.MacSidebarItem) -> some View {
        Label {
            Text(item.title)
        } icon: {
            Image(systemName: item.systemImage)
                .foregroundStyle(macSidebarAccent(for: item))
        }
        .tag(item)
        .accessibilityIdentifier("kenos.mac.sidebar.\(item.id)")
    }

    private func macSidebarAccent(for item: KenosAppModel.MacSidebarItem) -> Color {
        switch item {
        case .domain(let domainId):
            return KenosDomainRegistry.accentColor(for: domainId)
        case .today, .assistant, .inbox:
            return Color(red: 0.357, green: 0.549, blue: 1.0) // Kenos accent
        case .settings:
            return .secondary
        }
    }

    @ViewBuilder
    private var macDetail: some View {
        if model.shellMode == .domain, model.continuityURL != nil {
            KenosMacDomainSurface(model: model)
        } else if KenosDailyBetaConfig.isEnabled,
                  let tab = model.macShellTab(for: model.macSidebarSelection)
        {
            KenosMacShellSurface(model: model, path: model.dailyBetaPath(for: tab))
        } else {
            switch model.macSidebarSelection {
            case .today: TodayView(model: model)
            case .assistant: AssistantView(model: model)
            case .inbox: InboxView(model: model)
            case .settings: DailyBetaSettingsView(model: model).formStyle(.grouped)
            case .domain:
                // Selection already triggers enterDomainMode; show hub while URL settles.
                SpacesHubView(model: model)
            }
        }
    }
    #endif

    @ViewBuilder
    private var detailForSelection: some View {
        switch model.selectedTab {
        case .today: TodayView(model: model)
        case .assistant: AssistantView(model: model)
        case .spaces: SpacesHubView(model: model)
        case .inbox: InboxView(model: model)
        case .settings: DailyBetaSettingsView(model: model)
        }
    }
}

#if os(iOS)
/// Hosts Space Shelf over Kenos Mode **and** Domain Mode — single SSOT for space switching.
private struct KenosShellWithSpaceShelf<Content: View>: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ViewBuilder var content: () -> Content
    @State private var openDragX: CGFloat = 0
    @State private var dismissDragX: CGFloat = 0
    @State private var shelfProgress: CGFloat = 0

    private var openAnimation: Animation {
        KenosMotion.shelf(reduceMotion: reduceMotion, closing: false)
    }

    private var isDraggingShelf: Bool {
        (!model.showSpaceShelf && openDragX > 0.5)
            || (model.showSpaceShelf && dismissDragX < -0.5)
    }

    /// Live Accessory sits above the dock — shift the edge-open band up with it.
    private var kenosEdgeOpenLiveAccessoryChrome: CGFloat {
        guard model.liveAccessory != nil, !model.showSpaceShelf else { return 0 }
        return model.liveAccessoryMinimized ? 52 : 80
    }

    var body: some View {
        // Domain Mode owns its own shelf morph + edge gesture inside KenosDomainModeShell.
        if model.shellMode == .domain {
            content()
        } else {
            ZStack(alignment: .leading) {
                content()
                    .scaleEffect(
                        KenosSpaceShelfChrome.backdropScale(
                            reduceMotion: reduceMotion,
                            progress: shelfProgress
                        ),
                        anchor: .center
                    )
                    .offset(
                        x: isDraggingShelf && !model.showSpaceShelf
                            ? KenosShelfGesture.backdropParallax(
                                translationX: openDragX,
                                reduceMotion: reduceMotion
                            )
                            : KenosSpaceShelfChrome.backdropOffset(
                                reduceMotion: reduceMotion,
                                progress: shelfProgress
                            )
                    )
                    .animation(isDraggingShelf ? nil : openAnimation, value: shelfProgress)
                    .modifier(
                        DomainShelfClip(
                            cornerRadius: reduceMotion
                                ? 0
                                : KenosSpaceShelfChrome.clipRadius(progress: shelfProgress)
                        )
                    )
                    // Soft page depth while Shelf owns the trailing edge shadow.
                    .shadow(
                        color: .black.opacity(0.14 * Double(min(1, shelfProgress))),
                        radius: 14,
                        x: -1,
                        y: 6
                    )
                    .allowsHitTesting(!model.showSpaceShelf && shelfProgress < 0.02)

                // Left-edge swipe → Space Shelf only in dock-adjacent band.
                // Mid/upper leading edge + Spaces tip stay free (Back / tip first).
                KenosShelfEdgeOpenOverlay(
                    enabled: !model.showSpaceShelf
                        && !model.hideGlobalNavForFocus
                        && !model.focusStore.isPaused,
                    additionalBottomChrome: kenosEdgeOpenLiveAccessoryChrome,
                    onChanged: { translation in
                        guard !reduceMotion else { return }
                        openDragX = translation
                    },
                    onEnded: { translation, velocity in
                        let shouldOpen = KenosShelfGesture.shouldCommitOpen(
                            translationX: translation,
                            velocityX: velocity
                        )
                        if shouldOpen {
                            // Chrome owns spring via showSpaceShelf onChange.
                            model.openSpaceShelf()
                        } else {
                            withAnimation(KenosMotion.shelfInteractive(reduceMotion: reduceMotion)) {
                                openDragX = 0
                                shelfProgress = 0
                            }
                        }
                    }
                )
                .zIndex(1)

                KenosSpaceShelfChrome(
                    model: model,
                    openDragX: $openDragX,
                    dismissDragX: $dismissDragX,
                    progress: $shelfProgress
                )
                .zIndex(2)

                // Dock above Shelf — Orb morphs to close; capsule hides inside GlobalDock.
                // Hidden while Settings modal is up (Done is the only exit).
                // Ask active conversation also hides dock (web liveState=conversation).
                if !model.showSettingsSheet, !model.hideGlobalDockForAssistantConversation {
                    KenosBottomChromeBar(model: model)
                        // Match content: 1:1 while dragging; spring only on settle.
                        .animation(isDraggingShelf ? nil : openAnimation, value: shelfProgress)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                        .zIndex(5)
                        .transition(
                            reduceMotion
                                ? .opacity
                                : .move(edge: .bottom).combined(with: .opacity)
                        )
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .animation(
                KenosMotion.page(reduceMotion: reduceMotion),
                value: model.hideGlobalDockForAssistantConversation
            )
            .onChange(of: model.hideGlobalDockForAssistantConversation) { _, hidden in
                if hidden {
                    model.dismissSpaceShelf()
                }
            }
            .sheet(isPresented: $model.showDomainMoreSheet) {
                KenosDomainMoreSheet(model: model)
            }
        }
    }
}

/// Layout inset for **native** surfaces only (Settings / non-beta tabs).
/// Daily Beta WK uses CSS scroll-end pad instead so content can pass behind glass.
private struct KenosBottomChromeClearance: View {
    @ObservedObject var model: KenosAppModel

    private var accessoryExtra: CGFloat {
        guard model.liveAccessory != nil, !model.showSpaceShelf else { return 0 }
        return model.liveAccessoryMinimized ? 56 : 88
    }

    var body: some View {
        Color.clear
            .frame(
                height: CGFloat(KenosGlass.dockScrollEndPadPx) + accessoryExtra
            )
            .accessibilityHidden(true)
    }
}

/// Live Accessory + GlobalDock — shared by Kenos shell (above Shelf) and Domain shell.
struct KenosBottomChromeBar: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        VStack(spacing: 0) {
            if let live = model.liveAccessory, !model.showSpaceShelf {
                KenosLiveAccessoryBar(
                    accessory: live,
                    minimized: model.liveAccessoryMinimized
                ) {
                    model.activateLiveAccessory(live)
                }
                .padding(.horizontal, KenosGlass.dockHorizontalInset)
                .padding(.bottom, model.liveAccessoryMinimized ? 4 : 8)
            }
            KenosGlobalDock(model: model)
                .padding(.leading, KenosGlass.dockLeadingInset)
                .padding(.trailing, KenosGlass.dockTrailingInset)
                .padding(.bottom, KenosGlass.dockBottomInset)
        }
    }
}
#endif

#if os(iOS)
/// Prefer system Liquid Glass tab bar (iOS 26); material fallback on older OS.
private struct KenosTabBarGlassModifier: ViewModifier {
    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            // Do not set custom toolbarBackground — system provides Liquid Glass.
            content.tabBarMinimizeBehavior(.onScrollDown)
        } else {
            content.toolbarBackground(.ultraThinMaterial, for: .tabBar)
        }
    }
}
#endif

struct KenosLiveAccessoryBar: View {
    let accessory: KenosAppModel.LiveAccessory
    var minimized: Bool = false
    let onActivate: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var symbolName: String {
        switch accessory.kind {
        case .focus: return "target"
        case .capture: return "tray.and.arrow.down.fill"
        case .musicNowPlaying: return "music.note"
        case .liveActivity(let kind):
            switch kind {
            case .training: return "figure.strengthtraining.traditional"
            case .focus: return "target"
            case .tidy: return "house"
            }
        case .continuity: return "play.circle.fill"
        }
    }

    /// Compact when scrolled (Music MiniPlayer / tabViewBottomAccessory), expanded at rest.
    /// Accessibility sizes always stay expanded so two-line context remains readable.
    private var useCompact: Bool {
        minimized && !dynamicTypeSize.isAccessibilitySize
    }

    var body: some View {
        Button(action: onActivate) {
            Group {
                if useCompact {
                    HStack(spacing: KenosSpacing.sm) {
                        Image(systemName: symbolName)
                            .foregroundStyle(.primary)
                            .imageScale(.medium)
                        Text(accessory.title)
                            .font(KenosTypography.caption.weight(.semibold))
                            .lineLimit(1)
                        Text(accessory.subtitle)
                            .font(KenosTypography.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.up")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                    .padding(.horizontal, KenosSpacing.md)
                    .padding(.vertical, 8)
                } else {
                    HStack(spacing: KenosSpacing.sm) {
                        Image(systemName: symbolName)
                            .foregroundStyle(.primary)
                            .imageScale(dynamicTypeSize.isAccessibilitySize ? .large : .medium)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(accessory.title)
                                .font(KenosTypography.caption.weight(.semibold))
                                .lineLimit(dynamicTypeSize.isAccessibilitySize ? 2 : 1)
                            Text(accessory.subtitle)
                                .font(KenosTypography.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(dynamicTypeSize.isAccessibilitySize ? 2 : 1)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.up")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, KenosSpacing.md)
                    .padding(.vertical, KenosSpacing.sm)
                }
            }
            .frame(maxWidth: .infinity)
            .kenosLiquidGlass(in: KenosGlass.dockShape, interactive: true)
        }
        .buttonStyle(KenosPressStyle(reduceMotion: reduceMotion))
        // Opacity only — offset/scale settle on inset chrome shakes the web canvas (HIG accessory).
        .transition(.opacity)
        .animation(KenosMotion.chrome(reduceMotion: reduceMotion), value: useCompact)
        .accessibilityIdentifier("kenos.liveAccessory")
        .accessibilityLabel("\(accessory.title), \(accessory.subtitle)")
        .accessibilityHint("Returns to the running activity")
        .accessibilityValue(useCompact ? "Minimized" : "Expanded")
    }
}

struct FocusReturnBanner: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Focus paused outside session")
                    .font(KenosTypography.caption.weight(.semibold))
                if let title = model.focusStore.focus?.title {
                    Text(title)
                        .font(KenosTypography.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button("Return") { model.returnToFocus() }
                .buttonStyle(KenosPressStyle(reduceMotion: reduceMotion))
                .accessibilityIdentifier("kenos.focus.return")
            Button("End") { model.endFocus() }
                .buttonStyle(KenosPressStyle(reduceMotion: reduceMotion))
                .accessibilityIdentifier("kenos.focus.banner.end")
        }
        .padding(.horizontal, KenosSpacing.md)
        .padding(.vertical, KenosSpacing.sm)
        .background(.ultraThinMaterial)
        .accessibilityIdentifier("kenos.focus.returnBanner")
    }
}

struct FocusSessionView: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        VStack(alignment: .leading, spacing: KenosSpacing.lg) {
            if let focus = model.focusStore.focus {
                Text(focus.title)
                    .font(KenosTypography.title)
                    .accessibilityIdentifier("kenos.focus.title")
                Text(focus.safeSummary)
                    .font(KenosTypography.body)
                    .foregroundStyle(.secondary)
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(KenosFocusStore.formatDuration(model.focusStore.elapsedSeconds(at: context.date)))
                        .font(KenosTypography.display)
                        .monospacedDigit()
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                        .accessibilityIdentifier("kenos.focus.timer")
                }
                Text(statusLabel(focus.status))
                    .font(KenosTypography.caption)
                    .foregroundStyle(.secondary)
                if let suggestion = model.focusStore.suggestions.first(where: { $0.status == .shown }) {
                    KenosRow(
                        title: suggestion.title,
                        subtitle: suggestion.safeSummary,
                        meta: "\(suggestion.risk.rawValue) · \(suggestion.whyNow)"
                    )
                    .accessibilityIdentifier("kenos.focus.suggestion")
                }
                HStack(spacing: KenosSpacing.sm) {
                    if model.focusStore.isPaused {
                        Button("Resume") { model.resumeFocus() }
                            .accessibilityIdentifier("kenos.focus.resume")
                    } else {
                        Button("Pause") { model.pauseFocus() }
                            .accessibilityIdentifier("kenos.focus.pause")
                    }
                    Button("Leave") { model.temporarilyLeaveFocus() }
                        .accessibilityIdentifier("kenos.focus.leave")
                    Button("End", role: .destructive) { model.endFocus() }
                        .accessibilityIdentifier("kenos.focus.end")
                }
                .buttonStyle(.bordered)
                Spacer()
                Text("Capture stays available from the system menu / toolbar.")
                    .font(KenosTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(KenosSpacing.lg)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .navigationTitle("Focus")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Capture", systemImage: "plus") { model.openCapture() }
            }
        }
        .accessibilityIdentifier("kenos.focus.session")
    }

    private func statusLabel(_ status: KenosFocusStatus) -> String {
        switch status {
        case .active: return "Active"
        case .paused: return "Paused"
        case .temporarilyLeft: return "Temporarily left"
        default: return status.rawValue
        }
    }
}

struct FocusSummaryView: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        VStack(alignment: .leading, spacing: KenosSpacing.md) {
            Text("Session complete")
                .font(KenosTypography.title)
            if let summary = model.focusStore.summary {
                Text(summary.progress)
                    .font(KenosTypography.body)
                Text(KenosFocusStore.formatDuration(summary.durationSeconds))
                    .font(KenosTypography.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("kenos.focus.summary.duration")
                if !summary.completedActions.isEmpty {
                    ForEach(summary.completedActions, id: \.self) { action in
                        Text("· \(action)")
                            .font(KenosTypography.body)
                    }
                }
                Text(summary.nextRecommendedStep)
                    .font(KenosTypography.caption)
                    .foregroundStyle(.secondary)
            }
            Button("Done") { model.dismissFocusSummary() }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("kenos.focus.summary.done")
            Spacer()
        }
        .padding(KenosSpacing.lg)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .navigationTitle("Summary")
        .accessibilityIdentifier("kenos.focus.summary")
    }
}

struct SurfaceChrome: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        Group {
            switch model.repository.state {
            case .loading:
                KenosStatusBanner(title: "Updating", detail: "Refreshing saved content", tone: .info)
            case .stale:
                KenosStatusBanner(title: "Showing saved content", detail: "Network unavailable · last sync kept", tone: .warning)
            case .unavailable:
                KenosStatusBanner(title: "Not enabled yet", detail: "This is not an empty list — the capability is off", tone: .warning)
            case .permissionDenied:
                KenosStatusBanner(title: "Sign-in required", detail: "This surface is closed until you sign in again", tone: .danger)
            case .sessionExpired:
                KenosStatusBanner(title: "Session expired", detail: "Sign in again to continue", tone: .danger)
            case .malformed:
                KenosStatusBanner(title: "Couldn’t load this update", detail: "Kept previous safe content when available", tone: .danger)
            case .partial:
                KenosStatusBanner(title: "Some content couldn’t update", detail: "Showing what is available", tone: .warning)
            case .empty:
                KenosEmptyState(title: "Nothing for Today", detail: "No open items from connected Spaces.")
            case .ready:
                EmptyView()
            }
        }
    }
}

struct TodayView: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: KenosSpacing.md) {
                Text("Now, next, and what needs you.")
                    .font(KenosTypography.body)
                    .foregroundStyle(.secondary)
                SurfaceChrome(model: model)
                if let cards = model.repository.snapshot.today?.cards {
                    ForEach(cards) { card in
                        Button {
                            model.open(urlString: card.deepLink)
                        } label: {
                            KenosRow(
                                title: card.title,
                                subtitle: card.summary,
                                meta: "\(card.ownerDomain.rawValue) · \(card.freshness)"
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("kenos.today.card.\(card.id)")
                    }
                } else if model.repository.state == .unavailable {
                    KenosEmptyState(title: "Today unavailable", detail: "Not an empty day — source missing.")
                }
            }
            .padding(KenosSpacing.lg)
        }
        .navigationTitle("Today")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Capture", systemImage: "plus") { model.openCapture() }
            }
            ToolbarItem(placement: .automatic) {
                Button("Settings", systemImage: "person.crop.circle") {
                    model.presentSettings()
                }
                .accessibilityIdentifier("kenos.today.settings")
            }
        }
        .refreshable { await model.repository.refresh() }
        .accessibilityIdentifier("kenos.today")
    }
}

struct AssistantView: View {
    @ObservedObject var model: KenosAppModel
    @State private var draft = ""

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: KenosSpacing.sm) {
                    ForEach(model.assistantMessages) { message in
                        KenosRow(
                            title: message.role == .user ? "You" : "Ask",
                            subtitle: message.text
                        )
                    }
                    if model.streaming {
                        KenosStatusBanner(title: "Thinking", detail: "Preparing a reply", tone: .info)
                    }
                }
                .padding(KenosSpacing.md)
            }
            HStack {
                TextField("Message", text: $draft)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("kenos.assistant.input")
                Button("Send") {
                    let text = draft
                    draft = ""
                    Task { await model.sendAssistant(text) }
                }
                .disabled(model.streaming)
                .accessibilityIdentifier("kenos.assistant.send")
            }
            .padding(KenosSpacing.md)
        }
        .navigationTitle("Ask")
        .toolbar {
            ToolbarItem {
                Button("Capture", systemImage: "plus") { model.openCapture() }
            }
        }
        .accessibilityIdentifier("kenos.assistant")
    }
}

struct SpacesHubView: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        List {
            Section("Focus") {
                Button {
                    model.startTrainingFocus()
                } label: {
                    KenosRow(
                        title: "Start Training Focus",
                        subtitle: "Hide Work / Money / Home noise",
                        meta: "local"
                    )
                }
                .accessibilityIdentifier("kenos.spaces.focus.training")
                Button {
                    model.startDeepWorkFocus()
                } label: {
                    KenosRow(
                        title: "Start Deep Work Focus",
                        subtitle: "Stay on Work / Plan / Library",
                        meta: "local"
                    )
                }
                .accessibilityIdentifier("kenos.spaces.focus.deepWork")
            }
            Section("Spaces") {
                ForEach(KenosAppModel.spaceCatalog) { entry in
                    Button {
                        model.openSpace(entry)
                    } label: {
                        KenosRow(
                            title: entry.title,
                            subtitle: entry.subtitle,
                            meta: meta(for: entry)
                        )
                    }
                    .accessibilityIdentifier("kenos.spaces.\(entry.id)")
                }
            }
        }
        .navigationTitle("Spaces")
        .navigationDestination(item: $model.spacesDestination) { destination in
            switch destination {
            case .work:
                WorkHubView(model: model)
            default:
                WorkHubView(model: model)
            }
        }
        .toolbar {
            ToolbarItem {
                Button("Capture", systemImage: "plus") { model.openCapture() }
            }
        }
        .accessibilityIdentifier("kenos.spaces")
    }

    private func meta(for entry: KenosAppModel.SpaceCatalogEntry) -> String {
        switch entry.kind {
        case .hosted, .external:
            // MAC-P1-01: Continuity opens in-app — never badge as "external".
            return ""
        case .comingSoon:
            return "coming soon"
        }
    }
}

#if os(iOS)
/// Auto-focus Quick Switch search (iOS 18+ `.searchFocused`). Older OS keeps always-visible drawer only.
private struct KenosQuickSwitchSearchFocusModifier: ViewModifier {
    let enabled: Bool
    var searchFocused: FocusState<Bool>.Binding

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *), enabled {
            content
                .searchFocused(searchFocused)
                .onAppear {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                        searchFocused.wrappedValue = true
                    }
                }
        } else {
            content
        }
    }
}
#else
private struct KenosQuickSwitchSearchFocusModifier: ViewModifier {
    let enabled: Bool
    var searchFocused: FocusState<Bool>.Binding

    func body(content: Content) -> some View {
        content.onAppear {
            guard enabled else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                searchFocused.wrappedValue = true
            }
        }
    }
}
#endif

struct SpaceSwitcherSheet: View {
    @ObservedObject var model: KenosAppModel
    @State private var query = ""
    @FocusState private var searchFocused: Bool

    private var isQuickSwitch: Bool {
        model.spaceChromeMode == .quickSwitch
    }

    var body: some View {
        NavigationStack {
            List {
                switch model.spaceChromeMode {
                case .continueRecent:
                    continueSections
                case .switchSpace:
                    switchSections
                case .quickSwitch:
                    quickSwitchSections
                }
            }
            .navigationTitle(title)
            #if os(iOS)
            .searchable(
                text: $query,
                placement: isQuickSwitch ? .navigationBarDrawer(displayMode: .always) : .automatic,
                prompt: searchPrompt
            )
            #else
            .searchable(text: $query, prompt: searchPrompt)
            #endif
            .modifier(KenosQuickSwitchSearchFocusModifier(
                enabled: isQuickSwitch,
                searchFocused: $searchFocused
            ))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { model.dismissSpaceChrome() }
                }
            }
            .accessibilityIdentifier(accessibilityId)
        }
        #if os(iOS)
        .presentationDetents(
            isQuickSwitch
                ? [.medium, .large]
                : (model.spaceChromeMode == .continueRecent ? [.medium, .large] : [.large, .medium])
        )
        .presentationDragIndicator(.visible)
        .presentationContentInteraction(isQuickSwitch ? .scrolls : .automatic)
        #endif
    }

    private var title: String {
        switch model.spaceChromeMode {
        case .continueRecent: return "Continue"
        case .switchSpace: return "Switch Space"
        case .quickSwitch: return "Quick Switch"
        }
    }

    private var searchPrompt: String {
        switch model.spaceChromeMode {
        case .continueRecent: return "Filter recent"
        case .switchSpace: return "Filter Spaces"
        case .quickSwitch: return "Search Spaces and resumes"
        }
    }

    private var accessibilityId: String {
        switch model.spaceChromeMode {
        case .continueRecent: return "kenos.continue.sheet"
        case .switchSpace: return "kenos.spaceSwitcher"
        case .quickSwitch: return "kenos.quickSwitch"
        }
    }

    @ViewBuilder
    private var continueSections: some View {
        if filteredContinue.isEmpty && filteredRecent.isEmpty {
            Section {
                Text("Nothing to continue yet. Open a Space from the Spaces tab, then come back here.")
                    .font(KenosTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
        if !filteredContinue.isEmpty {
            Section("Resume") {
                ForEach(filteredContinue, id: \.key) { item in
                    resumeButton(item)
                }
            }
        }
        if !filteredRecent.isEmpty {
            Section("Recent Spaces") {
                ForEach(filteredRecent) { entry in
                    spaceButton(entry, meta: "recent")
                }
            }
        }
    }

    @ViewBuilder
    private var switchSections: some View {
        Section("System") {
            Button("Today") { model.returnToSystem(.today) }
        }
        if !filteredPinned.isEmpty {
            Section("Pinned") {
                ForEach(filteredPinned) { entry in
                    spaceRowWithPin(entry, meta: "pinned")
                }
            }
        }
        if !filteredRecent.isEmpty {
            Section("Recent") {
                ForEach(filteredRecent) { entry in
                    spaceButton(entry, meta: "recent")
                }
            }
        }
        #if os(macOS)
        // MAC-P2-01: sidebar owns one-click Space switch; shelf is search / pin / recent.
        if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Section {
                Text("Use the sidebar to open a Space. Pin favorites here, or search by name.")
                    .font(KenosTypography.caption)
                    .foregroundStyle(.secondary)
            }
        } else {
            Section("Matches") {
                ForEach(filteredCatalog) { entry in
                    spaceRowWithPin(entry, meta: meta(for: entry))
                }
            }
        }
        #else
        Section("All Domains") {
            ForEach(filteredCatalog) { entry in
                spaceRowWithPin(entry, meta: meta(for: entry))
            }
        }
        #endif
    }

    @ViewBuilder
    private var quickSwitchSections: some View {
        if !filteredContinue.isEmpty {
            Section("Recent objects") {
                ForEach(filteredContinue, id: \.key) { item in
                    resumeButton(item)
                }
            }
        }
        if !filteredPinned.isEmpty {
            Section("Pinned") {
                ForEach(filteredPinned) { entry in
                    spaceButton(entry, meta: "pinned")
                }
            }
        }
        Section("Spaces") {
            ForEach(filteredCatalog) { entry in
                spaceButton(entry, meta: meta(for: entry))
            }
        }
        Section("System") {
            ForEach(KenosAppModel.Tab.allCases) { tab in
                if matches(tab.title) {
                    Button(tab.title) { model.returnToSystem(tab) }
                }
            }
        }
    }

    private func resumeButton(_ item: (key: String, descriptor: KenosSpaceSwitcherStore.ResumeDescriptor)) -> some View {
        Button {
            model.continueSpace(listKey: item.key)
        } label: {
            KenosRow(
                title: item.descriptor.displayTitle,
                subtitle: item.descriptor.displaySubtitle ?? item.descriptor.spaceId,
                meta: item.descriptor.isExpired ? "expired → home" : "resume"
            )
        }
        .accessibilityIdentifier("kenos.continue.\(item.descriptor.spaceId)")
    }

    private func spaceButton(_ entry: KenosAppModel.SpaceCatalogEntry, meta: String) -> some View {
        Button {
            model.openSpace(entry)
        } label: {
            KenosRow(title: entry.title, subtitle: entry.subtitle, meta: meta)
        }
    }

    private func spaceRowWithPin(_ entry: KenosAppModel.SpaceCatalogEntry, meta: String) -> some View {
        HStack {
            Button {
                model.openSpace(entry)
            } label: {
                HStack {
                    KenosRow(title: entry.title, subtitle: entry.subtitle, meta: meta)
                    if model.recentSpaceIds.first == entry.id || model.spacesDestination?.rawValue == entry.id {
                        Image(systemName: "checkmark")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Button {
                model.togglePinnedSpace(id: entry.id)
            } label: {
                Image(systemName: model.pinnedSpaceIds.contains(entry.id) ? "star.fill" : "star")
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(model.pinnedSpaceIds.contains(entry.id) ? "Unpin \(entry.title)" : "Pin \(entry.title)")
        }
    }

    private var continueEntries: [(key: String, descriptor: KenosSpaceSwitcherStore.ResumeDescriptor)] {
        model.spaceSwitcherStore.resumeByListKey
            .map { (key: $0.key, descriptor: $0.value) }
            .sorted { $0.descriptor.updatedAt > $1.descriptor.updatedAt }
    }

    private var recentEntries: [KenosAppModel.SpaceCatalogEntry] {
        model.recentSpaceIds.compactMap { id in
            KenosAppModel.spaceCatalog.first { $0.id == id }
        }
    }

    private var pinnedEntries: [KenosAppModel.SpaceCatalogEntry] {
        model.pinnedSpaceIds.compactMap { id in
            KenosAppModel.spaceCatalog.first { $0.id == id }
        }
    }

    private var filteredContinue: [(key: String, descriptor: KenosSpaceSwitcherStore.ResumeDescriptor)] {
        continueEntries.filter {
            matches($0.descriptor.displayTitle)
                || matches($0.descriptor.displaySubtitle ?? "")
                || matches($0.descriptor.spaceId)
        }
    }

    private var filteredRecent: [KenosAppModel.SpaceCatalogEntry] {
        recentEntries.filter { matches($0.title) || matches($0.subtitle) }
    }

    private var filteredPinned: [KenosAppModel.SpaceCatalogEntry] {
        pinnedEntries.filter { matches($0.title) || matches($0.subtitle) }
    }

    private var filteredCatalog: [KenosAppModel.SpaceCatalogEntry] {
        KenosAppModel.spaceCatalog.filter { matches($0.title) || matches($0.subtitle) }
    }

    private func matches(_ text: String) -> Bool {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return true }
        return text.localizedCaseInsensitiveContains(q)
    }

    private func meta(for entry: KenosAppModel.SpaceCatalogEntry) -> String {
        switch entry.kind {
        case .hosted, .external:
            // MAC-P1-01: Continuity opens in-app — never badge as "external".
            return ""
        case .comingSoon:
            return "coming soon"
        }
    }
}

struct InboxView: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        List {
            SurfaceChrome(model: model)
            Section("Queues") {
                Button("Approvals") { model.inboxDestination = .approvals }
                Button("Activity") { model.inboxDestination = .activity }
                Button("Quick Capture") { model.inboxDestination = .capture }
                Button("Library links") { model.inboxDestination = .library }
                Button("System status") { model.inboxDestination = .system }
                Button("Settings") { model.presentSettings() }
            }
            Section("Captured") {
                ForEach(model.repository.snapshot.inbox) { item in
                    Button {
                        model.open(urlString: item.deepLink)
                    } label: {
                        KenosRow(
                            title: item.title,
                            subtitle: item.safeSummary,
                            meta: "\(item.ownerDomain.rawValue) · \(item.source) · \(item.freshness)"
                        )
                    }
                    .accessibilityIdentifier("kenos.inbox.item.\(item.id.uuidString)")
                }
            }
            if !model.watchCaptures.isEmpty {
                Section("Watch captures") {
                    ForEach(model.watchCaptures) { draft in
                        Button {
                            model.reviewWatchCapture(draft)
                        } label: {
                            KenosRow(
                                title: "From Watch",
                                subtitle: KenosGlanceMapper.captureGlance(from: draft).safePreview,
                                meta: draft.queueStatus
                            )
                        }
                        .accessibilityIdentifier("kenos.capture.watch.\(draft.id.uuidString)")
                    }
                }
            }
            Section("Notification preferences") {
                Toggle(
                    "Plan reminders",
                    isOn: Binding(
                        get: { model.notificationPreferences.categoryEnabled[.planReminder] ?? true },
                        set: { enabled in
                            Task { await model.setNotificationCategoryEnabled(.planReminder, enabled: enabled) }
                        }
                    )
                )
                .accessibilityIdentifier("kenos.notification.pref.planReminder")
                Toggle(
                    "Training rest alerts",
                    isOn: Binding(
                        get: { model.notificationPreferences.categoryEnabled[.trainingRestEnd] ?? true },
                        set: { enabled in
                            Task { await model.setNotificationCategoryEnabled(.trainingRestEnd, enabled: enabled) }
                        }
                    )
                )
                .accessibilityIdentifier("kenos.notification.pref.trainingRestEnd")
                Toggle(
                    "Morning brief",
                    isOn: Binding(
                        get: { model.notificationPreferences.categoryEnabled[.kenosDailyBrief] ?? true },
                        set: { enabled in
                            Task { await model.setNotificationCategoryEnabled(.kenosDailyBrief, enabled: enabled) }
                        }
                    )
                )
                .accessibilityIdentifier("kenos.notification.pref.kenosDailyBrief")
                Toggle(
                    "Bill due reminders",
                    isOn: Binding(
                        get: { model.notificationPreferences.categoryEnabled[.moneyBillDue] ?? true },
                        set: { enabled in
                            Task { await model.setNotificationCategoryEnabled(.moneyBillDue, enabled: enabled) }
                        }
                    )
                )
                .accessibilityIdentifier("kenos.notification.pref.moneyBillDue")
                Toggle(
                    "Health focus / wind-down",
                    isOn: Binding(
                        get: {
                            (model.notificationPreferences.categoryEnabled[.healthFocusWarn] ?? true)
                                && (model.notificationPreferences.categoryEnabled[.healthWindDown] ?? true)
                        },
                        set: { enabled in
                            Task {
                                await model.setNotificationCategoryEnabled(.healthFocusWarn, enabled: enabled)
                                await model.setNotificationCategoryEnabled(.healthWindDown, enabled: enabled)
                            }
                        }
                    )
                )
                .accessibilityIdentifier("kenos.notification.pref.healthAlerts")
                Toggle(
                    "Approvals",
                    isOn: Binding(
                        get: { model.notificationPreferences.categoryEnabled[.approvalRequested] ?? true },
                        set: { enabled in
                            Task { await model.setNotificationCategoryEnabled(.approvalRequested, enabled: enabled) }
                        }
                    )
                )
                Toggle(
                    "Sync failures",
                    isOn: Binding(
                        get: { model.notificationPreferences.syncFailureVisible },
                        set: { enabled in
                            Task {
                                var prefs = model.notificationPreferences
                                prefs.syncFailureVisible = enabled
                                await model.updateNotificationPreferences(prefs)
                            }
                        }
                    )
                )
                Toggle(
                    "Quiet hours (22:00–07:00)",
                    isOn: Binding(
                        get: {
                            model.notificationPreferences.quietHoursStart != nil
                                && model.notificationPreferences.quietHoursEnd != nil
                        },
                        set: { on in
                            Task {
                                if on {
                                    await model.setNotificationQuietHours(start: 22, end: 7)
                                } else {
                                    await model.setNotificationQuietHours(start: nil, end: nil)
                                }
                            }
                        }
                    )
                )
                .accessibilityIdentifier("kenos.notification.pref.quietHours")
            }
            if !model.notificationInbox.isEmpty {
                Section("Notifications") {
                    ForEach(model.notificationInbox) { note in
                        Button {
                            model.openNotification(note)
                        } label: {
                            KenosRow(
                                title: note.safeTitle,
                                subtitle: KenosNotificationSafety.lockScreenBody(for: note),
                                meta: note.type.rawValue
                            )
                        }
                        .accessibilityIdentifier("kenos.notification.\(note.id.uuidString)")
                    }
                }
            }
        }
        .navigationTitle("Inbox")
        .navigationDestination(item: $model.inboxDestination) { destination in
            inboxDestinationView(destination)
        }
        .toolbar {
            ToolbarItem {
                Button("Capture", systemImage: "plus") { model.openCapture() }
            }
        }
        .task {
            await model.refreshNotificationInbox()
        }
        .accessibilityIdentifier("kenos.inbox")
    }

    @ViewBuilder
    private func inboxDestinationView(_ destination: KenosAppModel.InboxDestination) -> some View {
        switch destination {
        case .approvals: ApprovalsView(model: model)
        case .activity: ActivityView(model: model)
        case .capture: CaptureView(model: model)
        case .system: SystemStatusView(model: model)
        case .library:
            List {
                if let library = model.repository.snapshot.work?.library {
                    ForEach(Array(library.enumerated()), id: \.offset) { _, ref in
                        KenosRow(title: ref.safeTitle ?? "Document", subtitle: ref.libraryRef.id.uuidString)
                    }
                }
            }
            .navigationTitle("Library")
        case .settings:
            Form {
                Section("Daily Beta origin") {
                    Text(KenosDailyBetaConfig.kenOsOrigin.absoluteString)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                    Text("Must be a phone-reachable LAN or private origin — never 127.0.0.1 on iPhone.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text("Sign-in uses the local secure store on this device.")
                Text("Approvals actions: \(model.approvalsActionsEnabled ? "ON" : "OFF")")
                Button("Sign out") {
                    Task { await model.logout() }
                }
                .accessibilityIdentifier("kenos.settings.logout")
            }
            .navigationTitle("Settings")
        }
    }
}

struct ApprovalsView: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        List {
            if !model.approvalsActionsEnabled {
                KenosStatusBanner(
                    title: "Review only for now",
                    detail: "You can read pending requests. Approve / Reject stay off until write actions are enabled.",
                    tone: .warning
                )
            }
            ForEach(model.repository.snapshot.approvals, id: \.id) { approval in
                VStack(alignment: .leading, spacing: KenosSpacing.xs) {
                    KenosRow(
                        title: approval.safeSummary,
                        subtitle: approvalHumanSubtitle(approval),
                        meta: approvalExpiryMeta(approval.expiresAt.rawValue)
                    )
                    if model.approvalsActionsEnabled {
                        HStack {
                            Button("Approve") {}
                            Button("Reject") {}
                        }
                        .accessibilityIdentifier("kenos.approvals.actions")
                    } else {
                        Text("Details · \(approvalHumanAction(approval.actionType))")
                            .font(KenosTypography.caption)
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("kenos.approvals.actions.disabled")
                    }
                }
            }
        }
        .navigationTitle("Approvals")
        .accessibilityIdentifier("kenos.approvals")
    }

    /// MAC-P1-08: hide slug · risk · ISO from the primary line.
    private func approvalHumanSubtitle(_ approval: ApprovalRecord) -> String {
        let risk = approvalRiskLabel(approval.risk)
        let status = approval.status.rawValue.replacingOccurrences(of: "_", with: " ")
        return "\(risk) · \(status)"
    }

    private func approvalHumanAction(_ actionType: String) -> String {
        switch actionType {
        case "plan.create_task": return "Create plan task"
        case "plan.reschedule_task": return "Reschedule plan task"
        case "plan.update_task": return "Update plan task"
        case "plan.complete_task": return "Complete plan task"
        case "capture.review": return "Review capture"
        default:
            let parts = actionType.split(separator: ".")
            if parts.count == 2 {
                let verb = parts[1].replacingOccurrences(of: "_", with: " ")
                return verb.prefix(1).uppercased() + verb.dropFirst()
            }
            return actionType.replacingOccurrences(of: "_", with: " ")
        }
    }

    private func approvalRiskLabel(_ risk: KenosRisk) -> String {
        switch risk {
        case .r0: return "Low risk"
        case .r1: return "Review"
        case .r2: return "Needs confirm"
        case .r3: return "Strong confirm"
        case .r4: return "Blocked"
        }
    }

    private func approvalExpiryMeta(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: iso)
            ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return "Expiry unknown" }
        let rel = RelativeDateTimeFormatter()
        rel.unitsStyle = .full
        return "Expires \(rel.localizedString(for: date, relativeTo: Date()))"
    }
}

struct ActivityView: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        List {
            ForEach(model.repository.snapshot.activity) { item in
                KenosRow(
                    title: item.safeSummary,
                    subtitle: "\(item.result) · undo=\(item.undoAvailable ? "available" : "none")",
                    meta: item.correlationId.uuidString
                )
                .accessibilityIdentifier("kenos.activity.item.\(item.id.uuidString)")
            }
        }
        .navigationTitle("Activity")
        .accessibilityIdentifier("kenos.activity")
    }
}

struct WorkHubView: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        List {
            Section {
                Button("‹ All Spaces") {
                    model.spacesDestination = nil
                    model.selectedTab = .spaces
                }
            }
            SurfaceChrome(model: model)
            if case let .workProject(id) = model.route,
               let project = model.repository.snapshot.work?.projects.first(where: { $0.id == id }) {
                Section("Project") {
                    projectDetail(project)
                }
            } else if let projects = model.repository.snapshot.work?.projects {
                Section("Projects") {
                    ForEach(projects, id: \.id) { project in
                        Button {
                            model.open(.workProject(project.id))
                        } label: {
                            KenosRow(title: project.title, subtitle: project.safeSummary, meta: project.status.rawValue)
                        }
                        .accessibilityIdentifier("kenos.work.project.\(project.id.uuidString)")
                    }
                }
            }
            if let deliverables = model.repository.snapshot.work?.deliverables {
                Section("Deliverables") {
                    ForEach(deliverables, id: \.id) { item in
                        Button {
                            model.open(.deliverable(item.id))
                        } label: {
                            KenosRow(title: item.title, subtitle: item.safeSummary, meta: item.status.rawValue)
                        }
                    }
                }
            }
            if let library = model.repository.snapshot.work?.library {
                Section("Library refs") {
                    ForEach(Array(library.enumerated()), id: \.offset) { _, ref in
                        KenosRow(
                            title: ref.safeTitle ?? "Library document",
                            subtitle: ref.libraryRef.type,
                            meta: ref.deepLink?.absoluteString
                        )
                    }
                }
            }
            if case let .planTask(id) = model.route {
                Section("Plan Task reference") {
                    KenosRow(
                        title: "Plan Task",
                        subtitle: id.uuidString,
                        meta: "Deep link only · Plan remains owner"
                    )
                }
            }
        }
        .navigationTitle("Work")
        .accessibilityIdentifier("kenos.work")
    }

    @ViewBuilder
    private func projectDetail(_ project: WorkProject) -> some View {
        KenosRow(title: project.title, subtitle: project.safeSummary, meta: project.status.rawValue)
        ForEach(project.planTaskRefs, id: \.taskRef.id) { ref in
            Button {
                model.open(.planTask(ref.taskRef.id))
            } label: {
                KenosRow(
                    title: ref.safeTitle ?? "Plan Task",
                    subtitle: "Plan-owned task reference",
                    meta: ref.deepLink?.absoluteString
                )
            }
            .accessibilityIdentifier("kenos.work.planref.\(ref.taskRef.id.uuidString)")
        }
        NavigationLink("Related Activity") {
            ActivityView(model: model)
        }
    }
}

struct CaptureView: View {
    @ObservedObject var model: KenosAppModel
    @State private var successPulse = 0

    var body: some View {
        Form {
            Section {
                // MAC-P1-07: vertical label avoids macOS Form horizontal clip.
                VStack(alignment: .leading, spacing: KenosSpacing.xs) {
                    Text("Draft")
                        .font(KenosTypography.caption)
                        .foregroundStyle(.secondary)
                    TextField("What's on your mind?", text: $model.captureText, axis: .vertical)
                        .lineLimit(3...6)
                        .accessibilityIdentifier("kenos.capture.input")
                }
                .padding(.vertical, 2)
                Button("Save draft") {
                    model.submitCapture()
                    successPulse += 1
                }
                .disabled(model.captureText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityIdentifier("kenos.capture.submit")
            } header: {
                Text("Quick Capture")
            } footer: {
                Text("Saves a local draft only — does not create Task/Project/Decision or upload clipboard secrets.")
                    .font(KenosTypography.caption)
            }
            if let draft = model.lastCapture {
                Section("Review") {
                    KenosRow(
                        title: "Local draft",
                        subtitle: draft.text,
                        meta: "\(draft.queueStatus) · \(draft.correlationId.uuidString)"
                    )
                }
            }
        }
        .navigationTitle("Capture")
        .accessibilityIdentifier("kenos.capture")
        .sensoryFeedback(.success, trigger: successPulse)
    }
}

struct SystemStatusView: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        List {
            KenosRow(
                title: "Local services",
                subtitle: "API · projection cache · offline queue",
                meta: model.repository.snapshot.meta.lastSuccessfulSync
            )
            KenosRow(
                title: "Offline queue",
                subtitle: "\(model.queue.actions.count) actions",
                meta: model.queue.failedActions().isEmpty ? "no failures" : "has failures"
            )
            ForEach(model.queue.actions) { action in
                KenosRow(
                    title: action.safeSummary,
                    subtitle: "\(action.status.rawValue) · \(action.actionType)",
                    meta: action.idempotencyKey
                )
            }
            Button("Process queue") {
                Task { await model.queue.processPending(manual: true) }
            }
            .accessibilityIdentifier("kenos.system.processQueue")
        }
        .navigationTitle("System")
        .accessibilityIdentifier("kenos.system")
    }
}

struct DailyBetaSettingsView: View {
    @ObservedObject var model: KenosAppModel
    @State private var originDraft = KenosDailyBetaConfig.kenOsOrigin.absoluteString
    #if os(iOS)
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var healthSyncer = KenosHealthSyncer.shared
    @State private var webSsoSignedIn = KenosSharedWebAuth.hasSharedTokens
    #endif

    private var zh: Bool {
        KenosShellSettingsStore.current.resolvedLocale() == "zh"
    }

    private func L(_ en: String, _ zhText: String) -> String {
        zh ? zhText : en
    }

    var body: some View {
        Form {
            #if os(iOS)
            Section {
                LabeledContent(L("Kenos account", "Kenos 账户")) {
                    // Token presence ≠ Continuity sync health. Never label this "Synced".
                    Text(webSsoSignedIn ? L("Signed in", "已登录") : L("Not connected", "未连接"))
                        .foregroundStyle(webSsoSignedIn ? .primary : .secondary)
                }
                .accessibilityIdentifier("kenos.settings.webSso")

                LabeledContent(L("Device lock", "设备锁")) {
                    Text(
                        KenosDeviceIdentityStore.isPaired
                            ? L("Paired — Face ID unlock", "已配对 — Face ID 解锁")
                            : L("Not paired — sign in once", "未配对 — 登录一次以绑定")
                    )
                    .foregroundStyle(KenosDeviceIdentityStore.isPaired ? .primary : .secondary)
                }
                .accessibilityIdentifier("kenos.settings.deviceLock")

                LabeledContent(L("Key storage", "密钥存储")) {
                    Text(
                        KenosDeviceIdentityStore.keyStorage == .secureEnclave
                            ? L("Secure Enclave", "Secure Enclave")
                            : L("Software Keychain", "软件钥匙串")
                    )
                    .foregroundStyle(.secondary)
                }
                .accessibilityIdentifier("kenos.settings.deviceKeyStorage")
            } header: {
                Text(L("Account", "账户"))
            } footer: {
                Text(
                    L(
                        "Sign in once on this iPhone/Mac to pair. Later cold starts only need Face ID — browsers still require account login. Manage devices in Portal. Revoke requires a fresh login (15m).",
                        "在本机 Kenos App 登录一次即可配对；之后冷启动只需 Face ID。浏览器仍需账号登录。可在 Portal 管理信任设备。撤销设备需 15 分钟内的新鲜登录。"
                    )
                )
                .font(KenosTypography.caption)
            }

            Section {
                Picker(
                    L("Theme", "主题"),
                    selection: Binding(
                        get: { KenosShellSettingsStore.current.theme },
                        set: { next in
                            let snap = KenosShellSettingsStore.update(theme: next)
                            KenosNativeCapabilityBridge.broadcastShellSettings(snap)
                        }
                    )
                ) {
                    Text(L("Auto", "跟随系统")).tag("auto")
                    Text(L("Light", "浅色")).tag("light")
                    Text(L("Dark", "深色")).tag("dark")
                }
                .accessibilityIdentifier("kenos.settings.shellTheme")

                Picker(
                    L("Language", "语言"),
                    selection: Binding(
                        get: { KenosShellSettingsStore.current.locale },
                        set: { next in
                            let snap = KenosShellSettingsStore.update(locale: next)
                            KenosNativeCapabilityBridge.broadcastShellSettings(snap)
                        }
                    )
                ) {
                    Text(L("System", "跟随系统")).tag("system")
                    Text("中文").tag("zh")
                    Text("English").tag("en")
                }
                .accessibilityIdentifier("kenos.settings.shellLocale")

                if KenosDailyBetaConfig.isEnabled {
                    NavigationLink {
                        KenosDailyBetaSurface(
                            path: "/settings",
                            isActive: true,
                            // Modal Settings hides Global Dock — no dock scroll pad.
                            accessoryBottomPadPx: 0
                        )
                            .navigationTitle(L("Appearance & AI", "外观与助手"))
                            .navigationBarTitleDisplayMode(.inline)
                    } label: {
                        Label(L("AI & assistant", "AI 与助手"), systemImage: "slider.horizontal.3")
                    }
                    .accessibilityIdentifier("kenos.settings.appPreferences")
                }
            } header: {
                Text(L("Appearance", "外观"))
            } footer: {
                Text(
                    L(
                        "Theme and language apply across Kenos and Continuity spaces.",
                        "主题与语言会应用到 Kenos 与各空间。"
                    )
                )
                .font(KenosTypography.caption)
            }

            Section {
                Toggle(L("Ask after screenshots", "截图后询问是否反馈"), isOn: Binding(
                    get: { model.askAfterScreenshotEnabled },
                    set: { model.setAskAfterScreenshotEnabled($0) }
                ))
                .accessibilityIdentifier("kenos.settings.askAfterScreenshot")
                Button {
                    Task { @MainActor in
                        await model.beginBugReport(delayCapture: true)
                    }
                } label: {
                    Label(L("Report a Bug", "报告问题"), systemImage: "ladybug")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .accessibilityIdentifier("kenos.settings.reportBug")
            } header: {
                Text(L("Support", "支持"))
            } footer: {
                Text(
                    L(
                        "Screenshots can quietly offer a report. Diagnostics stay optional.",
                        "截图后可安静询问是否反馈。诊断信息可按需附带。"
                    )
                )
                .font(KenosTypography.caption)
            }
            #endif

            #if os(macOS)
            // MAC-P0-04: split account sync vs shell-origin reachability (was "Connected" vs Today CTA).
            Section {
                LabeledContent(L("Kenos account", "Kenos 账户")) {
                    Text(
                        KenosSharedWebAuth.hasSharedTokens
                            ? L("Signed in", "已登录")
                            : L("Not signed in", "未登录")
                    )
                    .foregroundStyle(KenosSharedWebAuth.hasSharedTokens ? .primary : .secondary)
                }
                .accessibilityIdentifier("kenos.settings.webSso")
                LabeledContent(L("Device lock", "设备锁")) {
                    Text(
                        KenosDeviceIdentityStore.isPaired
                            ? L("Paired — Touch ID unlock", "已配对 — Touch ID 解锁")
                            : L("Not paired", "未配对")
                    )
                    .foregroundStyle(KenosDeviceIdentityStore.isPaired ? .primary : .secondary)
                }
                .accessibilityIdentifier("kenos.settings.deviceLock")
            } header: {
                Text(L("Account", "账户"))
            } footer: {
                Text(
                    L(
                        "Account sync powers Today summary and Inbox. Spaces still work locally without signing in.",
                        "账户同步用于今日摘要与收件箱。未登录时各空间仍可本地使用。"
                    )
                )
                .font(KenosTypography.caption)
            }
            #endif

            Section {
                Text(
                    L(
                        "Your session stays on this device. Advanced tools hide engineering details.",
                        "登录状态保存在本机。工程细节已移至「高级」。"
                    )
                )
                .font(.caption)
            } header: {
                Text(L("Privacy & Data", "隐私与数据"))
            }

            #if os(iOS)
            Section {
                NavigationLink {
                    Form {
                        KenosAppleHealthSettingsSection(syncer: healthSyncer)
                    }
                    .navigationTitle(L("Apple Health", "Apple 健康"))
                    .navigationBarTitleDisplayMode(.inline)
                } label: {
                    LabeledContent {
                        Text(healthSyncer.authorized ? L("Connected", "已连接") : L("Set up", "去设置"))
                            .foregroundStyle(.secondary)
                    } label: {
                        Label(L("Apple Health", "Apple 健康"), systemImage: "heart.text.square")
                    }
                }
                .accessibilityIdentifier("kenos.settings.integrations.health")
            } header: {
                Text(L("Connections", "连接"))
            } footer: {
                Text(
                    L(
                        "Optional device connections. Connect only when you need Health readiness.",
                        "可选设备连接。需要健康准备度时再开启。"
                    )
                )
                .font(KenosTypography.caption)
            }
            #endif

            Section {
                LabeledContent(L("Shell origin", "壳层源")) {
                    Text(connectionLabel)
                        .foregroundStyle(.primary)
                }
                .accessibilityIdentifier("kenos.settings.connection")
                LabeledContent(L("Reachability", "可达性")) {
                    Text(connectionStatusLabel)
                        .foregroundStyle(.secondary)
                }
                .accessibilityIdentifier("kenos.settings.connection.status")
            } header: {
                Text(L("Shell network", "壳层网络"))
            } footer: {
                Text(
                    L(
                        "Shell origin only — not Kenos account login. Origin URL and LAN tools live under Advanced.",
                        "仅表示壳层源是否可用，不是 Kenos 账户登录。地址与局域网工具在「高级」中。"
                    )
                )
                .font(KenosTypography.caption)
            }

            Section {
                NavigationLink {
                    DailyBetaAdvancedDiagnosticsView(
                        model: model,
                        originDraft: $originDraft
                    )
                } label: {
                    Label(L("Advanced", "高级"), systemImage: "wrench.and.screwdriver")
                }
                .accessibilityIdentifier("kenos.settings.advanced")
            } header: {
                Text(L("Advanced", "高级"))
            } footer: {
                Text(
                    L(
                        "Origin URL, LAN fallback, logs — engineering tools.",
                        "源地址、局域网回退、日志等工程工具。"
                    )
                )
                .font(KenosTypography.caption)
            }

            #if os(macOS)
            if KenosSharedWebAuth.hasSharedTokens {
                Section {
                    Button(L("Sign out", "退出登录"), role: .destructive) {
                        Task { await model.logout() }
                    }
                    .accessibilityIdentifier("kenos.settings.logout")
                }
            }
            #else
            Section {
                Button(L("Sign out", "退出登录"), role: .destructive) {
                    Task { await model.logout() }
                }
                .accessibilityIdentifier("kenos.settings.logout")
            }
            #endif
        }
        .navigationTitle(L("Settings", "设置"))
        .accessibilityIdentifier("kenos.settings")
        #if os(iOS)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L("Done", "完成")) {
                    model.dismissSettings()
                    dismiss()
                }
                .accessibilityIdentifier("kenos.settings.done")
            }
        }
        .onAppear {
            refreshWebSsoStatus()
            originDraft = KenosDailyBetaConfig.kenOsOrigin.absoluteString
        }
        .onReceive(NotificationCenter.default.publisher(for: .kenosSharedWebAuthDidChange)) { _ in
            refreshWebSsoStatus()
        }
        .onReceive(NotificationCenter.default.publisher(for: .kenosWebAuthDidClear)) { _ in
            refreshWebSsoStatus()
        }
        #endif
    }

    #if os(iOS)
    private func refreshWebSsoStatus() {
        webSsoSignedIn = KenosSharedWebAuth.hasSharedTokens
    }
    #endif

    private var connectionLabel: String {
        if KenosDailyBetaConfig.useProductionOverride {
            return L("Production", "生产")
        }
        if KenosDailyBetaConfig.isLanDependentOrigin {
            return L("Local Mac", "本机 Mac")
        }
        return L("Configured", "已配置")
    }

    private var connectionStatusLabel: String {
        if KenosDailyBetaConfig.useProductionOverride {
            return L("Using production", "使用生产源")
        }
        // MAC-P0-04: never say "Connected" — that collided with account CTA on Today/Inbox.
        return L("Reachable", "可达")
    }
}

/// Beta engineering controls — origin URL, LAN fallback, logs.
private struct DailyBetaAdvancedDiagnosticsView: View {
    @ObservedObject var model: KenosAppModel
    @Binding var originDraft: String

    var body: some View {
        Form {
            Section("Kenos shell origin") {
                TextField(originFieldPrompt, text: $originDraft)
                    #if os(iOS)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    #endif
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("kenos.settings.origin")
                Button("Save origin") {
                    let trimmed = originDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard let url = URL(string: trimmed), url.host != nil else { return }
                    #if os(iOS)
                    guard url.host != "127.0.0.1", url.host != "localhost" else { return }
                    #endif
                    KenosWebRuntime.invalidateReachability()
                    KenosDailyBetaConfig.setUserOrigin(url)
                    originDraft = KenosDailyBetaConfig.kenOsOrigin.absoluteString
                }
                .accessibilityIdentifier("kenos.settings.origin.save")
                Text("Effective: \(KenosDailyBetaConfig.kenOsOrigin.absoluteString)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if KenosDailyBetaConfig.useProductionOverride {
                    Text("Using production (LAN offline or chosen). Configured LAN: \(KenosDailyBetaConfig.configuredLanOrigin.absoluteString)")
                        .font(KenosTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Retry LAN Daily Beta") {
                        KenosWebRuntime.invalidateReachability()
                        KenosDailyBetaConfig.retryLanOrigin()
                        originDraft = KenosDailyBetaConfig.configuredLanOrigin.absoluteString
                    }
                    .accessibilityIdentifier("kenos.settings.origin.retryLan")
                } else if KenosDailyBetaConfig.isLanDependentOrigin {
                    #if os(macOS)
                    Text("LAN / local Daily Beta — keep AIOS preview running, or fall back to production.")
                        .font(KenosTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    #else
                    Text("LAN preferred — Mac on same Wi‑Fi for Daily Beta writes. Cellular / Mac sleep uses hosted canary when fallback is on.")
                        .font(KenosTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    #endif
                }
                Toggle(
                    "Fallback to production when LAN is offline",
                    isOn: Binding(
                        get: { KenosDailyBetaConfig.preferProductionFallback },
                        set: { KenosDailyBetaConfig.preferProductionFallback = $0 }
                    )
                )
                .accessibilityIdentifier("kenos.settings.origin.productionFallback")
                Button("Use Production now") {
                    KenosWebRuntime.invalidateReachability()
                    Task {
                        let ok = await KenosDailyBetaConfig.activateProductionFallbackIfReachable(
                            reason: "settings_manual"
                        )
                        if !ok {
                            _ = KenosDailyBetaConfig.activateProductionFallback(
                                reason: "settings_manual_force",
                                force: true
                            )
                        }
                        originDraft = KenosDailyBetaConfig.kenOsOrigin.absoluteString
                    }
                }
                .accessibilityIdentifier("kenos.settings.origin.useProduction")
                Button("Use hosted canary origin") {
                    KenosWebRuntime.invalidateReachability()
                    KenosDailyBetaConfig.setUserOrigin(KenosDailyBetaConfig.productionKenOsOrigin)
                    originDraft = KenosDailyBetaConfig.kenOsOrigin.absoluteString
                }
                .accessibilityIdentifier("kenos.settings.origin.useCanary")
            }

            #if os(iOS)
            Section {
                Toggle(
                    "Register for APNs (Owner)",
                    isOn: Binding(
                        get: { KenosPushTokenStore.remoteRegistrationEnabled },
                        set: { enabled in
                            KenosPushTokenStore.remoteRegistrationEnabled = enabled
                            if enabled {
                                KenosPushFoundation.registerIfEnabled()
                            }
                        }
                    )
                )
                .accessibilityIdentifier("kenos.settings.push.remote")
                Text("Token: \(KenosPushTokenStore.statusSummary)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                if let err = KenosPushTokenStore.lastError, !err.isEmpty {
                    Text(err)
                        .font(.caption2)
                        .foregroundStyle(.orange)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } header: {
                Text("Push")
            } footer: {
                Text("Local Plan/Training alerts work without APNs. Remote registration needs App ID Push + provisioning. Smoke with scripts/kenos-daily-beta/apns-smoke.sh.")
                    .font(KenosTypography.caption)
            }

            Section {
                NavigationLink {
                    KenosLogViewer()
                } label: {
                    Label("Diagnostics & Logs", systemImage: "text.alignleft")
                }
                .accessibilityIdentifier("kenos.settings.diagnostics")
                Text("Session \(KenosLog.shared.sessionId.prefix(8))… · \(KenosLog.shared.stats().memoryCount) in memory")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } header: {
                Text("Logs")
            } footer: {
                Text("Developer tools — ring buffer + JSONL on device. Tokens are redacted.")
                    .font(KenosTypography.caption)
            }
            #endif
        }
        .navigationTitle("Advanced")
        .accessibilityIdentifier("kenos.settings.advanced.page")
    }

    private var originFieldPrompt: String {
        #if os(macOS)
        "http://127.0.0.1:5219"
        #else
        "https://www.kenos.space or http://Mac.local:5219"
        #endif
    }
}

#Preview {
    KenosRootView(model: KenosAppModel())
}

#if os(iOS)
import UIKit
#endif
