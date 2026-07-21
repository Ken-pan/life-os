import Combine
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif
#if canImport(AppKit)
import AppKit
#endif
import KenosActions
import KenosClient
import KenosDesign
import KenosHandoff
import KenosNotifications
import KenosStore

@MainActor
final class KenosAppModel: ObservableObject {
    /// System top-level IA: Spaces (leading) + Today · Assistant · Inbox · Settings capsule.
    enum Tab: String, CaseIterable, Identifiable {
        case today, assistant, spaces, inbox
        var id: String { rawValue }
        var title: String {
            switch self {
            case .today: return "Today"
            case .assistant: return "Assistant"
            case .spaces: return "Spaces"
            case .inbox: return "Inbox"
            }
        }
    }

    @Published var selectedTab: Tab = .today
    @Published var route: KenosDeepLink = .today
    /// Daily Beta WKWebView path per tab (supports Continue / payload-url deep resume).
    @Published var dailyBetaPathByTab: [Tab: String] = [
        .today: "/",
        .assistant: "/assistant",
        .spaces: "/spaces",
        .inbox: "/inbox",
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
    /// Temporary Space Switcher layer (not a 5th tab).
    @Published var showSpaceSwitcher = false
    /// Which chrome sheet is open — Continue (Recent) vs Switch Space vs Quick Switch.
    @Published var spaceChromeMode: SpaceChromeMode = .switchSpace
    /// Native settings (origin / auth) — used when Inbox is a Web surface.
    @Published var showSettingsSheet = false
    #if os(iOS)
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
    private var pendingDomainLeaveAction: (() -> Void)?

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
        /// Searchable Quick Switch (Things Quick Find).
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
    let notifications: MockNotificationProvider
    let approvalsActionsEnabled = false
    private let ownerId = UUID(uuidString: "20000000-0000-4000-8000-000000000001")!
    /// Stabilization health bag (no UI). Falls back process-local until App Group entitlement.
    private lazy var runtimeHealthStore = KenosAppGroupStore(ownerId: ownerId)
    private var cancellables = Set<AnyCancellable>()

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
        self.notifications = MockNotificationProvider()
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
    }

    func bootstrap() async {
        await repository.bootstrap()
        if let sessionOwner = try? await session.ownerId() {
            spaceSwitcherStore.bindOwner(sessionOwner)
        }
        recordRuntimeHealth()
        try? await notifications.schedule(KenosNotificationFixtures.planReminder())
        try? await notifications.schedule(KenosNotificationFixtures.approvalRequested())
        notificationInbox = await notifications.pending()
        try? await handoff.drainIncoming()
        watchCaptures = handoff.receivedCaptures
        if let link = handoff.lastReceivedDeepLink {
            open(urlString: link)
        }
    }

