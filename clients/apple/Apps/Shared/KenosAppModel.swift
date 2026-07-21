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
    /// System top-level IA: Today · Assistant · Spaces · Inbox
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
    /// Daily Beta Continuity: Plan / Training load in-app WKWebView (not Safari).
    @Published var continuityURL: URL?

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

    /// Seven-domain catalog. Daily Beta uses phone-reachable LAN origins for Plan/Training.
    static var spaceCatalog: [SpaceCatalogEntry] {
        let planURL: URL
        let trainingURL: URL
        if KenosDailyBetaConfig.isEnabled {
            planURL = KenosDailyBetaConfig.plannerOrigin
            trainingURL = KenosDailyBetaConfig.fitnessOrigin
        } else {
            planURL = URL(string: "https://planner.kenos.space")!
            trainingURL = URL(string: "https://fitness.kenos.space")!
        }
        return [
            .init(id: "work", title: "Work", subtitle: "Projects and decisions", kind: .hosted(.work)),
            .init(id: "plan", title: "Plan", subtitle: "Tasks and schedule", kind: .external(planURL)),
            .init(id: "training", title: "Training", subtitle: "Fitness workouts", kind: .external(trainingURL)),
            .init(id: "money", title: "Money", subtitle: "Finance decisions", kind: .external(URL(string: "https://finance.kenos.space")!)),
            .init(id: "music", title: "Music", subtitle: "Library and playback", kind: .external(URL(string: "https://music.kenos.space")!)),
            .init(id: "home", title: "Home", subtitle: "Spaces and items", kind: .external(URL(string: "https://home.kenos.space")!)),
            .init(id: "library", title: "Library", subtitle: "Knowledge vault", kind: .external(KenosDailyBetaConfig.isEnabled
                ? KenosDailyBetaConfig.pathURL("/spaces/knowledge")
                : URL(string: "https://portal.kenos.space")!)),
        ]
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
        try? await notifications.schedule(KenosNotificationFixtures.planReminder())
        try? await notifications.schedule(KenosNotificationFixtures.approvalRequested())
        notificationInbox = await notifications.pending()
        try? await handoff.drainIncoming()
        watchCaptures = handoff.receivedCaptures
        if let link = handoff.lastReceivedDeepLink {
            open(urlString: link)
        }
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
                case "today":
                    navigateDailyBetaShell(path: "/")
                    return
                case "assistant":
                    navigateDailyBetaShell(path: "/assistant")
                    return
                case "spaces":
                    navigateDailyBetaShell(path: "/spaces")
                    return
                case "inbox":
                    navigateDailyBetaShell(path: "/inbox")
                    return
                case "settings":
                    navigateDailyBetaShell(path: "/settings")
                    return
                default:
                    break
                }
            }
        }
        open(KenosDeepLinkRouter.parse(urlString))
    }

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
        let port = url.port
        if port == 5188 || path.hasPrefix("/plan") {
            openExternalURL(url)
            return
        }
        if port == 5190 || path.hasPrefix("/day") || path.hasPrefix("/training") {
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
        let home: URL = {
            switch listKey {
            case "plan", "hosted:plan": return KenosDailyBetaConfig.isEnabled
                ? KenosDailyBetaConfig.plannerOrigin
                : URL(string: "https://planner.kenos.space")!
            case "training", "hosted:training": return KenosDailyBetaConfig.isEnabled
                ? KenosDailyBetaConfig.fitnessOrigin
                : URL(string: "https://fitness.kenos.space")!
            default:
                if let entry = Self.spaceCatalog.first(where: { $0.id == listKey || "hosted:\($0.id)" == listKey }) {
                    if case .external(let url) = entry.kind { return url }
                }
                return KenosDailyBetaConfig.kenOsOrigin
            }
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

    /// Dismiss in-app Continuity and return to shell tabs.
    func dismissContinuity() {
        continuityURL = nil
    }

    /// True for Daily Beta Plan/Training LAN (or production) domain Continuity origins.
    func isDomainContinuityURL(_ url: URL) -> Bool {
        let port = url.port
        if port == 5188 || port == 5190 || port == 5180 || port == 5189 {
            return true
        }
        let host = (url.host ?? "").lowercased()
        return host.contains("planner.kenos") || host.contains("fitness.kenos")
            || host.contains("music.kenos") || host.contains("finance.kenos")
    }

    private func openExternalURL(_ url: URL) {
        #if os(iOS)
        // Personal Daily Beta: Continuity must stay inside Kenos process (no Safari chrome).
        if KenosDailyBetaConfig.isEnabled, isDomainContinuityURL(url) {
            continuityURL = url
            showSpaceSwitcher = false
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
