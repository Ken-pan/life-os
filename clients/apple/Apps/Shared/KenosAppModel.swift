import Combine
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif
#if canImport(AppKit)
import AppKit
#endif
#if canImport(WidgetKit)
import WidgetKit
#endif
import KenosActions
import KenosClient
import KenosDesign
import KenosHandoff
import KenosNotifications
import KenosStore

@MainActor
final class KenosAppModel: ObservableObject {
    /// System top-level IA: Spaces Orb + Today · Ask · Inbox capsule.
    /// Settings remains a Tab case for deep-link routing / macOS sidebar, but on iOS
    /// it presents as a modal sheet (off-dock) so Global Dock is not a second exit.
    enum Tab: String, CaseIterable, Identifiable {
        case today, assistant, spaces, inbox, settings
        var id: String { rawValue }
        var title: String {
            switch self {
            case .today: return "Today"
            case .assistant: return "Ask"
            case .spaces: return "Spaces"
            case .inbox: return "Inbox"
            case .settings: return "Settings"
            }
        }
    }

    /// macOS NavigationSplitView selection (Kenos tabs + Continuity domains).
    enum MacSidebarItem: Hashable, Identifiable {
        case today, assistant, inbox, settings
        case domain(String)

        var id: String {
            switch self {
            case .today: return "tab.today"
            case .assistant: return "tab.assistant"
            case .inbox: return "tab.inbox"
            case .settings: return "tab.settings"
            case .domain(let domainId): return "domain.\(domainId)"
            }
        }

        var title: String {
            switch self {
            case .today: return "Today"
            case .assistant: return "Ask"
            case .inbox: return "Inbox"
            case .settings: return "Settings"
            case .domain(let domainId):
                return KenosDomainRegistry.definition(for: domainId)?.label ?? domainId.capitalized
            }
        }

        var systemImage: String {
            switch self {
            case .today: return "sun.max"
            case .assistant: return "bubble.left.and.bubble.right"
            case .inbox: return "tray"
            case .settings: return "gearshape"
            case .domain(let domainId):
                return KenosDomainRegistry.definition(for: domainId)?.systemImage ?? "app"
            }
        }
    }

    /// Sidebar Space order — architecture §4.2 Command Center.
    static let macSidebarDomainOrder = [
        "work", "plan", "library", "health", "training", "money", "home", "music",
    ]

    @Published var selectedTab: Tab = .today
    #if os(macOS)
    @Published var macSidebarSelection: MacSidebarItem = .today
    /// Ask conversation immerses detail — collapse sidebar like iOS hides Global Dock.
    @Published var macSplitVisibility: NavigationSplitViewVisibility = .all
    #endif
    @Published var route: KenosDeepLink = .today
    /// Daily Beta WKWebView path per tab (supports Continue / payload-url deep resume).
    @Published var dailyBetaPathByTab: [Tab: String] = [
        .today: "/",
        .assistant: "/assistant",
        .spaces: "/spaces",
        .inbox: "/inbox",
        .settings: "/settings",
    ]
    /// Nested under Inbox (was MoreDestination).
    @Published var inboxDestination: InboxDestination?
    @Published var spacesDestination: SpacesDestination?
    @Published var captureText = ""
    @Published var lastCapture: CaptureDraft?
    @Published var watchCaptures: [CaptureDraft] = []
    @Published var notificationInbox: [KenosNotificationRecord] = []
    @Published var assistantMessages: [AssistantMessage] = [
        AssistantMessage(role: .assistant, text: "Ask Kenos anything. Writes still go through Approvals when needed."),
    ]
    @Published var streaming = false
    /// Capture sheet while Focus hides TabView/Sidebar.
    @Published var showCaptureSheet = false
    /// Approvals sheet — Mac Daily Beta Web Inbox cannot host navigationDestination (MAC-P0-05).
    @Published var showApprovalsSheet = false
    /// Temporary Space Switcher layer (not a 5th tab).
    @Published var showSpaceSwitcher = false
    /// Which chrome sheet is open — Continue (Recent) vs Switch Space vs Quick Switch.
    @Published var spaceChromeMode: SpaceChromeMode = .switchSpace
    #if os(iOS)
    /// Settings modal — overlays current Kenos/Domain surface; Global Dock hidden.
    @Published var showSettingsSheet = false
    /// Quiet confirm after system screenshot — not the full report sheet.
    @Published var showScreenshotBugPrompt = false
    /// Full report sheet (after user confirms, or explicit Settings entry).
    @Published var showBugReportSheet = false
    @Published var bugReportDraft: KenosBugReportDraft?
    /// Opt-out for “ask after screenshot” (default on).
    @Published var askAfterScreenshotEnabled: Bool = UserDefaults.standard.object(forKey: "kenos.bug.askAfterScreenshot") == nil
        ? true
        : UserDefaults.standard.bool(forKey: "kenos.bug.askAfterScreenshot")
    private var lastScreenshotPromptAt: Date?
    private var screenshotPromptAutoDismissTask: Task<Void, Never>?
    private var bugReportEnrichTask: Task<Void, Never>?
    #endif
    /// Daily Beta Continuity: Plan / Training load in-app WKWebView (not Safari).
    @Published var continuityURL: URL?
    /// Shell Navigation v2 — Kenos hall vs Domain dock vs Focus (Focus still uses root branch).
    @Published var shellMode: ShellMode = .kenos
    /// Tab to restore when Domain dock slot 1 (Kenos) is tapped.
    @Published var previousKenosTab: Tab = .today
    /// Active domain dock slot (0 = Kenos).
    @Published var domainDockSlot: Int = 1
    /// Space Shelf (Stage Manager–like) — Domain Mode only.
    @Published var showSpaceShelf = false
    /// Domain More sheet (Search / History / secondary — not on dock).
    @Published var showDomainMoreSheet = false
    /// Unsaved Domain draft — confirm before leaving Continuity.
    @Published var showDomainLeaveConfirm = false
    @Published var domainLeaveSummary = ""
    /// Web Navigation Manifest `liveState` (e.g. `editing`) — Domain dock hides for sheets.
    @Published var domainWebLiveState: String = ""
    /// Content canvas polarity — drives `preferredColorScheme` / status-bar foreground.
    /// Light Domain content must not keep a forced dark (white) status bar.
    @Published var chromeAppearance: KenosChromeAppearance = .dark
    /// Owner Device Lock — shell Face ID grant mirrored for SwiftUI gate.
    @Published var shellUnlocked = false
    @Published var shellUnlockError: String?
    @Published var shellUnlockBusy = false
    /// Coalesces concurrent unlock requests onto one Face ID / hydrate pass.
    private var shellUnlockTask: Task<Bool, Never>?
    /// Avoids double `bootstrap()` when unlock flips UI from gate → shell.
    private var didBootstrapAfterShellUnlock = false
    /// Gate auto Face ID runs once per lock episode (cancel → Unlock button; expiry resets).
    private var didAutoPromptShellUnlock = false
    /// Live Accessory compact strip (scroll-down minimize · Music / iOS 26 bottomAccessory).
    @Published var liveAccessoryMinimized = false
    private var pendingDomainLeaveAction: (() -> Void)?
    private var lastLiveAccessoryId: String?
    #if os(iOS)
    /// Kenos Mode may keep a hidden Domain WK warm — release after this TTL (non-Music).
    static let continuityInactiveTTL: TimeInterval = 90
    private var continuityInactiveTTLWorkItem: DispatchWorkItem?
    private var continuityBackgroundedAt: Date?
    #endif

    /// Persist last Domain Continuity for cold restore (NOT used by `kenos://shelf`).
    /// (`devicectl --terminate-existing` / memory kill). See SwiftUI state restoration patterns.
    private static let lastDomainURLKey = "kenos.lastDomainContinuityURL"

    enum ShellMode: Equatable {
        case kenos
        case domain
        case focus
    }

    enum SpaceChromeMode: String, Equatable {
        /// Recent resumes + recent Spaces only (Things-style Continue).
        case continueRecent
        /// Pinned + All Domains + System Today (Spaces directory).
        case switchSpace
        /// Searchable Quick Switch (Things Quick Find). Trigger glyph: switch, not magnifyingglass.
        case quickSwitch
    }
    let focusStore: KenosFocusStore
    let spaceSwitcherStore: KenosSpaceSwitcherStore

    /// Recent Space ids (user-scoped; persisted under cacheDirectory/spaceSwitcher).
    var recentSpaceIds: [String] { spaceSwitcherStore.recentSpaceIds }
    /// Pinned Space ids (user-scoped; cleared on logout / owner switch).
    var pinnedSpaceIds: [String] { spaceSwitcherStore.pinnedSpaceIds }

    enum InboxDestination: String, Hashable {
        case approvals, activity, capture, system, settings, library
    }

    enum SpacesDestination: String, Hashable {
        case work, training, money, home, plan, music
    }

    struct SpaceCatalogEntry: Identifiable, Hashable {
        let id: String
        let title: String
        let subtitle: String
        let kind: Kind
        enum Kind: Hashable {
            case hosted(SpacesDestination)
            case external(URL)
            case comingSoon
        }
    }

    /// Domain catalog from `KenosDomainRegistry` (SSOT twin of domainIntegration.core.js).
    static var spaceCatalog: [SpaceCatalogEntry] {
        KenosDomainRegistry.shelfDomainDefinitions.compactMap { def in
            // Paper has no in-repo app origin yet — keep shelf card via hosted fallback path.
            if def.id == "paper" {
                let url = KenosDomainRegistry.homeURL(for: "paper")
                    ?? KenosDailyBetaConfig.pathURL(def.homePath)
                return .init(id: def.id, title: def.label, subtitle: def.subtitle, kind: .external(url))
            }
            guard let url = KenosDomainRegistry.homeURL(for: def.id) else {
                if def.id == "work" {
                    return .init(id: def.id, title: def.label, subtitle: def.subtitle, kind: .hosted(.work))
                }
                return .init(id: def.id, title: def.label, subtitle: def.subtitle, kind: .comingSoon)
            }
            return .init(id: def.id, title: def.label, subtitle: def.subtitle, kind: .external(url))
        }
    }

    /// Compatibility alias for older call sites / handoff reviews.
    typealias MoreDestination = InboxDestination
    var moreDestination: InboxDestination? {
        get { inboxDestination }
        set { inboxDestination = newValue }
    }

    let repository: KenosReadRepository
    let queue: KenosOfflineActionQueue
    let sessionStore: KenosKeychainSessionStore
    let session: MockSessionProvider
    let handoff: KenosHandoffSession
    let notifications: KenosLocalNotificationCenter
    @Published var notificationPreferences: KenosNotificationPreferences = .default
    let approvalsActionsEnabled = false
    private let ownerId = UUID(uuidString: "20000000-0000-4000-8000-000000000001")!
    /// Stabilization health bag (no UI). Falls back process-local until App Group entitlement.
    private lazy var runtimeHealthStore = KenosAppGroupStore(ownerId: ownerId)
    private var cancellables = Set<AnyCancellable>()
    /// Coalesce high-frequency nav / LA / music → Widget publishes.
    private var widgetPublishTask: Task<Void, Never>?
    private var lastPublishedWidgetSnapshot: KenosWidgetSnapshot?
    #if os(iOS)
    private var cachedHealthWidgetGlance: (title: String, subtitle: String, badge: String?, at: Date)?
    private let healthWidgetCacheTTL: TimeInterval = 60
    #endif
    private static let widgetKindsToReload = [
        "KenosTodayWidget",
        "KenosSpacesWidget",
        "KenosPlanWidget",
        "KenosTrainingWidget",
        "KenosMusicWidget",
        "KenosHealthWidget",
        "KenosHomeWidget",
    ]

    struct AssistantMessage: Identifiable, Equatable {
        enum Role { case user, assistant, system }
        let id = UUID()
        let role: Role
        let text: String
    }