    /// Low-noise health for dogfood — never writes tokens / emails / bodies; never shown in ordinary UI.
    private func recordRuntimeHealth() {
        #if os(iOS)
        let build =
            Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
            ?? Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
            ?? "unknown"
        let origin = KenosDailyBetaConfig.isEnabled ? KenosDailyBetaConfig.kenOsOrigin : URL(string: "https://kenos.space")!
        let auth: String
        if (try? sessionStore.loadToken()) != nil {
            auth = "session_present"
        } else {
            auth = "session_absent"
        }
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
            presentInboxDestination(.approvals)
        case .activity, .activityItem:
            presentInboxDestination(.activity)
        case .capture:
            presentInboxDestination(.capture)
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
                    openQuickSwitch()
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
                case "settings":
                    if shellMode == .domain { returnToKenosFromDomain() }
                    navigateDailyBetaShell(path: "/settings")
                    return
                #if os(iOS)
                case "bug", "report-bug", "feedback":
                    Task { await beginBugReport() }
                    return
                #endif
                default:
                    break
                }
            }
        }
        open(KenosDeepLinkRouter.parse(urlString))
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

    /// Other chrome that should suppress the quiet screenshot offer.
    private var blocksScreenshotBugPrompt: Bool {
        showBugReportSheet
            || showScreenshotBugPrompt
            || showSettingsSheet
            || showSpaceSwitcher
            || showCaptureSheet
            || showDomainMoreSheet
            || showSpaceShelf
            || showDomainLeaveConfirm
    }

    /// Bottom padding so the prompt sits above Kenos/Domain dock (or flush in Focus).
    var screenshotBugPromptBottomPadding: CGFloat {
        if hideGlobalNavForFocus || focusStore.isPaused || focusStore.showCompletedSummary {
            return 28
        }
        // Dock (~54 content) + bottom inset + home-indicator clearance.
        return KenosGlass.dockBottomInset + 84
    }

    /// System screenshot path (best practice):
    /// 1) capture window snapshot immediately (notification has no image payload)
    /// 2) quiet confirm — most screenshots are not bug reports
    /// 3) only then open the full report sheet
    func handleSystemScreenshot() async {
        guard askAfterScreenshotEnabled else { return }
        // Foreground gate lives in KenosRootView (`scenePhase == .active`).
        guard !blocksScreenshotBugPrompt else { return }
        if let last = lastScreenshotPromptAt, Date().timeIntervalSince(last) < 2.5 {
            return
        }
        // Capture BEFORE any prompt UI so the attachment is the host screen, not our dialog.
        let jpeg = KenosBugReportCapture.captureKeyWindowJPEG()
        let draft = await makeBugReportDraft(jpeg: jpeg)
        bugReportDraft = draft
        lastScreenshotPromptAt = Date()
        showScreenshotBugPrompt = true
        scheduleScreenshotPromptAutoDismiss(for: draft.id)
    }

    /// Explicit entry (Settings / deep link) — skip confirm, open review sheet.
    func beginBugReport(delayCapture: Bool = false) async {
        cancelScreenshotPromptAutoDismiss()
        showScreenshotBugPrompt = false
        if delayCapture {
            // Let Settings sheet dismiss before capturing.
            try? await Task.sleep(nanoseconds: 360_000_000)
        }
        let jpeg = KenosBugReportCapture.captureKeyWindowJPEG()
        bugReportDraft = await makeBugReportDraft(jpeg: jpeg)
        showBugReportSheet = true
    }

    func confirmScreenshotBugReport() {
        cancelScreenshotPromptAutoDismiss()
        guard bugReportDraft != nil else {
            showScreenshotBugPrompt = false
            return
        }
        // Open sheet before dismissing the prompt so cleanup won't drop the draft.
        showBugReportSheet = true
        showScreenshotBugPrompt = false
    }

    func dismissScreenshotBugPrompt() {
        cancelScreenshotPromptAutoDismiss()
        showScreenshotBugPrompt = false
        // Keep draft only while the full report sheet is open.
        if !showBugReportSheet {
            bugReportDraft = nil
        }
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

    private func makeBugReportDraft(jpeg: Data?) async -> KenosBugReportDraft {
        let web = KenosActiveWebRegistry.preferred(for: self)
        let diagnostics = await KenosBugDiagnosticsFactory.make(
            model: self,
            webView: web,
            screenshotBytes: jpeg?.count ?? 0
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

    func refreshBugReportScreenshot() async {
        guard var draft = bugReportDraft else {
            await beginBugReport()
            return
        }
        let previousTitle = draft.title
        let jpeg = KenosBugReportCapture.captureKeyWindowJPEG()
        draft.screenshotJPEG = jpeg
        let web = KenosActiveWebRegistry.preferred(for: self)
        let diagnostics = await KenosBugDiagnosticsFactory.make(
            model: self,
            webView: web,
            screenshotBytes: jpeg?.count ?? 0
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
        let normalized = path.hasPrefix("/") ? path : "/\(path)"
        let pathOnly = normalized.split(separator: "?", maxSplits: 1).first.map(String.init) ?? normalized
        let tab = tabForShellPath(pathOnly)
        dailyBetaPathByTab[tab] = normalized
        selectedTab = tab
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
        default:
            if path.hasPrefix("/spaces/") {
                selectedTab = .spaces
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
        return .today
    }

    func openNotification(_ record: KenosNotificationRecord) {
        if KenosNotificationSafety.isExpired(record, now: ISO8601DateFormatter().string(from: Date())) {
            return
        }
        open(urlString: record.deepLink)
    }

    func openCapture() {
        if hideGlobalNavForFocus || focusStore.isPaused || focusStore.showCompletedSummary {
            showCaptureSheet = true
            return
        }
        presentInboxDestination(.capture)
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

    /// Quick Switch = searchable recent + spaces (Things Quick Find).
    func openQuickSwitch() {
        spaceChromeMode = .quickSwitch
        showSpaceSwitcher = true
    }

    func dismissSpaceChrome() {
        showSpaceSwitcher = false
    }

    /// Live accessory above Tab Bar — Music MiniPlayer pattern for mid-domain Continuity.
    /// Focus leave still uses the top `FocusReturnBanner` (no duplicate chrome).
    var liveAccessory: LiveAccessory? {
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

    func activateLiveAccessory(_ accessory: LiveAccessory) {
        switch accessory.kind {
        case .focus:
            returnToFocus()
        case .continuity(let listKey):
            continueSpace(listKey: listKey)
        }
    }

    struct LiveAccessory: Equatable, Identifiable {
        enum Kind: Equatable {
            case focus
            case continuity(listKey: String)
        }
        var id: String {
            switch kind {
            case .focus: return "focus"
            case .continuity(let k): return "continuity:\(k)"
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
        // Flip mode before clearing URL so RootView never paints Domain with a nil
        // canvas (empty ink / white flash between Continuity and Kenos tabs).
        shellMode = .kenos
        showSpaceShelf = false
        domainDockSlot = 0
        selectedTab = previousKenosTab
        continuityURL = nil
    }

    func returnToKenosFromDomain() {
        requestDomainLeave {
            self.dismissContinuity()
        }
    }

    func openSpaceShelf() {
        showSpaceShelf = true
        showSpaceSwitcher = false
        warmDomainOriginsIfNeeded()
    }

    /// Lightweight TCP/TLS + HTTP cache warm for Plan/Training while shelf is open.
    /// Does not create WKWebViews; destination still loads in Continuity surface.
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
                cachePolicy: .returnCacheDataElseLoad,
                timeoutInterval: 2.5
            )
            req.httpMethod = "GET"
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
        KenosDomainWebBridge.openCompose()
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
        showSpaceSwitcher = false
        showSpaceShelf = false
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

    /// Brand accent per Space / Kenos Mode — dock selection + Space Shelf icons.
    /// SSOT: domainIntegration.core.js / domainIdentity.core.js via KenosDomainRegistry.
    static func accentColor(for spaceId: String) -> Color {
        KenosDomainRegistry.accentColor(for: spaceId)
    }

    var domainAccent: Color {
        Self.accentColor(for: domainSpaceId)
    }

    /// Dock selected tint — Domain uses active Space accent; Kenos Mode uses Kenos blue.
    var dockSelectionAccent: Color {
        shellMode == .domain ? domainAccent : Self.accentColor(for: "kenos")
    }

    struct DomainDockItem: Equatable {
        var title: String
        var systemImage: String
        /// Relative path on domain origin (Domain Mode capsule).
        var path: String? = nil
        /// Kenos Mode capsule tab (nil for Settings action).
        var kenosTab: Tab? = nil
        /// Kenos Mode: opens settings sheet instead of a tab.
        var opensSettings: Bool = false
        /// Domain Mode: opens More sheet (Search / History / secondary).
        var opensMore: Bool = false
    }

    /// Kenos Mode capsule — four items; leading chip is Spaces (opens Space Shelf).
    var kenosCapsuleDockItems: [DomainDockItem] {
        [
            .init(title: "Today", systemImage: "sun.max", kenosTab: .today),
            .init(title: "Assistant", systemImage: "bubble.left.and.bubble.right", kenosTab: .assistant),
            .init(title: "Inbox", systemImage: "tray", kenosTab: .inbox),
            .init(title: "Settings", systemImage: "gearshape", opensSettings: true),
        ]
    }

    /// Domain capsule — max 4 slots (leading Kenos/Spaces chip makes 5 total).
    /// Manifest SSOT: KenosDomainRegistry ← domainIntegration.core.js
    var domainDockItems: [DomainDockItem] {
        if let manifest = KenosDomainRegistry.navigationManifest(for: domainSpaceId) {
            return manifest.slots.map {
                .init(title: $0.title, systemImage: $0.systemImage, path: $0.path, opensMore: $0.opensMore)
            }
        }
        return [
            .init(title: "Home", systemImage: "house", path: "/"),
            .init(title: "Browse", systemImage: "list.bullet", path: "/"),
            .init(title: "Library", systemImage: "books.vertical", path: "/"),
            .init(title: "More", systemImage: "ellipsis", opensMore: true),
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
        guard let base = continuityURL else { return }
        var c = URLComponents(url: base, resolvingAgainstBaseURL: false) ?? URLComponents()
        if let relative = URL(string: path, relativeTo: base)?.absoluteURL {
            continuityURL = relative
            persistDomainContinuity(relative)
        } else {
            let parts = path.split(separator: "?", maxSplits: 1).map(String.init)
            c.path = parts.first ?? path
            c.query = parts.count > 1 ? parts[1] : nil
            c.fragment = nil
            if let next = c.url {
                continuityURL = next
                persistDomainContinuity(next)
            }
        }
        // Secondary paths are not capsule slots — leave More as the active chrome cue.
        if let moreIdx = domainDockItems.firstIndex(where: \.opensMore) {
            domainDockSlot = moreIdx
        }
    }

    /// Enter Domain Mode with the Continuity URL. Always MainActor — WKWebView
    /// callbacks can post off-main and leave Kenos dock stuck on screen.
    @MainActor
    func enterDomainMode(url: URL) {
        // Already in Domain (Space↔Space): keep Kenos return tab; only swap URL.
        if shellMode != .domain {
            previousKenosTab = selectedTab
        }
        // Shelf should already be dismissed optimistically; never wait on web load.
        showSpaceShelf = false
        showSpaceSwitcher = false
        showSettingsSheet = false
        showDomainMoreSheet = false
        continuityURL = url
        persistDomainContinuity(url)
        shellMode = .domain
        domainDockSlot = 0
        syncDomainDockSlot(for: url)
    }

    func selectKenosDockTab(_ tab: Tab) {
        showSpaceShelf = false
        showSettingsSheet = false
        showDomainMoreSheet = false
        selectedTab = tab
    }

    func selectDomainDockSlot(_ index: Int) {
        guard domainDockItems.indices.contains(index) else { return }
        let item = domainDockItems[index]
        showSpaceShelf = false
        if item.opensMore {
            openDomainMore()
            return
        }
        domainDockSlot = index
        showDomainMoreSheet = false
        guard let path = item.path,
              let base = continuityURL
        else { return }
        var c = URLComponents(url: base, resolvingAgainstBaseURL: false) ?? URLComponents()
        c.path = path
        c.query = nil
        c.fragment = nil
        if let next = c.url {
            continuityURL = next
            persistDomainContinuity(next)
        }
    }

    /// Highlight the Domain dock slot that matches the live WebView path.
    func syncDomainDockSlot(for url: URL) {
        let path = url.path.lowercased()
        guard let match = domainDockItems.enumerated().first(where: { _, item in
            guard let p = item.path?.lowercased() else { return false }
            if p == "/" { return path == "/" || path.isEmpty }
            return path == p || path.hasPrefix(p + "/")
        }) else { return }
        if domainDockSlot != match.offset {
            domainDockSlot = match.offset
        }
    }

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
                    return (Self.shelfSubtitle(for: continuityURL), "Now")
                }
                return (Self.spaceCatalog.first(where: { $0.id == spaceId })?.subtitle ?? spaceId, nil)
            }
            let when = iso.date(from: best.1.updatedAt)
            let sub = best.1.displaySubtitle
                ?? (inDomain && spaceId == currentId ? Self.shelfSubtitle(for: continuityURL) : best.1.displayTitle)
            return (sub, when.map { relativeTimeString(from: $0) })
        }

        var cards: [SpaceShelfCard] = []

        // 1) Kenos — first-class system home (current when not in Domain).
        let kenosCurrent = !inDomain
        cards.append(
            SpaceShelfCard(
                id: "kenos",
                title: "Kenos",
                subtitle: kenosCurrent
                    ? previousKenosTab.title
                    : "Today · Assistant · Inbox",
                relativeTime: kenosCurrent ? "Now" : nil,
                isCurrent: kenosCurrent,
                listKey: "kenos",
                systemImage: "circle.grid.2x2.fill",
                isKenos: true
            )
        )

        // 2) Full domain catalog — Plan, Training, Money, Music, Work, Home, Library…
        for entry in Self.spaceCatalog {
            let isCurrent = inDomain && (
                entry.id == currentId
                    || (currentId == "plan" && entry.id == "plan")
                    || (currentId == "training" && entry.id == "training")
            )
            let meta = resumeMeta(for: entry.id)
            cards.append(
                SpaceShelfCard(
                    id: entry.id,
                    title: entry.title,
                    subtitle: isCurrent ? Self.shelfSubtitle(for: continuityURL) : meta.subtitle,
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

    private static func shelfSubtitle(for url: URL?) -> String {
        guard let url else { return "Home" }
        let path = url.path
        if path.isEmpty || path == "/" { return "Home" }
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
        default: return leaf.prefix(1).uppercased() + leaf.dropFirst()
        }
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

    /// Unified logout: session store, projection cache, offline queue, handoff, focus, UI drafts.
    func logout() async {
        await session.clearSession()
        try? sessionStore.clear()
        await repository.logoutClear()
        try? queue.logoutClear()
        try? handoff.logoutClear()
        focusStore.logoutClear()
        spaceSwitcherStore.logoutClear()
        showSpaceSwitcher = false
        watchCaptures = []
        notificationInbox = []
        lastCapture = nil
        captureText = ""
        inboxDestination = .settings
        selectedTab = .inbox
    }
}
