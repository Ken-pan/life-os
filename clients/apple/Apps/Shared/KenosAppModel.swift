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

    static let spaceCatalog: [SpaceCatalogEntry] = [
        .init(id: "work", title: "Work", subtitle: "Projects and decisions", kind: .hosted(.work)),
        .init(id: "plan", title: "Plan", subtitle: "Tasks and schedule", kind: .external(URL(string: "https://planner.kenos.space")!)),
        .init(id: "training", title: "Training", subtitle: "Fitness workouts", kind: .external(URL(string: "https://fitness.kenos.space")!)),
        .init(id: "money", title: "Money", subtitle: "Finance decisions", kind: .external(URL(string: "https://finance.kenos.space")!)),
        .init(id: "music", title: "Music", subtitle: "Library and playback", kind: .external(URL(string: "https://music.kenos.space")!)),
        .init(id: "home", title: "Home", subtitle: "Spaces and items", kind: .external(URL(string: "https://home.kenos.space")!)),
        .init(id: "library", title: "Library", subtitle: "Documents and references", kind: .comingSoon),
    ]

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
        let secure = InMemorySecureStore()
        self.sessionStore = KenosKeychainSessionStore(secureStore: secure)
        try? sessionStore.save(token: "mock-session-token", ownerId: ownerId)
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
        focusStore.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        let spaceSwitcherStore = KenosSpaceSwitcherStore(
            ownerId: ownerId,
            directory: cacheDirectory.appendingPathComponent("spaceSwitcher")
        )
        self.spaceSwitcherStore = spaceSwitcherStore
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
        open(KenosDeepLinkRouter.parse(urlString))
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

    func openSpaceSwitcher() {
        showSpaceSwitcher = true
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
            #if os(iOS)
            UIApplication.shared.open(url)
            #elseif os(macOS)
            NSWorkspace.shared.open(url)
            #endif
        case .comingSoon:
            selectedTab = .spaces
        }
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