    init(
        client: any KenosAPIClient = MockKenosAPIClient(),
        cacheDirectory: URL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("kenos-phase4a")
    ) {
        let session = MockSessionProvider(owner: ownerId)
        self.session = session
        #if os(iOS)
        let secure: any KenosSecureStore = SecItemSecureStore()
        #else
        let secure: any KenosSecureStore = InMemorySecureStore()
        #endif
        self.sessionStore = KenosKeychainSessionStore(secureStore: secure)
        // Persist mock owner only when Keychain has no prior session (Daily Beta auth shell).
        if (try? sessionStore.loadToken()) == nil {
            try? sessionStore.save(token: "mock-session-token", ownerId: ownerId)
        }
        self.repository = KenosReadRepository(
            client: client,
            store: FileProjectionStore(directory: cacheDirectory.appendingPathComponent("projections")),
            session: session
        )
        self.queue = KenosOfflineActionQueue(
            store: FileActionQueueStore(directory: cacheDirectory.appendingPathComponent("queue"))
        )
        self.handoff = KenosHandoffSession(
            transport: FakeCompanionTransport(),
            ownerId: ownerId,
            persistDirectory: cacheDirectory.appendingPathComponent("handoff")
        )
        self.notifications = KenosLocalNotificationCenter.shared
        let focusStore = KenosFocusStore(
            ownerId: ownerId,
            directory: cacheDirectory.appendingPathComponent("focus")
        )
        self.focusStore = focusStore
        let spaceSwitcherStore = KenosSpaceSwitcherStore(
            ownerId: ownerId,
            directory: cacheDirectory.appendingPathComponent("spaceSwitcher")
        )
        self.spaceSwitcherStore = spaceSwitcherStore
        focusStore.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        spaceSwitcherStore.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        NotificationCenter.default.publisher(for: .kenosNotificationsDidChange)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in
                    await self?.refreshNotificationInbox()
                }
            }
            .store(in: &cancellables)
        #if os(macOS)
        NotificationCenter.default.publisher(for: .kenosMacNavManifestDidChange)
            .receive(on: RunLoop.main)
            .sink { [weak self] note in
                guard let self else { return }
                let live = (note.userInfo?["liveState"] as? String) ?? ""
                if self.domainWebLiveState != live {
                    self.domainWebLiveState = live
                }
                self.syncMacSplitVisibilityForAsk()
            }
            .store(in: &cancellables)
        #endif
        #if os(iOS)
        NotificationCenter.default.publisher(for: .kenosNowPlayingDidChange)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                self?.objectWillChange.send()
                self?.schedulePublishWidgetGlance()
            }
            .store(in: &cancellables)
        NotificationCenter.default.publisher(for: .kenosNavManifestDidChange)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                guard let self else { return }
                // Prefer static lastNavManifest (set before the notification posts).
                let manifest = KenosNativeCapabilityBridge.lastNavManifest
                let live = manifest.liveState
                if self.domainWebLiveState != live {
                    self.domainWebLiveState = live
                }
                self.syncDomainDockSlot(fromManifest: manifest)
                self.publishSystemDiscovery(from: manifest)
                self.schedulePublishWidgetGlance()
            }
            .store(in: &cancellables)
        NotificationCenter.default.publisher(for: .kenosChromeAppearanceDidChange)
            .receive(on: RunLoop.main)
            .sink { [weak self] note in
                guard let self else { return }
                let raw = (note.userInfo?["colorScheme"] as? String)
                    ?? (note.object as? String)
                guard let next = KenosChromeAppearance.parse(raw) else { return }
                let fromDomain = (note.userInfo?["fromDomain"] as? Bool) ?? false
                let fromShell = (note.userInfo?["fromShell"] as? Bool) ?? false
                // Warm Continuity WK must not flip Kenos status bar (and vice versa).
                if self.shellMode == .domain {
                    guard fromDomain || (!fromDomain && !fromShell) else { return }
                } else {
                    guard fromShell || (!fromDomain && !fromShell) else { return }
                }
                self.applyChromeAppearance(next, reason: "web")
            }
            .store(in: &cancellables)
        NotificationCenter.default.publisher(for: .kenosLiveActivityDidChange)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                self?.objectWillChange.send()
                self?.schedulePublishWidgetGlance()
            }
            .store(in: &cancellables)
        NotificationCenter.default.publisher(for: .kenosDailyBetaOriginDidChange)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                KenosWebRuntime.invalidateReachability()
                guard let self else { return }
                // If we flipped to production while a LAN Continuity URL is open, rewrite it.
                if KenosDailyBetaConfig.useProductionOverride,
                   let current = self.continuityURL,
                   KenosDailyBetaConfig.isPrivateLanHost(current.host),
                   let next = KenosDomainRegistry.rewriteToProduction(current)
                {
                    self.continuityURL = next
                    self.persistDomainContinuity(next)
                    self.syncDomainDockSlot(for: next)
                }
                self.objectWillChange.send()
            }
            .store(in: &cancellables)
        #endif
    }

    /// Cold-start Owner Device Lock: Face ID → optional device exchange → SSO cookie seed.
    /// Concurrent callers (gate `.task` + Unlock button) await the same in-flight work.
    func unlockShellAndHydrate(prompt: Bool = true) async -> Bool {
        if let existing = shellUnlockTask {
            return await existing.value
        }
        let task = Task { @MainActor in
            await self.performUnlockShellAndHydrate(prompt: prompt)
        }
        shellUnlockTask = task
        defer { shellUnlockTask = nil }
        return await task.value
    }

    /// Gate cold-start / remount: at most one automatic Face ID per lock episode.
    func autoPromptShellUnlockIfNeeded() async {
        guard !shellUnlocked else { return }
        guard !KenosUnlockGrantStore.isShellUnlocked() else {
            _ = await unlockShellAndHydrate(prompt: false)
            return
        }
        guard !didAutoPromptShellUnlock else { return }
        didAutoPromptShellUnlock = true
        _ = await unlockShellAndHydrate(prompt: true)
    }

    /// Foreground: restore UI from a live grant, or re-lock when the TTL expired.
    func reconcileShellUnlockOnForeground() {
        if KenosUnlockGrantStore.isShellUnlocked() {
            if !shellUnlocked {
                Task { @MainActor in
                    _ = await self.unlockShellAndHydrate(prompt: false)
                    await self.bootstrapIfNeeded()
                }
            }
            return
        }
        guard shellUnlocked else { return }
        KenosLog.notice("shell unlock expired — locking gate", category: .session)
        shellUnlocked = false
        shellUnlockError = nil
        didAutoPromptShellUnlock = false
    }

    @MainActor
    private func performUnlockShellAndHydrate(prompt: Bool) async -> Bool {
        shellUnlockBusy = true
        defer { shellUnlockBusy = false }
        if KenosUnlockGrantStore.isShellUnlocked() {
            shellUnlocked = true
            shellUnlockError = nil
        } else {
            let reason = KenosShellSettingsStore.current.resolvedLocale() == "zh"
                ? "解锁 Kenos"
                : "Unlock Kenos"
            let result = await KenosShellUnlock.ensure(prompt: prompt, reason: reason)
            shellUnlocked = result.ok
            shellUnlockError = result.ok ? nil : Self.localizedShellUnlockError(result.message)
            guard result.ok else { return false }
        }
        await KenosDeviceAuthClient.bootstrapSessionAfterUnlock()
        await KenosSharedWebAuth.seedSharedSessionCookies()
        return true
    }

    /// After Continuity reports SSO tokens — pair this shell once (owner only; server enforces).
    func pairDeviceIfNeeded(accessToken: String) async {
        guard shellUnlocked || KenosUnlockGrantStore.isShellUnlocked() else { return }
        guard !KenosDeviceIdentityStore.isPaired else { return }
        do {
            try await KenosDeviceAuthClient.pairWithAccessToken(accessToken)
        } catch {
            KenosLog.notice(
                "device pair skipped/failed",
                category: .session,
                metadata: ["error": String(describing: error)]
            )
        }
    }

    /// First shell bootstrap after unlock (idempotent for the process lifetime).
    func bootstrapIfNeeded() async {
        guard !didBootstrapAfterShellUnlock else { return }
        didBootstrapAfterShellUnlock = true
        await bootstrap()
    }

    private static func localizedShellUnlockError(_ message: String?) -> String {
        let zh = KenosShellSettingsStore.current.resolvedLocale() == "zh"
        let raw = message ?? "Unlock required"
        if raw == "Passcode not set" {
            return zh
                ? "设备未设置密码。请先在系统设置中开启设备密码，再回来解锁。"
                : "No device passcode is set. Turn on a passcode in Settings, then unlock again."
        }
        guard zh else { return raw }
        switch raw {
        case "Unlock required": return "需要解锁"
        case "Authentication cancelled": return "已取消认证"
        case "Authentication interrupted": return "认证被中断"
        case "Authentication failed": return "认证失败"
        case "Passcode fallback cancelled": return "已取消密码解锁"
        case "Biometrics unavailable": return "无法使用生物识别"
        default: return raw
        }
    }

    func bootstrap() async {
        KenosLog.bootstrap(source: "appModel")
        KenosLog.breadcrumb("model bootstrap begin", category: .lifecycle)
        await repository.bootstrap()
        if let sessionOwner = try? await session.ownerId() {
            spaceSwitcherStore.bindOwner(sessionOwner)
            KenosLog.debug("space switcher bound", category: .session, metadata: ["owner": "present"])
        }
        recordRuntimeHealth()
        notificationPreferences = await notifications.currentPreferences()
        notificationInbox = await notifications.pending()
        publishWidgetGlance(force: true)
        #if os(iOS)
        KenosPushFoundation.registerIfEnabled()
        KenosSpotlightFoundation.indexDomainCatalog()
        consumeWidgetPendingDeepLink()
        #endif
        try? await handoff.drainIncoming()
        watchCaptures = handoff.receivedCaptures
        if let link = handoff.lastReceivedDeepLink {
            KenosLog.info("handoff deep link on bootstrap", category: .deepLink, metadata: ["link": link])
            open(urlString: link)
        }
        KenosLog.breadcrumb("model bootstrap complete", category: .lifecycle, metadata: [
            "tab": selectedTab.rawValue,
            "shell": String(describing: shellMode),
        ])
    }

    /// Coalesce Widget publishes (nav manifests fire often during Continuity navigation).
    func schedulePublishWidgetGlance(delayNanoseconds: UInt64 = 400_000_000) {
        widgetPublishTask?.cancel()
        widgetPublishTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: delayNanoseconds)
            guard let self, !Task.isCancelled else { return }
            self.publishWidgetGlance(force: false)
        }
    }

    /// Publish Widget snapshot (Today + domain slots) via App Group when provisioned.
    /// - Parameter force: skip debounce cancel path and always attempt write (bootstrap).
    func publishWidgetGlance(force: Bool = false) {
        if force {
            widgetPublishTask?.cancel()
            widgetPublishTask = nil
        }
        let plan = notificationInbox.first(where: { $0.type == .planReminder })
        let approvalCount = notificationInbox.reduce(into: 0) { count, item in
            if item.type == .approvalRequested { count += 1 }
        }
        let inboxCount = notificationInbox.reduce(into: 0) { count, item in
            if item.type != .planReminder, item.type != .approvalRequested { count += 1 }
        }
        let today = TodayGlance(
            nextPlanTitle: plan?.safeTitle ?? "Kenos",
            nextPlanDue: nil,
            nextPlanDeepLink: plan?.deepLink ?? "kenos://today",
            pendingInboxCount: inboxCount > 0 ? inboxCount : nil,
            pendingApprovalCount: approvalCount > 0 ? approvalCount : nil,
            freshness: "local",
            offlineStatus: "online",
            state: "ready"
        )
        var domains = KenosWidgetGlanceBridge.placeholderDomains(availability: runtimeHealthStore.availability)
        enrichDomainWidgetSlots(&domains, planTitle: plan?.safeTitle, planLink: plan?.deepLink)
        let recent = spaceSwitcherStore.recentSpaceIds
            .filter { $0 != "kenos" && !$0.isEmpty }
        let snapshot = KenosWidgetSnapshot(
            today: today,
            domains: domains,
            recentDomainIds: recent
        )
        let wrote = KenosWidgetGlanceBridge.publishSnapshotIfChanged(
            snapshot,
            store: runtimeHealthStore,
            previous: lastPublishedWidgetSnapshot
        )
        guard wrote || force else {
            KenosLog.debug("widget snapshot unchanged — skip reload", category: .shell)
            return
        }
        lastPublishedWidgetSnapshot = snapshot
        #if canImport(WidgetKit)
        reloadWidgetTimelines()
        #endif
        KenosLog.debug("widget snapshot published", category: .shell, metadata: [
            "availability": runtimeHealthStore.availability.rawValue,
            "domains": String(domains.count),
            "recent": String(recent.count),
            "forced": force ? "1" : "0",
        ])
    }

    #if canImport(WidgetKit)
    private func reloadWidgetTimelines() {
        // Without App Group, the Widget process cannot read host state. Reloading
        // still launches KenosWidget — recent Simulator faults (EXC_BREAKPOINT /
        // XPC_EXIT_REASON_FAULT) correlate with Now Playing → music play.
        guard runtimeHealthStore.availability == .sharedSuite else { return }
        // Prefer per-kind reload over reloadAllTimelines (cheaper for system).
        for kind in Self.widgetKindsToReload {
            WidgetCenter.shared.reloadTimelines(ofKind: kind)
        }
    }
    #endif

    /// Open deep link queued by an interactive Home Screen widget button.
    func consumeWidgetPendingDeepLink() {
        guard let link = KenosWidgetGlanceBridge.consumePendingDeepLink(store: runtimeHealthStore),
              !link.isEmpty,
              URL(string: link) != nil
        else { return }
        KenosLog.info("widget pending deep link", category: .deepLink, metadata: ["link": link])
        open(urlString: link)
    }

    /// Fill Plan / Training / Music / Health / Home (and live) slots from native state.
    private func enrichDomainWidgetSlots(
        _ domains: inout [String: DomainWidgetGlance],
        planTitle: String?,
        planLink: String?
    ) {
        func upsert(
            _ id: String,
            title: String,
            subtitle: String,
            deepLink: String? = nil,
            progress: Double? = nil,
            badge: String? = nil
        ) {
            guard var slot = domains[id] else { return }
            let nextTitle = String(title.prefix(80))
            let nextSubtitle = String(subtitle.prefix(120))
            // Avoid dirtying Equatable content with fresh timestamps every publish.
            let contentChanged =
                slot.title != nextTitle
                || slot.subtitle != nextSubtitle
                || (deepLink.map { slot.deepLink != $0 } ?? false)
                || slot.progress != progress
                || slot.badge != badge
            slot.title = nextTitle
            slot.subtitle = nextSubtitle
            if let deepLink { slot.deepLink = deepLink }
            slot.progress = progress
            slot.badge = badge
            if contentChanged {
                slot.updatedAt = nil
            }
            domains[id] = slot
        }

        if let planTitle, !planTitle.isEmpty {
            upsert(
                "plan",
                title: planTitle,
                subtitle: "Next up",
                deepLink: planLink ?? "kenos://domain/plan"
            )
        }

        #if os(iOS)
        let manifest = KenosNativeCapabilityBridge.lastNavManifest
        let manifestId = KenosDomainRegistry.canonicalize(manifest.domainId) ?? manifest.domainId
        if !manifestId.isEmpty, domains[manifestId] != nil {
            let summary = manifest.summary.trimmingCharacters(in: .whitespacesAndNewlines)
            let live = manifest.liveState.trimmingCharacters(in: .whitespacesAndNewlines)
            let subtitle: String = {
                if !summary.isEmpty { return summary }
                if !live.isEmpty, live != "idle" { return live.capitalized }
                return domains[manifestId]?.subtitle ?? KenosDomainRegistry.definition(for: manifestId)?.subtitle ?? ""
            }()
            upsert(
                manifestId,
                title: KenosDomainRegistry.definition(for: manifestId)?.label ?? manifestId.capitalized,
                subtitle: subtitle,
                deepLink: "kenos://domain/\(manifestId)"
            )
        }

        if let snap = KenosLiveActivityFoundation.lastSnapshot {
            switch snap.kind {
            case .training:
                upsert(
                    "training",
                    title: snap.title.isEmpty ? "Training" : snap.title,
                    subtitle: snap.subtitle.isEmpty ? "In progress" : snap.subtitle,
                    deepLink: "kenos://training/session",
                    progress: snap.progress
                )
            case .focus:
                upsert(
                    "work",
                    title: snap.title.isEmpty ? "Deep Work" : snap.title,
                    subtitle: snap.subtitle.isEmpty ? "Focus" : snap.subtitle,
                    deepLink: "kenos://work",
                    progress: snap.progress
                )
            case .tidy:
                upsert(
                    "home",
                    title: snap.title.isEmpty ? "Tidy" : snap.title,
                    subtitle: snap.subtitle.isEmpty ? "Organize" : snap.subtitle,
                    deepLink: "kenos://domain/home?path=/tidy/go",
                    progress: snap.progress
                )
            }
        }

        if KenosNowPlayingBridge.hasLiveTrack,
           let title = KenosNowPlayingBridge.liveAccessoryTitle
        {
            upsert(
                "music",
                title: title,
                subtitle: KenosNowPlayingBridge.liveAccessorySubtitle ?? "Music",
                deepLink: "kenos://domain/music",
                badge: KenosNowPlayingBridge.isPlaying ? "▶" : nil
            )
        }

        if let health = resolvedHealthWidgetGlance() {
            upsert(
                "health",
                title: health.title,
                subtitle: health.subtitle,
                deepLink: "kenos://domain/health",
                badge: health.badge
            )
        }
        #endif

        if focusStore.isActiveSession || focusStore.isPaused || focusStore.showReturnBanner {
            let title = focusStore.focus?.title ?? "Focus"
            upsert(
                "health",
                title: title,
                subtitle: focusStore.isPaused ? "Paused" : "In focus",
                deepLink: "kenos://domain/health"
            )
        }
    }

    #if os(iOS)
    /// Cached readiness strip — avoids re-running JSCore on every coalesced publish.
    private func resolvedHealthWidgetGlance() -> (title: String, subtitle: String, badge: String?)? {
        if let cached = cachedHealthWidgetGlance,
           Date().timeIntervalSince(cached.at) < healthWidgetCacheTTL
        {
            return (cached.title, cached.subtitle, cached.badge)
        }
        guard let parsed = Self.healthWidgetGlance(from: KenosHealthSyncer.shared.readinessInjectionJSON())
        else { return cachedHealthWidgetGlance.map { ($0.title, $0.subtitle, $0.badge) } }
        cachedHealthWidgetGlance = (parsed.title, parsed.subtitle, parsed.badge, Date())
        return parsed
    }

    /// Privacy-safe Health widget lines — levels / codes only (no vitals).
    private static func healthWidgetGlance(from readinessJSON: String) -> (title: String, subtitle: String, badge: String?)? {
        guard readinessJSON != "null",
              let data = readinessJSON.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        let capacity = (obj["focusCapacity"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let training = obj["training"] as? [String: Any]
        let code = (training?["code"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !capacity.isEmpty || !code.isEmpty else { return nil }
        let title: String = {
            switch capacity.lowercased() {
            case "high": return "Ready"
            case "medium": return "Steady"
            case "low": return "Conserve"
            case "unknown", "": return "Health"
            default: return capacity.capitalized
            }
        }()
        let subtitle: String = {
            if !code.isEmpty, code != "unknown" { return "Train · \(code)" }
            if !capacity.isEmpty { return "Focus · \(capacity)" }
            return "Readiness"
        }()
        return (title, subtitle, capacity.isEmpty ? nil : String(capacity.prefix(1)).uppercased())
    }
    #endif

    /// Low-noise health for dogfood — never writes tokens / emails / bodies; never shown in ordinary UI.
    private func recordRuntimeHealth() {
        #if os(iOS)
        let build =
            Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
            ?? Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
            ?? "unknown"
        let origin = KenosDailyBetaConfig.isEnabled ? KenosDailyBetaConfig.kenOsOrigin : URL(string: "https://kenos.space")!
        let auth: String
        #if os(iOS)
        if KenosSharedWebAuth.hasSharedTokens {
            auth = "web_sso_present"
        } else if (try? sessionStore.loadToken()) != nil {
            auth = "native_shell_only"
        } else {
            auth = "session_absent"
        }
        #else
        if (try? sessionStore.loadToken()) != nil {
            auth = "session_present"
        } else {
            auth = "session_absent"
        }
        #endif
        let snap = KenosRuntimeHealthSnapshot(
            buildSha: build,
            originHost: KenosRuntimeHealth.host(from: origin),
            originReachable: nil,
            authState: auth,
            continueDescriptorCount: spaceSwitcherStore.recentSpaceIds.count,
            phase4: "EXIT_OPEN"
        )
        KenosRuntimeHealth.save(snap, store: runtimeHealthStore)
        #endif
    }

    var hideGlobalNavForFocus: Bool { focusStore.hidesGlobalNavigation }

    /// Ask active conversation — hide Kenos Global Dock (Home keeps it).
    /// Web publishes `liveState: conversation|compose|immersive` via nav manifest.
    var hideGlobalDockForAssistantConversation: Bool {
        #if os(iOS)
        guard shellMode == .kenos, selectedTab == .assistant else { return false }
        switch domainWebLiveState.lowercased() {
        case "conversation", "compose", "immersive":
            return true
        default:
            return false
        }
        #else
        return false
        #endif
    }

    func startTrainingFocus() {
        focusStore.startTrainingFocus()
    }

    func startDeepWorkFocus() {
        focusStore.startDeepWorkFocus()
    }

    func pauseFocus() { focusStore.pause() }
    func resumeFocus() { focusStore.resume() }
    func temporarilyLeaveFocus() { focusStore.temporarilyLeave() }
    func returnToFocus() { focusStore.returnToFocus() }
    func endFocus() { focusStore.end() }
    func dismissFocusSummary() { focusStore.dismissCompletedSummary() }

    func open(_ link: KenosDeepLink) {
        KenosLog.breadcrumb("open deep link", category: .deepLink, metadata: [
            "link": String(describing: link),
        ])
        route = link
        switch link {
        case .today:
            selectedTab = .today
        case .assistant:
            selectedTab = .assistant
        case .work, .workProject, .deliverable, .meeting, .decision, .planTask:
            selectedTab = .spaces
            presentSpacesDestination(.work)
        case .library:
            presentInboxDestination(.library)
        case .inbox, .inboxItem:
            selectedTab = .inbox
            inboxDestination = nil
        case .approvals, .approval:
            openApprovals()
        case .activity, .activityItem:
            presentInboxDestination(.activity)
        case .capture:
            openCapture()
        case .system, .unknown:
            presentInboxDestination(.system)
        }
    }

    private func presentInboxDestination(_ destination: InboxDestination) {
        inboxDestination = nil
        selectedTab = .inbox
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 350_000_000)
            inboxDestination = destination
        }
    }

    private func presentSpacesDestination(_ destination: SpacesDestination) {
        spacesDestination = nil
        selectedTab = .spaces
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 350_000_000)
            spacesDestination = destination
        }
    }

    func open(urlString: String) {
        let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        KenosLog.info("open urlString", category: .deepLink, metadata: [
            "scheme": URL(string: trimmed)?.scheme ?? "",
            "host": URL(string: trimmed)?.host ?? "",
            "path": URL(string: trimmed)?.path ?? "",
        ])
        if let url = URL(string: trimmed),
           let scheme = url.scheme?.lowercased(),
           scheme == "http" || scheme == "https"
        {
            handleHTTPOpen(url)
            return
        }
        // kenos://shell?path=/settings — in-app shell deep link (avoids Safari on openurl)
        if let url = URL(string: trimmed), url.scheme?.lowercased() == "kenos" {
            let host = (url.host ?? "").lowercased()
            if host == "shell" || host == "web" {
                let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
                let path = comps?.queryItems?.first(where: { $0.name == "path" })?.value ?? "/"
                navigateDailyBetaShell(path: path)
                return
            }
            if KenosDailyBetaConfig.isEnabled {
                switch host {
                case "shelf", "spaces":
                    // Spaces chip SSOT: open Space Shelf in current mode.
                    // Do NOT restore last Domain — that yanked Kenos Mode back into Continuity.
                    Task { @MainActor in
                        try? await Task.sleep(nanoseconds: 80_000_000)
                        openSpaceShelf()
                    }
                    return
                case "quick-switch", "quickswitch", "search":
                    // Retired Quick Switch chrome — Space switching is Shelf-only.
                    openSpaceShelf()
                    return
                case "continue":
                    openContinue()
                    return
                case "compose", "add":
                    requestDomainCompose()
                    return
                case "return", "kenos":
                    if shellMode == .domain {
                        returnToKenosFromDomain()
                    } else {
                        navigateDailyBetaShell(path: "/")
                    }
                    return
                case "today":
                    if shellMode == .domain { returnToKenosFromDomain() }
                    navigateDailyBetaShell(path: "/")
                    return
                case "assistant":
                    if shellMode == .domain { returnToKenosFromDomain() }
                    navigateDailyBetaShell(path: "/assistant")
                    return
                case "inbox":
                    if shellMode == .domain { returnToKenosFromDomain() }
                    navigateDailyBetaShell(path: "/inbox")
                    return
                case "more":
                    // Domain → More sheet (settings live there). Kenos → Settings tab.
                    if shellMode == .domain {
                        openDomainMore()
                    } else {
                        presentSettings()
                    }
                    return
                case "settings":
                    if shellMode == .domain {
                        openDomainMore()
                    } else {
                        presentSettings()
                    }
                    return
                case "domain", "space", "open":
                    // Shortcuts / App Intents: kenos://domain/plan[?path=/upcoming]
                    openDomainDeepLink(url)
                    return
                #if os(iOS)
                case "bug", "report-bug", "feedback":
                    Task { await beginBugReport() }
                    return
                #endif
                default:
                    // Also accept kenos://plan / kenos://training as Continuity shortcuts.
                    if KenosDomainRegistry.definition(for: host) != nil {
                        openDomainDeepLink(url, domainHint: host)
                        return
                    }
                    break
                }
            }
        }
        open(KenosDeepLinkRouter.parse(urlString))
    }

    /// `kenos://domain/plan?path=/upcoming` or `kenos://training` / `kenos://training/session`.
    private func openDomainDeepLink(_ url: URL, domainHint: String? = nil) {
        let host = (url.host ?? "").lowercased()
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let pathParts = url.path.split(separator: "/").map(String.init)
        let domainId: String? = {
            if let domainHint, KenosDomainRegistry.definition(for: domainHint) != nil {
                return KenosDomainRegistry.canonicalize(domainHint)
            }
            if host == "domain" || host == "space" || host == "open" {
                return KenosDomainRegistry.canonicalize(pathParts.first)
            }
            return KenosDomainRegistry.canonicalize(host)
        }()
        guard let domainId else { return }
        let pathOverride: String? = {
            if let q = comps?.queryItems?.first(where: { $0.name == "path" })?.value, !q.isEmpty {
                return q.hasPrefix("/") ? q : "/\(q)"
            }
            // Legacy / Continuity: kenos://plan/task/<id> → Planner ?kenosTask=
            let taskParts: [String] = {
                if host == "domain" || host == "space" || host == "open" {
                    return Array(pathParts.dropFirst())
                }
                return pathParts
            }()
            if (domainId == "plan" || domainId == "planner"),
               taskParts.count >= 2,
               taskParts[0] == "task"
            {
                let taskId = taskParts[1]
                let encoded = taskId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? taskId
                return "/?kenosTask=\(encoded)"
            }
            if host == "domain" || host == "space" || host == "open" {
                if pathParts.count >= 2 {
                    return "/" + pathParts.dropFirst().joined(separator: "/")
                }
                return nil
            }
            // kenos://training/session → /session
            if pathParts.count >= 1 {
                return "/" + pathParts.joined(separator: "/")
            }
            return nil
        }()
        guard let continuity = KenosDomainRegistry.continuityURL(for: domainId, path: pathOverride) else {
            KenosLog.warning("domain deep link missing continuity URL", category: .deepLink, metadata: [
                "domain": domainId,
            ])
            return
        }
        open(urlString: continuity.absoluteString)
    }

    #if os(iOS)
    /// Last redacted error class from runtime health (bug-report autofill only).
    var runtimeHealthLastErrorClass: String {
        KenosRuntimeHealth.load(store: runtimeHealthStore)?.lastErrorClass ?? ""
    }

    func setAskAfterScreenshotEnabled(_ enabled: Bool) {
        askAfterScreenshotEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: "kenos.bug.askAfterScreenshot")
    }

    /// Only block re-entrancy — chrome/sheets/Settings used to be blind spots for dogfood.
    /// Prompt hosts in an elevated UIWindow so it stays visible above modal sheets.
    private var blocksScreenshotBugPrompt: Bool {
        showBugReportSheet || showScreenshotBugPrompt
    }

    /// Native chrome open at capture time (triage metadata; never secrets).
    func screenshotChromeContext() -> String {
        var parts: [String] = []
        if showSettingsSheet || selectedTab == .settings { parts.append("settings") }
        if showSpaceShelf { parts.append("shelf") }
        if showSpaceSwitcher { parts.append("spaceSwitcher") }
        if showCaptureSheet { parts.append("capture") }
        if showApprovalsSheet { parts.append("approvals") }
        if showDomainMoreSheet { parts.append("domainMore") }
        if showDomainLeaveConfirm { parts.append("leaveConfirm") }
        if hideGlobalNavForFocus || focusStore.isPaused || focusStore.showCompletedSummary {
            parts.append("focus")
        }
        return parts.joined(separator: ",")
    }

    /// Bottom padding so the prompt sits above Kenos/Domain dock (or flush in Focus / sheets).
    var screenshotBugPromptBottomPadding: CGFloat {
        if hideGlobalNavForFocus || focusStore.isPaused || focusStore.showCompletedSummary {
            return 28
        }
        // Presented sheets cover the dock — sit near the home indicator.
        if showSettingsSheet || showSpaceSwitcher || showCaptureSheet || showDomainMoreSheet {
            return max(KenosGlass.dockBottomInset, 28)
        }
        // Icon-only dock (~56) + bottom inset + home-indicator clearance.
        return KenosGlass.dockBottomInset + 72
    }

    /// System screenshot path (best practice):
    /// 1) capture window snapshot immediately (notification has no image payload)
    /// 2) quiet confirm from native context — most screenshots are not bug reports
    /// 3) enrich web scrape in the background (timeout-bounded)
    /// 4) only then open the full report sheet on confirm
    func handleSystemScreenshot() async {
        guard askAfterScreenshotEnabled else { return }
        // Foreground gate lives in KenosRootView (`scenePhase == .active`).
        guard !blocksScreenshotBugPrompt else { return }
        if let last = lastScreenshotPromptAt, Date().timeIntervalSince(last) < 2.5 {
            return
        }
        // Capture BEFORE any prompt UI so the attachment is the host screen, not our dialog.
        let capture = await KenosBugReportCapture.captureKeyWindowJPEG(
            webViewFallback: KenosActiveWebRegistry.preferred(for: self)
        )
        // Re-check after await — sheet / prompt may have opened during capture.
        guard askAfterScreenshotEnabled, !blocksScreenshotBugPrompt else { return }
        let draft = makeBugReportDraftFast(
            jpeg: capture.jpeg,
            captureSource: "screenshot",
            captureMs: capture.elapsedMs
        )
        bugReportDraft = draft
        lastScreenshotPromptAt = Date()
        showScreenshotBugPrompt = true
        scheduleScreenshotPromptAutoDismiss(for: draft.id)
        enrichBugReportDraft(id: draft.id)
    }

    /// Explicit entry (Settings / deep link) — skip confirm, open review sheet.
    func beginBugReport(delayCapture: Bool = false) async {
        KenosLog.breadcrumb("bug report begin", category: .bugReport, metadata: [
            "delayCapture": delayCapture ? "1" : "0",
        ])
        cancelScreenshotPromptAutoDismiss()
        showScreenshotBugPrompt = false
        // Force-tear the elevated UIWindow before any sheet transition — sync via
        // onChange can lag one frame and leave alert+1 chrome eating taps.
        KenosScreenshotBugPromptPresenter.dismiss()
        // SwiftUI cannot stack two root sheets — dismiss Settings (or other chrome)
        // before presenting the bug-report sheet.
        let dismissedChrome = showSettingsSheet || showDomainMoreSheet || showCaptureSheet || showApprovalsSheet
        if showSettingsSheet { showSettingsSheet = false }
        if showDomainMoreSheet { showDomainMoreSheet = false }
        if showCaptureSheet { showCaptureSheet = false }
        if showApprovalsSheet { showApprovalsSheet = false }
        if delayCapture || dismissedChrome {
            // Settle long enough for the prior sheet dismiss animation — too short
            // and the bug-report sheet can present non-interactive / untappable.
            try? await Task.sleep(nanoseconds: 450_000_000)
        }
        let capture = await KenosBugReportCapture.captureKeyWindowJPEG(
            webViewFallback: KenosActiveWebRegistry.preferred(for: self)
        )
        bugReportDraft = await makeBugReportDraft(
            jpeg: capture.jpeg,
            captureSource: "manual",
            captureMs: capture.elapsedMs
        )
        KenosScreenshotBugPromptPresenter.dismiss()
        showBugReportSheet = true
    }

    func confirmScreenshotBugReport() {
        cancelScreenshotPromptAutoDismiss()
        guard bugReportDraft != nil else {
            showScreenshotBugPrompt = false
            KenosScreenshotBugPromptPresenter.dismiss()
            return
        }
        // Tear down the elevated prompt window first so it cannot cover the sheet.
        showScreenshotBugPrompt = false
        KenosScreenshotBugPromptPresenter.dismiss()
        // SwiftUI cannot stack Settings + bug-report sheets.
        let dismissedSettings = showSettingsSheet
        if showSettingsSheet { showSettingsSheet = false }
        if dismissedSettings {
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 420_000_000)
                guard bugReportDraft != nil else { return }
                KenosScreenshotBugPromptPresenter.dismiss()
                showBugReportSheet = true
            }
        } else {
            showBugReportSheet = true
        }
    }

    func dismissScreenshotBugPrompt() {
        cancelScreenshotPromptAutoDismiss()
        showScreenshotBugPrompt = false
        clearBugReportDraftIfIdle()
    }

    /// Drop draft + cancel enrich when neither prompt nor sheet is showing.
    func clearBugReportDraftIfIdle() {
        guard !showScreenshotBugPrompt, !showBugReportSheet else { return }
        cancelBugReportEnrich()
        bugReportDraft = nil
    }

    private func scheduleScreenshotPromptAutoDismiss(for draftId: UUID) {
        cancelScreenshotPromptAutoDismiss()
        screenshotPromptAutoDismissTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            guard !Task.isCancelled else { return }
            guard showScreenshotBugPrompt,
                  !showBugReportSheet,
                  bugReportDraft?.id == draftId
            else { return }
            dismissScreenshotBugPrompt()
        }
    }

    private func cancelScreenshotPromptAutoDismiss() {
        screenshotPromptAutoDismissTask?.cancel()
        screenshotPromptAutoDismissTask = nil
    }

    private func makeBugReportDraftFast(
        jpeg: Data?,
        captureSource: String,
        captureMs: Int
    ) -> KenosBugReportDraft {
        let web = KenosActiveWebRegistry.preferred(for: self)
        let diagnostics = KenosBugDiagnosticsFactory.makeNativeFast(
            model: self,
            webView: web,
            screenshotBytes: jpeg?.count ?? 0,
            captureSource: captureSource,
            captureMs: captureMs,
            webViewKind: KenosActiveWebRegistry.kind(for: self)
        )
        return KenosBugReportDraft(
            id: UUID(),
            title: KenosBugReportPrefill.title(from: diagnostics),
            notes: "",
            severity: KenosBugReportPrefill.severity(from: diagnostics),
            screenshotJPEG: jpeg,
            diagnostics: diagnostics,
            capturedAt: Date()
        )
    }

    private func makeBugReportDraft(
        jpeg: Data?,
        captureSource: String,
        captureMs: Int
    ) async -> KenosBugReportDraft {
        let web = KenosActiveWebRegistry.preferred(for: self)
        let diagnostics = await KenosBugDiagnosticsFactory.make(
            model: self,
            webView: web,
            screenshotBytes: jpeg?.count ?? 0,
            captureSource: captureSource,
            captureMs: captureMs,
            webViewKind: KenosActiveWebRegistry.kind(for: self),
            scrape: true
        )
        return KenosBugReportDraft(
            id: UUID(),
            title: KenosBugReportPrefill.title(from: diagnostics),
            notes: "",
            severity: KenosBugReportPrefill.severity(from: diagnostics),
            screenshotJPEG: jpeg,
            diagnostics: diagnostics,
            capturedAt: Date()
        )
    }

    /// Background scrape after the quiet prompt is already visible.
    private func enrichBugReportDraft(id: UUID) {
        cancelBugReportEnrich()
        bugReportEnrichTask = Task { @MainActor in
            let web = KenosActiveWebRegistry.preferred(for: self)
            let t0 = CFAbsoluteTimeGetCurrent()
            let snap = await KenosBugDiagnosticsFactory.scrapeWeb(web)
            let scrapeMs = Int(((CFAbsoluteTimeGetCurrent() - t0) * 1000.0).rounded())
            guard !Task.isCancelled else { return }
            guard var draft = bugReportDraft, draft.id == id else { return }
            let previousTitle = draft.title
            let generatedBefore = KenosBugReportPrefill.title(from: draft.diagnostics)
            let titleStillAuto = previousTitle == generatedBefore
            KenosBugDiagnosticsFactory.apply(
                snap,
                scrapeMs: scrapeMs,
                to: &draft.diagnostics,
                model: self,
                webView: web
            )
            if titleStillAuto {
                draft.title = KenosBugReportPrefill.title(from: draft.diagnostics)
            }
            // Once the full sheet is open, leave severity to the user's picker.
            if !showBugReportSheet {
                draft.severity = KenosBugReportPrefill.severity(from: draft.diagnostics)
            }
            bugReportDraft = draft
        }
    }

    private func cancelBugReportEnrich() {
        bugReportEnrichTask?.cancel()
        bugReportEnrichTask = nil
    }

    func refreshBugReportScreenshot() async {
        guard var draft = bugReportDraft else {
            await beginBugReport()
            return
        }
        let previousTitle = draft.title
        let capture = await KenosBugReportCapture.captureKeyWindowJPEG(
            webViewFallback: KenosActiveWebRegistry.preferred(for: self)
        )
        draft.screenshotJPEG = capture.jpeg
        let web = KenosActiveWebRegistry.preferred(for: self)
        let diagnostics = await KenosBugDiagnosticsFactory.make(
            model: self,
            webView: web,
            screenshotBytes: capture.jpeg?.count ?? 0,
            captureSource: draft.diagnostics.captureSource,
            captureMs: capture.elapsedMs,
            webViewKind: KenosActiveWebRegistry.kind(for: self),
            scrape: true
        )
        draft.diagnostics = diagnostics
        draft.capturedAt = Date()
        // Keep user notes; refresh auto title only when still in generated form.
        if previousTitle.hasPrefix("[") {
            draft.title = KenosBugReportPrefill.title(from: diagnostics)
        }
        bugReportDraft = draft
    }
    #endif

    /// Load a Daily Beta WKWebView path inside the matching native tab.
    func navigateDailyBetaShell(path: String) {
        KenosLog.breadcrumb("shell navigate", category: .shell, metadata: ["path": path])
        let normalized = path.hasPrefix("/") ? path : "/\(path)"
        let pathOnly = normalized.split(separator: "?", maxSplits: 1).first.map(String.init) ?? normalized
        #if os(iOS)
        if pathOnly.hasPrefix("/settings") {
            presentSettings()
            return
        }
        // Deep links must win over open chrome — otherwise the tab switches invisibly
        // behind the sheet and the link looks like a no-op.
        if showSettingsSheet { showSettingsSheet = false }
        if showDomainMoreSheet { showDomainMoreSheet = false }
        #endif
        let tab = tabForShellPath(pathOnly)
        let previous = dailyBetaPathByTab[tab]
        if previous != normalized {
            dailyBetaPathByTab[tab] = normalized
        }
        if selectedTab != tab {
            selectedTab = tab
        }
    }

    private func handleHTTPOpen(_ url: URL) {
        let path = url.path.isEmpty ? "/" : url.path
        // Any embedded domain Continuity origin → Domain Mode (not Kenos shell tabs).
        if KenosDomainRegistry.isEmbeddedWebContinuityURL(url) {
            openExternalURL(url)
            return
        }
        // Same-origin shell deep link → load exact path in the matching tab WebView
        // (not just switch tabs). Required for /settings login CTA and Continue targets.
        if isDailyBetaShellURL(url) {
            #if os(iOS)
            if path.hasPrefix("/settings") {
                presentSettings()
                return
            }
            #endif
            let tab = tabForShellPath(path)
            dailyBetaPathByTab[tab] = relativeShellPath(url)
            selectedTab = tab
            return
        }
        switch path {
        case "/", "/today":
            selectedTab = .today
        case "/assistant", "/chat":
            selectedTab = .assistant
        case "/spaces":
            selectedTab = .spaces
        case "/inbox":
            selectedTab = .inbox
        case "/settings":
            #if os(iOS)
            presentSettings()
            #else
            selectedTab = .settings
            #endif
        default:
            if path.hasPrefix("/spaces/") {
                selectedTab = .spaces
            } else if path.hasPrefix("/settings") {
                #if os(iOS)
                presentSettings()
                #else
                selectedTab = .settings
                #endif
            } else {
                selectedTab = .today
            }
        }
    }

    func dailyBetaPath(for tab: Tab) -> String {
        dailyBetaPathByTab[tab] ?? {
            switch tab {
            case .today: return "/"
            case .assistant: return "/assistant"
            case .spaces: return "/spaces"
            case .inbox: return "/inbox"
            case .settings: return "/settings"
            }
        }()
    }

    private func isDailyBetaShellURL(_ url: URL) -> Bool {
        let origin = KenosDailyBetaConfig.kenOsOrigin
        let host = url.host ?? ""
        let originHost = origin.host ?? ""
        if !host.isEmpty, host == originHost {
            let urlPort = url.port ?? ((url.scheme == "https") ? 443 : 80)
            let originPort = origin.port ?? ((origin.scheme == "https") ? 443 : 80)
            return urlPort == originPort
        }
        return url.port == 5219
    }

    private func relativeShellPath(_ url: URL) -> String {
        var path = url.path.isEmpty ? "/" : url.path
        if let query = url.query, !query.isEmpty {
            path += "?\(query)"
        }
        if let fragment = url.fragment, !fragment.isEmpty {
            path += "#\(fragment)"
        }
        return path
    }

    private func tabForShellPath(_ path: String) -> Tab {
        if path.hasPrefix("/assistant") || path.hasPrefix("/chat") { return .assistant }
        if path.hasPrefix("/spaces") { return .spaces }
        if path.hasPrefix("/inbox") { return .inbox }
        if path.hasPrefix("/settings") { return .settings }
        return .today
    }

    func openNotification(_ record: KenosNotificationRecord) {
        if KenosNotificationSafety.isExpired(record, now: KenosNotificationISO.nowString()) {
            return
        }
        open(urlString: record.deepLink)
    }

    func refreshNotificationInbox() async {
        notificationPreferences = await notifications.currentPreferences()
        notificationInbox = await notifications.pending()
        publishWidgetGlance(force: false)
    }

    func updateNotificationPreferences(_ prefs: KenosNotificationPreferences) async {
        await notifications.updatePreferences(prefs)
        notificationPreferences = prefs
    }

    func setNotificationCategoryEnabled(_ type: KenosNotificationType, enabled: Bool) async {
        var prefs = await notifications.currentPreferences()
        prefs.categoryEnabled[type] = enabled
        await updateNotificationPreferences(prefs)
    }

    func setNotificationQuietHours(start: Int?, end: Int?) async {
        var prefs = await notifications.currentPreferences()
        prefs.quietHoursStart = start
        prefs.quietHoursEnd = end
        await updateNotificationPreferences(prefs)
    }

    /// Snooze a plan reminder by 15 minutes (notification action).
    func snoozePlanReminder(deduplicationKey: String, minutes: Int = 15) async {
        let pending = await notifications.pending()
        guard let existing = pending.first(where: { $0.deduplicationKey == deduplicationKey }) else {
            return
        }
        let fireAt = Date().addingTimeInterval(TimeInterval(minutes * 60))
        var next = existing
        next.fireAt = KenosNotificationISO.string(from: fireAt)
        try? await notifications.replace(
            deduplicationKey: deduplicationKey,
            with: next,
            at: fireAt
        )
        await refreshNotificationInbox()
    }

    func openCapture() {
        #if os(macOS)
        // Mac Daily Beta Inbox is a WK shell — native navigationDestination never mounts (MAC-P0-05).
        showCaptureSheet = true
        return
        #else
        if hideGlobalNavForFocus || focusStore.isPaused || focusStore.showCompletedSummary {
            showCaptureSheet = true
            return
        }
        presentInboxDestination(.capture)
        #endif
    }

    /// Approvals surface — sheet on Mac; Inbox push on iOS.
    func openApprovals() {
        #if os(macOS)
        showApprovalsSheet = true
        #else
        presentInboxDestination(.approvals)
        #endif
    }

    /// Continue = Recent resumes only (not the full domain directory).
    func openContinue() {
        spaceChromeMode = .continueRecent
        showSpaceSwitcher = true
    }

    /// Switch Space = Pinned / All Domains directory.
    func openSpaceSwitcher() {
        spaceChromeMode = .switchSpace
        showSpaceSwitcher = true
    }

    /// Legacy Quick Switch entry — redirects to Space Shelf (SSOT for switching).
    func openQuickSwitch() {
        openSpaceShelf()
    }

    func dismissSpaceChrome() {
        showSpaceSwitcher = false
    }

    /// Extra web bottom pad for Live Accessory above the dock (0 when absent / shelf open).
    var liveAccessoryWebBottomExtraPx: Int {
        #if os(iOS)
        guard liveAccessory != nil, !showSpaceShelf else { return 0 }
        return liveAccessoryMinimized
            ? KenosWebChrome.liveAccessoryMinimizedPadPx
            : KenosWebChrome.liveAccessoryExpandedPadPx
        #else
        return 0
        #endif
    }

    /// Scroll-down collapses Live Accessory to Music-style inline chip; scroll-up expands.
    func setLiveAccessoryMinimized(_ minimized: Bool) {
        guard liveAccessoryMinimized != minimized else { return }
        liveAccessoryMinimized = minimized
    }

    /// Reset minimize when the owning activity changes so new work starts expanded.
    func syncLiveAccessoryMinimizeState() {
        let id = liveAccessory?.id
        if id != lastLiveAccessoryId {
            lastLiveAccessoryId = id
            liveAccessoryMinimized = false
        }
    }

    /// Live accessory above Tab Bar — unified strip for running work
    /// (Capture draft · Focus return · LiveActivity · Music · Training resume).
    var liveAccessory: LiveAccessory? {
        // 1) Capture — unfinished draft while sheet is closed (Inbox MiniPlayer pattern).
        let draft = captureText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !draft.isEmpty, !showCaptureSheet {
            let preview = draft.count > 42 ? String(draft.prefix(40)) + "…" : draft
            return LiveAccessory(kind: .capture, title: "Capture", subtitle: preview)
        }

        // 2) Focus — temporarily left session (replaces top FocusReturnBanner chrome).
        if focusStore.showReturnBanner {
            return LiveAccessory(
                kind: .focus,
                title: focusStore.focus?.title ?? "Focus",
                subtitle: "Paused — tap to return"
            )
        }

        #if os(iOS)
        let currentDomain = KenosDomainRegistry.domainId(fromContinuity: continuityURL)

        // 3) Live Activity cache (Training / Focus / tidy) when away from that domain.
        if let snap = KenosLiveActivityFoundation.lastSnapshot,
           KenosLiveActivityFoundation.activeKinds.contains(snap.kind)
        {
            let homeDomain: String = {
                switch snap.kind {
                case .training: return "training"
                case .focus: return "health"
                case .tidy: return "home"
                }
            }()
            let inHome =
                shellMode == .domain
                && (currentDomain == homeDomain
                    || (snap.kind == .focus && Self.isImmersiveContinuityPath(continuityURL?.path ?? "")))
            if !inHome {
                return LiveAccessory(
                    kind: .liveActivity(snap.kind),
                    title: snap.title,
                    subtitle: snap.subtitle.isEmpty ? snap.kind.rawValue.capitalized : snap.subtitle
                )
            }
        }

        // 4) Music Now Playing when away from Music domain.
        let inMusicDomain = shellMode == .domain && currentDomain == "music"
        if !inMusicDomain,
           KenosNowPlayingBridge.hasLiveTrack,
           let title = KenosNowPlayingBridge.liveAccessoryTitle
        {
            return LiveAccessory(
                kind: .musicNowPlaying,
                title: title,
                subtitle: KenosNowPlayingBridge.liveAccessorySubtitle ?? "Music"
            )
        }

        // 5) NavManifest live Training session (active / timer) when away from Training.
        let manifest = KenosNativeCapabilityBridge.lastNavManifest
        let live = manifest.liveState.lowercased()
        if manifest.domainId == "training" || manifest.domainId == "fitness",
           live == "active" || live.hasPrefix("timer") || live == "summary",
           !(shellMode == .domain && currentDomain == "training")
        {
            return LiveAccessory(
                kind: .continuity(listKey: "training"),
                title: manifest.summary.isEmpty ? "Training" : manifest.summary,
                subtitle: live == "summary" ? "Session complete" : "In progress"
            )
        }
        #endif

        // 6) Resume heuristic fallback (Training mid-set / Plan focus timer).
        let resumes = spaceSwitcherStore.resumeByListKey
            .map { (key: $0.key, descriptor: $0.value) }
            .filter { !$0.descriptor.isExpired }
            .sorted { $0.descriptor.updatedAt > $1.descriptor.updatedAt }
        if let live = resumes.first(where: { item in
            let space = "\(item.key) \(item.descriptor.spaceId)".lowercased()
            let sub = (item.descriptor.displaySubtitle ?? "").lowercased()
            let isTraining = space.contains("training") || space.contains("fitness")
            let isPlan = space.contains("plan")
            let looksLive = sub.contains("set ") || sub.contains("mid") || sub.contains("focus") || sub.contains("timer")
            return isTraining || (isPlan && looksLive)
        }) {
            return LiveAccessory(
                kind: .continuity(listKey: live.key),
                title: live.descriptor.displayTitle,
                subtitle: live.descriptor.displaySubtitle ?? live.descriptor.spaceId
            )
        }
        return nil
    }

    /// Space ids currently "running" for Shelf Active section.
    var activeShelfSpaceIds: [String] {
        var ids: [String] = []
        var seen = Set<String>()
        func push(_ id: String) {
            guard !id.isEmpty, !seen.contains(id) else { return }
            seen.insert(id)
            ids.append(id)
        }
        if focusStore.showReturnBanner || focusStore.isActiveSession || focusStore.isPaused {
            push("health")
        }
        #if os(iOS)
        for kind in KenosLiveActivityFoundation.activeKinds {
            switch kind {
            case .training: push("training")
            case .focus: push("health")
            case .tidy: push("home")
            }
        }
        if KenosNowPlayingBridge.hasLiveTrack { push("music") }
        let manifest = KenosNativeCapabilityBridge.lastNavManifest
        let live = manifest.liveState.lowercased()
        if (manifest.domainId == "training" || manifest.domainId == "fitness"),
           live == "active" || live.hasPrefix("timer") || live == "summary"
        {
            push("training")
        }
        #endif
        let draft = captureText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !draft.isEmpty { push("kenos") }
        return ids
    }

    private static func isImmersiveContinuityPath(_ raw: String) -> Bool {
        let path = raw.lowercased()
        if path == "/session" || path == "/focus" { return true }
        if path == "/tidy/go" || path.hasSuffix("/tidy/go") { return true }
        if path.hasSuffix("/focus") || path.hasSuffix("/summary") { return true }
        return false
    }

    func activateLiveAccessory(_ accessory: LiveAccessory) {
        switch accessory.kind {
        case .focus:
            returnToFocus()
        case .capture:
            openCapture()
        case .continuity(let listKey):
            continueSpace(listKey: listKey)
        case .liveActivity(let kind):
            #if os(iOS)
            let domainId: String = {
                switch kind {
                case .training: return "training"
                case .focus: return "health"
                case .tidy: return "home"
                }
            }()
            if let url = KenosDomainRegistry.homeURL(for: domainId) {
                enterDomainMode(url: url)
            }
            #endif
        case .musicNowPlaying:
            #if os(iOS)
            // Prefer the warm Continuity URL (or last music path) over hard home reset.
            let url: URL? = {
                if KenosDomainRegistry.domainId(fromContinuity: continuityURL) == "music" {
                    return continuityURL
                }
                if let raw = UserDefaults.standard.string(forKey: Self.lastDomainURLKey),
                   let last = URL(string: raw),
                   KenosDomainRegistry.domainId(fromContinuity: last) == "music"
                {
                    return last
                }
                return KenosDomainRegistry.homeURL(for: "music")
            }()
            if let url {
                enterDomainMode(url: url)
            }
            #endif
        }
    }

    struct LiveAccessory: Equatable, Identifiable {
        enum Kind: Equatable {
            case focus
            case capture
            case continuity(listKey: String)
            case musicNowPlaying
            case liveActivity(KenosLiveActivityFoundation.Kind)
        }
        var id: String {
            switch kind {
            case .focus: return "focus"
            case .capture: return "capture"
            case .continuity(let k): return "continuity:\(k)"
            case .musicNowPlaying: return "musicNowPlaying"
            case .liveActivity(let k): return "liveActivity:\(k.rawValue)"
            }
        }
        var kind: Kind
        var title: String
        var subtitle: String
    }

    func touchRecentSpace(id: String) {
        spaceSwitcherStore.touchRecentSpace(id: id)
    }

    func togglePinnedSpace(id: String) {
        spaceSwitcherStore.togglePinnedSpace(id: id)
    }

    func openSpace(_ entry: SpaceCatalogEntry) {
        KenosLog.breadcrumb("open space", category: .navigation, metadata: [
            "space": entry.id,
            "title": entry.title,
        ])
        #if os(iOS)
        KenosPerfStateReporter.openSpace(entry.id)
        #endif
        touchRecentSpace(id: entry.id)
        showSpaceSwitcher = false
        switch entry.kind {
        case .hosted(let destination):
            presentSpacesDestination(destination)
        case .external(let url):
            openExternalContinuity(spaceId: entry.id, homeURL: url)
        case .comingSoon:
            selectedTab = .spaces
        }
    }

    /// Continue / domain launch — single open, resume route when present & not expired.
    func continueSpace(listKey: String) {
        showSpaceSwitcher = false
        let domainId = KenosDomainRegistry.canonicalize(listKey) ?? listKey
        let home: URL = {
            if let registryHome = KenosDomainRegistry.homeURL(for: domainId) {
                return registryHome
            }
            if let entry = Self.spaceCatalog.first(where: { $0.id == domainId || $0.id == listKey || "hosted:\($0.id)" == listKey }) {
                if case .external(let url) = entry.kind { return url }
            }
            return KenosDailyBetaConfig.kenOsOrigin
        }()
        let url = spaceSwitcherStore.resolveOpenURL(listKey: listKey, homeURL: home)
        spaceSwitcherStore.touchRecentSpace(id: listKey)
        openExternalURL(url)
    }

    func openExternalContinuity(spaceId: String, homeURL: URL) {
        let hosted = "hosted:\(spaceId)"
        let listKey = spaceSwitcherStore.resumeByListKey[hosted] != nil ? hosted : spaceId
        let url = spaceSwitcherStore.resolveOpenURL(listKey: listKey, homeURL: homeURL)
        openExternalURL(url)
    }

    /// Dismiss Domain Mode and return to Kenos tabs (previous context).
    func dismissContinuity() {
        KenosLog.breadcrumb("dismiss continuity", category: .shell, metadata: [
            "restoreTab": previousKenosTab.rawValue,
        ])
        // Flip mode only — keep continuityURL so Domain WKWebView stays mounted
        // under opacity 0 (RootView dual-layer). Clearing it remounts Continuity
        // on next Space open and flashes white/ink between shells.
        shellMode = .kenos
        showSpaceShelf = false
        domainDockSlot = 0
        domainWebLiveState = ""
        applyChromeAppearance(.dark, reason: "returnKenos")
        selectedTab = previousKenosTab
        #if os(iOS)
        KenosPerfStateReporter.returnToKenos()
        KenosSystemDiscovery.resign()
        scheduleInactiveContinuityTTLRelease()
        #endif
        #if os(macOS)
        switch previousKenosTab {
        case .today: macSidebarSelection = .today
        case .assistant: macSidebarSelection = .assistant
        case .inbox: macSidebarSelection = .inbox
        case .settings: macSidebarSelection = .settings
        case .spaces: macSidebarSelection = .today
        }
        #endif
    }

    #if os(iOS)
    /// Pure predicate for Continuity TTL / Jetsam release (unit-tested).
    static func shouldReleaseInactiveContinuity(
        shellIsDomain: Bool,
        hasContinuity: Bool,
        isMusicWithNowPlaying: Bool,
        hiddenDuration: TimeInterval?,
        ttl: TimeInterval = continuityInactiveTTL
    ) -> Bool {
        guard !shellIsDomain, hasContinuity, !isMusicWithNowPlaying else { return false }
        guard let hiddenDuration, hiddenDuration >= ttl else { return false }
        return true
    }

    private func scheduleInactiveContinuityTTLRelease() {
        continuityInactiveTTLWorkItem?.cancel()
        continuityBackgroundedAt = Date()
        let work = DispatchWorkItem { [weak self] in
            self?.releaseInactiveContinuityIfNeeded(reason: "ttl")
        }
        continuityInactiveTTLWorkItem = work
        DispatchQueue.main.asyncAfter(
            deadline: .now() + Self.continuityInactiveTTL,
            execute: work
        )
    }

    private func cancelInactiveContinuityTTLRelease() {
        continuityInactiveTTLWorkItem?.cancel()
        continuityInactiveTTLWorkItem = nil
        continuityBackgroundedAt = nil
    }
    #endif

    /// Memory pressure / TTL: drop the warm Domain surface while Kenos Mode is foreground.
    /// Modern hybrid apps prefer one live WKWebView under Jetsam pressure.
    @MainActor
    func releaseInactiveContinuityIfNeeded(reason: String = "memory") {
        #if os(iOS)
        guard shellMode != .domain, continuityURL != nil else { return }
        let isMusicPlaying =
            KenosNowPlayingBridge.hasLiveTrack
            && KenosDomainRegistry.domainId(fromContinuity: continuityURL) == "music"
        if reason == "ttl" {
            let hidden = continuityBackgroundedAt.map { Date().timeIntervalSince($0) }
            guard Self.shouldReleaseInactiveContinuity(
                shellIsDomain: false,
                hasContinuity: true,
                isMusicWithNowPlaying: isMusicPlaying,
                hiddenDuration: hidden ?? Self.continuityInactiveTTL
            ) else {
                if isMusicPlaying {
                    KenosLog.info("ttl — keep Music Continuity (now playing)", category: .shell, metadata: [
                        "host": continuityURL?.host ?? "",
                        "breadcrumb": "1",
                    ])
                }
                return
            }
        } else if isMusicPlaying {
            // Music Continuity owns the HTML5 <audio> element — releasing it under Jetsam
            // would tear down Now Playing / lock-screen control.
            KenosLog.info("memory pressure — keep Music Continuity (now playing)", category: .shell, metadata: [
                "host": continuityURL?.host ?? "",
                "breadcrumb": "1",
            ])
            return
        }
        KenosLog.info("releasing warm Domain surface", category: .shell, metadata: [
            "host": continuityURL?.host ?? "",
            "reason": reason,
            "breadcrumb": "1",
        ])
        cancelInactiveContinuityTTLRelease()
        continuityURL = nil
        #endif
    }

    func returnToKenosFromDomain() {
        requestDomainLeave {
            self.dismissContinuity()
        }
    }

    func openSpaceShelf() {
        #if os(macOS)
        // No Space Shelf chrome on Mac — Switch Space sheet is the visible entry.
        openSpaceSwitcher()
        #else
        showSpaceShelf = true
        showSpaceSwitcher = false
        warmDomainOriginsIfNeeded()
        #endif
    }

    /// Pending Approvals count for Menu Bar / status chrome.
    var pendingApprovalCount: Int {
        notificationInbox.reduce(into: 0) { count, item in
            if item.type == .approvalRequested { count += 1 }
        }
    }

    #if os(macOS)
    /// Select a Mac sidebar row (Kenos tab or Continuity domain).
    func selectMacSidebar(_ item: MacSidebarItem) {
        // MAC-P1-02: Settings is a system Settings window — do not steal sidebar selection.
        if case .settings = item {
            NotificationCenter.default.post(name: .kenosOpenMacSettings, object: nil)
            return
        }
        macSidebarSelection = item
        switch item {
        case .today:
            if shellMode == .domain {
                requestDomainLeave { self.dismissContinuity() }
            }
            selectedTab = .today
            domainWebLiveState = ""
            syncMacSplitVisibilityForAsk()
        case .assistant:
            if shellMode == .domain {
                requestDomainLeave { self.dismissContinuity() }
            }
            selectedTab = .assistant
            syncMacSplitVisibilityForAsk()
        case .inbox:
            if shellMode == .domain {
                requestDomainLeave { self.dismissContinuity() }
            }
            selectedTab = .inbox
            domainWebLiveState = ""
            syncMacSplitVisibilityForAsk()
        case .settings:
            break
        case .domain(let domainId):
            domainWebLiveState = ""
            syncMacSplitVisibilityForAsk()
            if let url = KenosDomainRegistry.homeURL(for: domainId) {
                enterDomainMode(url: url)
            } else if domainId == "work" {
                enterDomainMode(url: KenosDailyBetaConfig.pathURL("/work"))
            }
        }
    }

    /// Keep sidebar selection in sync when Continuity opens from Switcher / deep link / bridge.
    func syncMacSidebarFromContinuity() {
        guard shellMode == .domain else { return }
        let domainId = domainSpaceId
        guard Self.macSidebarDomainOrder.contains(domainId) || domainId == "paper" else { return }
        let next = MacSidebarItem.domain(domainId)
        if macSidebarSelection != next {
            macSidebarSelection = next
        }
    }

    /// Sync Kenos Mode sidebar when the shell WK navigates (Today ↔ Assistant ↔ Inbox).
    func syncMacSidebarFromShellURL(_ url: URL) {
        guard shellMode != .domain else { return }
        let path = url.path
        let next: MacSidebarItem
        let tab: Tab
        if path.hasPrefix("/assistant") || path.hasPrefix("/chat") {
            next = .assistant
            tab = .assistant
        } else if path.hasPrefix("/inbox") {
            next = .inbox
            tab = .inbox
        } else if path.hasPrefix("/settings") {
            // Settings stays native Form — don't steal selection from web.
            return
        } else if path.hasPrefix("/spaces") {
            // Spaces hub lives in Continuity domains on Mac; ignore shell /spaces.
            return
        } else {
            next = .today
            tab = .today
        }
        if macSidebarSelection != next {
            macSidebarSelection = next
        }
        if selectedTab != tab {
            selectedTab = tab
        }
        let shellPath = relativeShellPath(url)
        if dailyBetaPathByTab[tab] != shellPath {
            dailyBetaPathByTab[tab] = shellPath
        }
    }

    /// Tab for Mac Kenos Mode shell WK (nil → native surface).
    func macShellTab(for item: MacSidebarItem) -> Tab? {
        switch item {
        case .today: return .today
        case .assistant: return .assistant
        case .inbox: return .inbox
        case .settings, .domain: return nil
        }
    }

    /// Ask conversation immerses detail (iOS hides Global Dock); restore sidebar on Home.
    func syncMacSplitVisibilityForAsk() {
        let immersing: Bool = {
            guard shellMode == .kenos, macSidebarSelection == .assistant else { return false }
            switch domainWebLiveState.lowercased() {
            case "conversation", "compose", "immersive":
                return true
            default:
                return false
            }
        }()
        let next: NavigationSplitViewVisibility = immersing ? .detailOnly : .all
        if macSplitVisibility != next {
            macSplitVisibility = next
        }
    }
    #endif

    /// Lightweight TCP/TLS warm for Plan/Training while shelf is open.
    /// HEAD only — avoids downloading full HTML into URLCache on every shelf open.
    private func warmDomainOriginsIfNeeded() {
        #if os(iOS)
        guard KenosDailyBetaConfig.isEnabled else { return }
        let currentKey = continuityURL.map(KenosWebSurfaceView.originKey)
        var candidates = [
            KenosDailyBetaConfig.plannerOrigin,
            KenosDailyBetaConfig.fitnessOrigin,
        ]
        if let work = KenosDomainRegistry.homeURL(for: "work") {
            candidates.append(work)
        }
        for origin in candidates {
            if currentKey == KenosWebSurfaceView.originKey(origin) { continue }
            var req = URLRequest(
                url: origin,
                cachePolicy: .reloadIgnoringLocalAndRemoteCacheData,
                timeoutInterval: 1.8
            )
            req.httpMethod = "HEAD"
            URLSession.shared.dataTask(with: req) { _, _, _ in }.resume()
        }
        #endif
    }

    func dismissSpaceShelf() {
        showSpaceShelf = false
    }

    /// Run `action` after Domain leave-guard passes (discard dirty draft if confirmed).
    func requestDomainLeave(action: @escaping () -> Void) {
        #if os(iOS)
        guard shellMode == .domain else {
            action()
            return
        }
        KenosDomainWebBridge.probeLeave { probe in
            if probe.dirty {
                self.domainLeaveSummary = probe.summary
                self.pendingDomainLeaveAction = action
                self.showDomainLeaveConfirm = true
            } else {
                action()
            }
        }
        #else
        action()
        #endif
    }

    func confirmDomainLeaveDiscard() {
        #if os(iOS)
        KenosDomainWebBridge.discardDraft {
            let next = self.pendingDomainLeaveAction
            self.pendingDomainLeaveAction = nil
            self.showDomainLeaveConfirm = false
            next?()
        }
        #else
        showDomainLeaveConfirm = false
        pendingDomainLeaveAction = nil
        #endif
    }

    func cancelDomainLeave() {
        pendingDomainLeaveAction = nil
        showDomainLeaveConfirm = false
    }

    func requestDomainCompose() {
        #if os(iOS)
        if shellMode == .domain {
            KenosDomainWebBridge.openCompose()
            return
        }
        // Kenos Mode: compose lives in the shell web layout (CaptureQuick), not the
        // domain bridge — without this the Capture intent silently no-ops on shell tabs.
        guard let shell = KenosActiveWebRegistry.shellWebView else {
            showCaptureSheet = true
            return
        }
        let js = """
        (function(){try{var f=window.__KENOS_SHELL_COMPOSE__||window.__KENOS_DOMAIN_COMPOSE__;\
        if(typeof f==='function'){f();return true}return false}catch(e){return false}})()
        """
        shell.evaluateJavaScript(js) { [weak self] result, _ in
            guard (result as? Bool) != true else { return }
            Task { @MainActor in
                // Web build without the hook — native capture sheet always mounts.
                self?.showCaptureSheet = true
            }
        }
        #endif
    }

    /// Re-enter Domain Mode from the last Continuity URL (UserDefaults).
    func restoreDomainIfNeeded() {
        guard shellMode != .domain || continuityURL == nil else { return }
        guard let raw = UserDefaults.standard.string(forKey: Self.lastDomainURLKey),
              let url = URL(string: raw),
              isDomainContinuityURL(url)
        else { return }
        previousKenosTab = selectedTab
        continuityURL = url
        shellMode = .domain
        domainDockSlot = 0
        syncDomainDockSlot(for: url)
        applyChromeAppearance(
            KenosDomainRegistry.defaultChromeAppearance(forContinuity: url),
            reason: "restoreDomain"
        )
        showSpaceSwitcher = false
        showSpaceShelf = false
        #if os(iOS)
        cancelInactiveContinuityTTLRelease()
        #endif
    }

    private func persistDomainContinuity(_ url: URL?) {
        if let url, isDomainContinuityURL(url) {
            UserDefaults.standard.set(url.absoluteString, forKey: Self.lastDomainURLKey)
        }
    }

    /// Public for Domain WKWebView SPA path sync.
    func persistDomainContinuityPublic(_ url: URL) {
        persistDomainContinuity(url)
    }

    /// Domain Mode display title from Continuity URL.
    var domainSpaceId: String {
        KenosDomainRegistry.domainId(fromContinuity: continuityURL)
    }

    var domainDisplayTitle: String {
        KenosDomainRegistry.definition(for: domainSpaceId)?.label ?? "Space"
    }

    /// Brand accent per Space / Kenos Mode — shelf cards / general tints (adaptive L/D).
    /// SSOT: domainIdentity.core.js via KenosDomainRegistry semantic pairs.
    static func accentColor(for spaceId: String) -> Color {
        KenosDomainRegistry.accentColor(for: spaceId)
    }

    /// Dock / glass chrome accent — higher contrast than content accent.
    static func accentOnGlass(for spaceId: String) -> Color {
        KenosDomainRegistry.accentOnGlass(for: spaceId)
    }

    var domainAccent: Color {
        Self.accentColor(for: domainSpaceId)
    }

    /// Dock selected tint on Liquid Glass — Domain Space on-glass pair; Kenos Mode Kenos on-glass.
    var dockSelectionAccent: Color {
        shellMode == .domain
            ? Self.accentOnGlass(for: domainSpaceId)
            : Self.accentOnGlass(for: "kenos")
    }

    var dockSelectionSpaceId: String {
        shellMode == .domain ? domainSpaceId : "kenos"
    }

    struct DomainDockItem: Equatable {
        var title: String
        var systemImage: String
        /// Relative path on domain origin (Domain Mode capsule).
        var path: String? = nil
        /// Kenos Mode capsule tab.
        var kenosTab: Tab? = nil
        /// Domain Mode: opens More sheet (Search / History / secondary).
        var opensMore: Bool = false
    }

    /// Kenos Mode capsule — three destinations; Spaces is a separate leading Orb.
    var kenosCapsuleDockItems: [DomainDockItem] {
        [
            .init(title: "Today", systemImage: "sun.max", kenosTab: .today),
            .init(title: "Ask", systemImage: "bubble.left.and.bubble.right", kenosTab: .assistant),
            .init(title: "Inbox", systemImage: "tray", kenosTab: .inbox),
        ]
    }

    /// Domain capsule — max 3 destinations (Spaces Orb separate). More lives in domain header.
    /// Manifest SSOT: KenosDomainRegistry ← domainIntegration.core.js
    var domainDockItems: [DomainDockItem] {
        if let manifest = KenosDomainRegistry.navigationManifest(for: domainSpaceId) {
            return manifest.slots
                .filter { !$0.opensMore }
                .map {
                    .init(title: $0.title, systemImage: $0.systemImage, path: $0.path, opensMore: false)
                }
        }
        return [
            .init(title: "Home", systemImage: "house", path: "/"),
            .init(title: "Browse", systemImage: "list.bullet", path: "/"),
            .init(title: "Library", systemImage: "books.vertical", path: "/"),
        ]
    }

    /// Secondary destinations for Domain More sheet (not on the dock).
    var domainMoreDestinations: [(title: String, systemImage: String, path: String)] {
        if let more = KenosDomainRegistry.navigationManifest(for: domainSpaceId)?.more, !more.isEmpty {
            return more.map { ($0.title, $0.systemImage, $0.path) }
        }
        return [("Home", "house", "/")]
    }

    /// Leading Spaces chip — **tap always toggles Space Shelf** (Kenos + Domain).
    /// Never returns Home / Today; leave Domain via shelf “Back to Kenos” row.
    func activateSpacesDockButton() {
        if showSpaceShelf {
            dismissSpaceShelf()
        } else {
            openSpaceShelf()
        }
    }

    /// Legacy alias — same as Spaces chip.
    func activateKenosDockButton() {
        activateSpacesDockButton()
    }

    func openSpaceShelfFromDockLongPress() {
        openSpaceShelf()
    }

    func openDomainMore() {
        showDomainMoreSheet = true
        showSpaceShelf = false
    }

    func selectDomainMorePath(_ path: String) {
        showDomainMoreSheet = false
        // Home companion deep links are handled by KenosDomainMoreSheet via
        // KenosHomeScanBridge — never feed homescan:// into WKWebView.
        if KenosHomeScanBridge.destination(fromMorePath: path) != nil {
            return
        }
        guard let base = continuityURL else { return }
        var c = URLComponents(url: base, resolvingAgainstBaseURL: false) ?? URLComponents()
        if let relative = URL(string: path, relativeTo: base)?.absoluteURL {
            continuityURL = relative
            persistDomainContinuity(relative)
        } else {
            // Support `/settings#cloud` and `/settings/app#cloud` More-sheet deep links.
            var remainder = path
            var fragment: String?
            if let hash = remainder.firstIndex(of: "#") {
                fragment = String(remainder[remainder.index(after: hash)...])
                remainder = String(remainder[..<hash])
            }
            let parts = remainder.split(separator: "?", maxSplits: 1).map(String.init)
            c.path = parts.first ?? remainder
            c.query = parts.count > 1 ? parts[1] : nil
            c.fragment = fragment
            if let next = c.url {
                continuityURL = next
                persistDomainContinuity(next)
            }
        }
        // Secondary paths are not capsule destinations — keep prior slot highlight.
    }

    /// When LAN companion is down, rewrite Continuity onto public `*.kenos.space`.
    @discardableResult
    @MainActor
    func rewriteContinuityToProduction(reason: String = "domain_probe_failed", force: Bool = false) -> Bool {
        #if os(iOS)
        guard force || KenosDailyBetaConfig.preferProductionFallback else { return false }
        guard let current = continuityURL else { return false }
        guard let next = KenosDomainRegistry.rewriteToProduction(current) else { return false }
        if current.host?.lowercased() == next.host?.lowercased(),
           (current.port ?? 0) == (next.port ?? 0)
        {
            return false
        }
        KenosLog.info("continuity production rewrite", category: .network, metadata: [
            "reason": reason,
            "force": force ? "1" : "0",
            "from": current.host ?? "",
            "to": next.host ?? "",
            "path": next.path,
        ])
        // Keep shell on production too so Work / Kenos handoffs stay coherent.
        _ = KenosDailyBetaConfig.activateProductionFallback(reason: reason, force: force)
        continuityURL = next
        persistDomainContinuity(next)
        syncDomainDockSlot(for: next)
        return true
        #else
        return false
        #endif
    }

    /// Enter Domain Mode with the Continuity URL. Always MainActor — WKWebView
    /// callbacks can post off-main and leave Kenos dock stuck on screen.
    @MainActor
    func enterDomainMode(url: URL) {
        KenosLog.breadcrumb("enter domain mode", category: .shell, metadata: [
            "host": url.host ?? "",
            "path": url.path,
            "fromShell": shellMode == .domain ? "domain" : "kenos",
        ])
        #if os(iOS)
        KenosPerfStateReporter.enterDomain(url: url)
        #endif
        // Already in Domain (Space↔Space): keep Kenos return tab; only swap URL.
        if shellMode != .domain {
            previousKenosTab = selectedTab
        }
        // Shelf should already be dismissed optimistically; never wait on web load.
        showSpaceShelf = false
        showSpaceSwitcher = false
        showDomainMoreSheet = false
        domainWebLiveState = ""
        continuityURL = url
        persistDomainContinuity(url)
        shellMode = .domain
        domainDockSlot = 0
        syncDomainDockSlot(for: url)
        // Optimistic status-bar polarity before first paint (web may refine via data-theme).
        applyChromeAppearance(
            KenosDomainRegistry.defaultChromeAppearance(forContinuity: url),
            reason: "enterDomain"
        )
        #if os(iOS)
        cancelInactiveContinuityTTLRelease()
        #endif
        #if os(macOS)
        syncMacSidebarFromContinuity()
        #endif
    }

    /// Sync SwiftUI `preferredColorScheme` + WK canvas/veil with content polarity.
    func applyChromeAppearance(_ next: KenosChromeAppearance, reason: String) {
        guard chromeAppearance != next else { return }
        chromeAppearance = next
        KenosLog.debug("chrome appearance", category: .shell, metadata: [
            "scheme": next.rawValue,
            "reason": reason,
        ])
        #if os(iOS)
        KenosWebRuntime.setCanvasAppearance(next)
        #endif
    }

    func selectKenosDockTab(_ tab: Tab) {
        // Always clear chrome overlays; only republish tab when it actually changes
        // (avoids softNavigate + SwiftUI churn on re-taps).
        if showSpaceShelf { showSpaceShelf = false }
        if showDomainMoreSheet { showDomainMoreSheet = false }
        #if os(iOS)
        if tab == .settings {
            presentSettings()
            return
        }
        #endif
        guard selectedTab != tab else { return }
        selectedTab = tab
    }

    /// iOS: modal Settings sheet over the current surface (preserves tab + scroll).
    /// macOS: sidebar Settings row.
    func presentSettings() {
        #if os(iOS)
        if showSpaceShelf { showSpaceShelf = false }
        if showDomainMoreSheet { showDomainMoreSheet = false }
        // Do not flip selectedTab — Done must restore the prior page/scroll, not Today.
        showSettingsSheet = true
        #else
        // MAC-P1-02: system Settings window (not an in-sidebar page).
        NotificationCenter.default.post(name: .kenosOpenMacSettings, object: nil)
        #endif
    }

    #if os(iOS)
    func dismissSettings() {
        showSettingsSheet = false
    }
    #endif

    func selectDomainDockSlot(_ index: Int) {
        guard domainDockItems.indices.contains(index) else { return }
        let item = domainDockItems[index]
        if showSpaceShelf { showSpaceShelf = false }
        if item.opensMore {
            openDomainMore()
            return
        }
        if showDomainMoreSheet { showDomainMoreSheet = false }
        let slotChanged = domainDockSlot != index
        if slotChanged {
            domainDockSlot = index
        }
        guard let path = item.path,
              let base = continuityURL
        else { return }
        var c = URLComponents(url: base, resolvingAgainstBaseURL: false) ?? URLComponents()
        c.path = path
        c.query = nil
        c.fragment = nil
        guard let next = c.url else { return }
        // Same Continuity path — skip @Published write (WK updateUIView soft-nav spam).
        if let current = continuityURL,
           current.host == next.host,
           current.path.lowercased() == next.path.lowercased()
        {
            return
        }
        continuityURL = next
        persistDomainContinuity(next)
    }

    /// True when Continuity is on the domain's primary dock tab (app home).
    var isAtDomainHome: Bool {
        guard shellMode == .domain, let url = continuityURL else { return true }
        return KenosDomainRegistry.isDomainHomePath(url.path, domainId: domainSpaceId)
    }

    /// Jump Continuity to the primary dock tab (Tasks / Today / …).
    func navigateToDomainHome() {
        guard shellMode == .domain else { return }
        if let idx = domainDockItems.firstIndex(where: { !$0.opensMore }) {
            selectDomainDockSlot(idx)
            return
        }
        guard let base = continuityURL else { return }
        let home = KenosDomainRegistry.primaryDockPath(for: domainSpaceId)
        var c = URLComponents(url: base, resolvingAgainstBaseURL: false) ?? URLComponents()
        c.path = home
        c.query = nil
        c.fragment = nil
        guard let next = c.url else { return }
        continuityURL = next
        persistDomainContinuity(next)
    }

    /// Leading-edge Back when WK has no history: pop in-web if possible, else domain home.
    func performDomainRouterBack() {
        #if os(iOS)
        if let web = KenosDomainWebBridge.activeWebView ?? KenosActiveWebRegistry.domainWebView,
           web.canGoBack
        {
            web.goBack()
            return
        }
        #endif
        navigateToDomainHome()
    }

    /// Highlight the Domain dock slot that matches the live WebView path.
    func syncDomainDockSlot(for url: URL) {
        let path = url.path.lowercased()
        // Plan: triage / today aliases live under Tasks capsule.
        let normalized: String = {
            if path.hasPrefix("/triage") || path.hasPrefix("/today") { return "/" }
            if path.hasPrefix("/schedule") { return "/calendar" }
            // Training day overview (not focus/summary) lives under Program capsule.
            if domainSpaceId == "training",
               path.hasPrefix("/day/"),
               !path.hasSuffix("/focus"),
               !path.hasSuffix("/summary")
            {
                return "/program"
            }
            return path
        }()
        // Longest-prefix wins so /discover/records → History (More) beats Discover (/discover).
        let morePaths = domainMoreDestinations.map { $0.path.lowercased() }
        let bestMore = morePaths
            .filter { mp in normalized == mp || normalized.hasPrefix(mp + "/") }
            .max(by: { $0.count < $1.count })
        let bestCapsule = domainDockItems.enumerated()
            .compactMap { offset, item -> (offset: Int, path: String)? in
                guard let p = item.path?.lowercased() else { return nil }
                if p == "/" {
                    guard normalized == "/" || normalized.isEmpty else { return nil }
                    return (offset, p)
                }
                guard normalized == p || normalized.hasPrefix(p + "/") else { return nil }
                return (offset, p)
            }
            .max(by: { $0.path.count < $1.path.count })
        // More destinations live in the domain header — don't steal capsule highlight.
        if let bestMore, bestMore.count >= (bestCapsule?.path.count ?? 0) {
            return
        }
        if let bestCapsule, domainDockSlot != bestCapsule.offset {
            domainDockSlot = bestCapsule.offset
        }
    }

    #if os(iOS)
    /// Spotlight + Apple Handoff from the latest Navigation Manifest.
    func publishSystemDiscovery(from manifest: KenosNativeCapabilityBridge.NavManifest) {
        guard shellMode == .domain else { return }
        _ = KenosSystemDiscovery.publish(
            domainId: manifest.domainId,
            path: manifest.path,
            title: manifest.title,
            summary: manifest.summary,
            currentDomainId: domainSpaceId
        )
    }

    /// Prefer Navigation Manifest `activeTab` (web SSOT); fall back to path matching.
    func syncDomainDockSlot(fromManifest manifest: KenosNativeCapabilityBridge.NavManifest) {
        guard shellMode == .domain else { return }
        // Ignore manifests from a different Continuity domain (stale keep-alive).
        let current = domainSpaceId.lowercased()
        let mid = manifest.domainId.lowercased()
        if !mid.isEmpty,
           mid != current,
           KenosDomainRegistry.aliases[mid] != current,
           mid != KenosDomainRegistry.aliases[current]
        {
            return
        }
        if let idx = dockSlotIndex(forActiveTab: manifest.activeTab) {
            if domainDockSlot != idx { domainDockSlot = idx }
            return
        }
        if !manifest.path.isEmpty, let base = continuityURL {
            let pathOnly = manifest.path.split(separator: "?", maxSplits: 1).map(String.init).first ?? manifest.path
            if let url = URL(string: pathOnly, relativeTo: base)?.absoluteURL {
                syncDomainDockSlot(for: url)
            }
        }
    }

    /// Map web `activeTab` ids → Domain dock capsule index.
    private func dockSlotIndex(forActiveTab raw: String) -> Int? {
        let tab = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !tab.isEmpty else { return nil }
        let training = domainSpaceId == "training"
        let aliases: [String: String] = [
            "tasks": "tasks", "today": "today", "home": "home",
            "calendar": "calendar", "schedule": "calendar",
            "inbox": "inbox", "more": "more",
            // Training dock: Today · Program · Library · More
            "discover": training ? "discover" : "more",
            "program": training ? "program" : "more",
            "library": "library", "browse": "more",
            "workout": "more", "session": "more",
            // Training Focus is immersive (dock hidden); highlight More when visible.
            "focus": training ? "more" : "focus",
            "history": "more", "records": "more",
            "accounts": "accounts",
            "plan": "plan", "rooms": "rooms", "tidy": "tidy", "organize": "organize",
            "status": "status", "trends": "trends",
            "items": "items", "recall": "recall",
            "play": "play", "queue": "queue",
            "import": "more", "liked": "more", "settings": "more",
            "playlists": "more", "stats": "more", "tools": "more",
        ]
        let normalized = aliases[tab] ?? tab
        // "more" is header-only — no dock capsule index.
        if normalized == "more" { return nil }
        if let byTitle = domainDockItems.enumerated().first(where: {
            $0.element.title.lowercased() == normalized
        }) {
            return byTitle.offset
        }
        // Path fragment match (e.g. activeTab "discover" → "/discover").
        if let byPath = domainDockItems.enumerated().first(where: { _, item in
            guard let p = item.path?.lowercased(), p != "/" else { return false }
            return p.contains(normalized) || normalized.contains(p.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        }) {
            return byPath.offset
        }
        // Root tabs: home/today/tasks → first "/" or domain home path.
        if normalized == "home" || normalized == "tasks" || normalized == "today" {
            if let root = domainDockItems.enumerated().first(where: {
                $0.element.path == "/" || $0.element.path == "/home/today" || $0.element.path == "/work"
            }) {
                return root.offset
            }
        }
        return nil
    }
    #endif

    struct SpaceShelfCard: Identifiable, Equatable {
        var id: String
        var title: String
        var subtitle: String
        var relativeTime: String?
        var isCurrent: Bool
        /// Catalog / resume key — `"kenos"` for Kenos Mode home.
        var listKey: String
        var systemImage: String = "app"
        var isKenos: Bool = false
    }

    /// Global app switcher: Kenos + full Life OS catalog (not recent-only).
    var spaceShelfCards: [SpaceShelfCard] {
        let inDomain = shellMode == .domain
        let currentId = inDomain ? domainSpaceId : ""
        let iso = ISO8601DateFormatter()

        func resumeMeta(for spaceId: String) -> (subtitle: String, relative: String?) {
            let matches = spaceSwitcherStore.resumeByListKey.filter { key, desc in
                !desc.isExpired
                    && (key == spaceId
                        || key == "hosted:\(spaceId)"
                        || key.contains(spaceId)
                        || desc.spaceId == spaceId)
            }
            let best = matches
                .map { ($0.key, $0.value) }
                .sorted {
                    let a = iso.date(from: $0.1.updatedAt) ?? .distantPast
                    let b = iso.date(from: $1.1.updatedAt) ?? .distantPast
                    return a > b
                }
                .first
            guard let best else {
                if inDomain, spaceId == currentId {
                    return (
                        KenosSpaceShelfLabels.destinationLabel(for: continuityURL, spaceId: spaceId),
                        "Now"
                    )
                }
                return (Self.spaceCatalog.first(where: { $0.id == spaceId })?.subtitle ?? spaceId, nil)
            }
            let when = iso.date(from: best.1.updatedAt)
            let sub = best.1.displaySubtitle
                ?? (inDomain && spaceId == currentId
                    ? KenosSpaceShelfLabels.destinationLabel(for: continuityURL, spaceId: spaceId)
                    : best.1.displayTitle)
            return (sub, when.map { relativeTimeString(from: $0) })
        }

        var cards: [SpaceShelfCard] = []

        // 1) Kenos — first-class system home (current when not in Domain).
        let kenosCurrent = !inDomain
        let waiting = notificationInbox.reduce(into: 0) { count, item in
            if item.type != .planReminder, item.type != .approvalRequested { count += 1 }
        }
        // Title = Space name only; destination / status live in the subtitle
        // (same grammar as Plan / Training / Music Current rows).
        let kenosSubtitle: String = {
            if waiting > 0 {
                return waiting == 1 ? "Today · 1 waiting" : "Today · \(waiting) waiting"
            }
            // Role line — never put "Today" in the title (collides with destination).
            return "Today · Ask · Inbox"
        }()
        cards.append(
            SpaceShelfCard(
                id: "kenos",
                title: "Kenos",
                subtitle: kenosSubtitle,
                relativeTime: kenosCurrent ? "Now" : nil,
                isCurrent: kenosCurrent,
                listKey: "kenos",
                // Outline grid — matches other shelf SF Symbols (not heavy filled).
                systemImage: "circle.grid.2x2",
                isKenos: true
            )
        )

        // 2) Full domain catalog — Plan, Training, Money, Music, Work, Home, Library…
        for entry in Self.spaceCatalog {
            let isCurrent = inDomain && entry.id == currentId
            let meta = resumeMeta(for: entry.id)
            cards.append(
                SpaceShelfCard(
                    id: entry.id,
                    title: entry.title,
                    subtitle: isCurrent
                        ? KenosSpaceShelfLabels.currentSubtitle(
                            spaceId: entry.id,
                            url: continuityURL,
                            resumeSubtitle: meta.subtitle,
                            spaceTitle: entry.title,
                            catalogSubtitle: entry.subtitle
                        )
                        : meta.subtitle,
                    relativeTime: isCurrent ? (meta.relative ?? "Now") : meta.relative,
                    isCurrent: isCurrent,
                    listKey: entry.id,
                    systemImage: Self.shelfSystemImage(for: entry.id),
                    isKenos: false
                )
            )
        }

        return cards
    }

    private static func shelfSystemImage(for spaceId: String) -> String {
        KenosDomainRegistry.definition(for: spaceId)?.systemImage ?? "app"
    }

    func openShelfCard(_ card: SpaceShelfCard) {
        if card.isKenos || card.listKey == "kenos" {
            if shellMode == .domain {
                // Optimistic: dismiss shelf immediately; leave-guard may still confirm.
                // Dirty drafts show the alert over Continuity (not a stuck-open shelf).
                showSpaceShelf = false
                requestDomainLeave {
                    self.dismissContinuity()
                }
            } else {
                showSpaceShelf = false
            }
            return
        }
        if card.isCurrent {
            showSpaceShelf = false
            return
        }
        // Optimistic dismiss — never wait for leave-guard AND full WK load serially.
        showSpaceShelf = false
        requestDomainLeave {
            if let entry = Self.spaceCatalog.first(where: { $0.id == card.listKey }) {
                self.openSpace(entry)
            } else {
                self.continueSpace(listKey: card.listKey)
            }
        }
    }

    private func relativeTimeString(from date: Date) -> String {
        let seconds = max(0, Int(Date().timeIntervalSince(date)))
        if seconds < 60 { return "Just now" }
        if seconds < 3600 { return "\(seconds / 60)m ago" }
        if seconds < 86400 { return "\(seconds / 3600)h ago" }
        return "\(seconds / 86400)d ago"
    }

    /// True for Daily Beta embedded domain Continuity origins (SSOT: KenosDomainRegistry).
    func isDomainContinuityURL(_ url: URL) -> Bool {
        KenosDomainRegistry.isEmbeddedWebContinuityURL(url)
    }

    private func openExternalURL(_ url: URL) {
        #if os(iOS)
        // Personal Daily Beta: Domain Mode stays inside Kenos (dock replaces tabs).
        if KenosDailyBetaConfig.isEnabled, isDomainContinuityURL(url) {
            enterDomainMode(url: url)
            return
        }
        UIApplication.shared.open(url)
        #elseif os(macOS)
        // Mac Command Center: Continuity domains stay in-app (sidebar + detail WK).
        if KenosDailyBetaConfig.isEnabled, isDomainContinuityURL(url) {
            enterDomainMode(url: url)
            return
        }
        // Work shares AIOS origin — treat /work as Domain Continuity on Mac too.
        if KenosDailyBetaConfig.isEnabled,
           url.path.hasPrefix("/work") || url.path.hasPrefix("/spaces/work")
        {
            enterDomainMode(url: url)
            return
        }
        NSWorkspace.shared.open(url)
        #endif
    }

    func returnToSystem(_ tab: Tab) {
        showSpaceSwitcher = false
        selectedTab = tab
        spacesDestination = nil
        inboxDestination = nil
    }

    func sendAssistant(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        assistantMessages.append(AssistantMessage(role: .user, text: trimmed))
        streaming = true
        try? await Task.sleep(nanoseconds: 250_000_000)
        streaming = false
        assistantMessages.append(
            AssistantMessage(
                role: .assistant,
                text: "Noted. If this needs a write, it will wait in Approvals first."
            )
        )
    }

    func submitCapture() {
        let draft = KenosCaptureFactory.makeDraft(text: captureText, sourceContext: "ios_quick_capture")
        lastCapture = draft
        captureText = ""
        try? queue.enqueueR1Draft(
            actionType: "capture.review",
            safeSummary: "Review capture draft",
            idempotencyKey: "capture-\(draft.id.uuidString)",
            correlationId: draft.correlationId
        )
    }

    func reviewWatchCapture(_ draft: CaptureDraft) {
        lastCapture = draft
        presentInboxDestination(.capture)
    }

    /// Unified logout: session store, projection cache, offline queue, handoff, focus, UI drafts + WK web auth.
    func logout() async {
        KenosLog.breadcrumb("logout begin", category: .session)
        await session.clearSession()
        try? sessionStore.clear()
        await repository.logoutClear()
        try? queue.logoutClear()
        try? handoff.logoutClear()
        focusStore.logoutClear()
        spaceSwitcherStore.logoutClear()
        #if os(iOS)
        await KenosSharedWebAuth.clearSharedWebAuth()
        KenosLogCloudSync.shared.clearCachedAuth()
        #endif
        // Keep device keypair pairing — next Face ID can exchange without re-login.
        // Explicit revoke from Portal / Settings clears the server slot.
        showSpaceSwitcher = false
        watchCaptures = []
        notificationInbox = []
        lastCapture = nil
        captureText = ""
        inboxDestination = nil
        #if os(iOS)
        if selectedTab == .settings { selectedTab = .today }
        presentSettings()
        #else
        selectedTab = .settings
        #endif
        KenosLog.notice("logout complete", category: .session, metadata: ["breadcrumb": "1"])
    }
}

