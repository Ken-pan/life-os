import Combine
import SwiftUI
import KenosActions
import KenosClient
import KenosDesign
import KenosHandoff
import KenosNotifications
import KenosStore

@MainActor
final class KenosAppModel: ObservableObject {
    enum Tab: String, CaseIterable, Identifiable {
        case today, assistant, work, inbox, more
        var id: String { rawValue }
        var title: String {
            switch self {
            case .today: return "Today"
            case .assistant: return "Assistant"
            case .work: return "Work"
            case .inbox: return "Inbox"
            case .more: return "More"
            }
        }
    }

    @Published var selectedTab: Tab = .today
    @Published var route: KenosDeepLink = .today
    @Published var moreDestination: MoreDestination?
    @Published var captureText = ""
    @Published var lastCapture: CaptureDraft?
    @Published var watchCaptures: [CaptureDraft] = []
    @Published var notificationInbox: [KenosNotificationRecord] = []
    @Published var assistantMessages: [AssistantMessage] = [
        AssistantMessage(role: .assistant, text: "Kenos Assistant shell · mock streaming · no domain writes."),
    ]
    @Published var streaming = false

    enum MoreDestination: String, Hashable {
        case approvals, activity, capture, system, settings, library
    }

    let repository: KenosReadRepository
    let queue: KenosOfflineActionQueue
    let sessionStore: KenosKeychainSessionStore
    let session: MockSessionProvider
    let handoff: KenosHandoffSession
    let notifications: MockNotificationProvider
    let approvalsActionsEnabled = false
    private let ownerId = UUID(uuidString: "20000000-0000-4000-8000-000000000001")!

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
    }

    func bootstrap() async {
        await repository.bootstrap()
        try? await notifications.schedule(KenosNotificationFixtures.planReminder())
        try? await notifications.schedule(KenosNotificationFixtures.approvalRequested())
        notificationInbox = await notifications.pending()
        try? await handoff.drainIncoming()
        watchCaptures = handoff.receivedCaptures
        if let link = handoff.lastReceivedDeepLink {
            open(urlString: link)
        }
    }

    func open(_ link: KenosDeepLink) {
        route = link
        switch link {
        case .today: selectedTab = .today
        case .assistant: selectedTab = .assistant
        case .work, .workProject, .deliverable, .meeting, .decision, .planTask, .library:
            selectedTab = .work
            if case .library = link { moreDestination = .library; selectedTab = .more }
        case .inbox, .inboxItem: selectedTab = .inbox
        case .approvals, .approval:
            selectedTab = .more
            moreDestination = .approvals
        case .activity, .activityItem:
            selectedTab = .more
            moreDestination = .activity
        case .capture:
            selectedTab = .more
            moreDestination = .capture
        case .system:
            selectedTab = .more
            moreDestination = .system
        case .unknown:
            selectedTab = .more
            moreDestination = .system
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
                text: "Proposal card (mock): consider a WorkActionProposal draft. Approval remains read-only. productionWrite=false."
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
        moreDestination = .capture
        selectedTab = .more
    }

    /// Unified logout: session store, projection cache, offline queue, handoff, UI drafts.
    func logout() async {
        await session.clearSession()
        try? sessionStore.clear()
        await repository.logoutClear()
        try? queue.logoutClear()
        try? handoff.logoutClear()
        watchCaptures = []
        notificationInbox = []
        lastCapture = nil
        captureText = ""
        moreDestination = .settings
    }
}