/// Pure copy helpers for Space Shelf Current / resume subtitles.
/// Never emit a generic "Home" that collides with Kenos Home or Domain home tabs.
enum KenosSpaceShelfLabels {
    /// Domain landing destination when Continuity is at the Space home path.
    static func homeDestination(for spaceId: String) -> String {
        switch spaceId {
        case "plan": return "Tasks"
        case "training": return "Today"
        case "music": return "Library"
        case "money": return "Overview"
        case "work": return "Projects"
        case "library": return "Vault"
        case "home": return "Rooms"
        case "health": return "Status"
        case "paper": return "Notebooks"
        default: return "Space"
        }
    }

    /// Path → destination label. Domain home uses Space-specific names (not "Home").
    static func destinationLabel(for url: URL?, spaceId: String) -> String {
        if let url {
            let path = url.path
            let atHome = path.isEmpty
                || path == "/"
                || KenosDomainRegistry.isDomainHomePath(path, domainId: spaceId)
            if !atHome {
                let leaf = path.split(separator: "/").last.map(String.init) ?? path
                switch leaf.lowercased() {
                case "calendar": return "Calendar"
                case "projects": return "Projects"
                case "search": return "Search"
                case "session": return "Workout"
                case "library": return "Library"
                case "records": return "History"
                case "focus": return "Focus"
                case "summary": return "Summary"
                case "today": return "Today"
                case "inbox": return "Inbox"
                case "triage": return "Triage"
                case "program": return "Program"
                case "discover": return "Library"
                case "accounts": return "Accounts"
                case "plan": return spaceId == "home" ? "Rooms" : "Plan"
                default:
                    if leaf.count > 1 {
                        return leaf.prefix(1).uppercased() + leaf.dropFirst()
                    }
                }
            }
        }
        return homeDestination(for: spaceId)
    }

    /// Current-row subtitle: destination (+ optional contextual status).
    static func currentSubtitle(
        spaceId: String,
        url: URL?,
        resumeSubtitle: String,
        spaceTitle: String? = nil,
        catalogSubtitle: String? = nil
    ) -> String {
        let destination = destinationLabel(for: url, spaceId: spaceId)
        let resume = resumeSubtitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let catalog = (catalogSubtitle ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let title = (spaceTitle ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if resume.isEmpty
            || resume.caseInsensitiveCompare(destination) == .orderedSame
            || (!catalog.isEmpty && resume.caseInsensitiveCompare(catalog) == .orderedSame)
            || resume.caseInsensitiveCompare(spaceId) == .orderedSame
            || (!title.isEmpty && resume.caseInsensitiveCompare(title) == .orderedSame)
            || resume.caseInsensitiveCompare("home") == .orderedSame
        {
            return destination
        }
        if resume.contains("·") { return resume }
        return "\(destination) · \(resume)"
    }
}
