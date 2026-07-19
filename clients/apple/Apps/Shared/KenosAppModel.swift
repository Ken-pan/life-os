import Combine
import SwiftUI
import KenosActions
import KenosClient
import KenosDesign
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
    let approvalsActionsEnabled = false

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
        let session = MockSessionProvider()
        self.session = session
        let secure = InMemorySecureStore()
        self.sessionStore = KenosKeychainSessionStore(secureStore: secure)
        try? sessionStore.save(token: "mock-session-token", ownerId: UUID(uuidString: "20000000-0000-4000-8000-000000000001")!)
        self.repository = KenosReadRepository(
            client: client,
            store: FileProjectionStore(directory: cacheDirectory.appendingPathComponent("projections")),
            session: session
        )
        self.queue = KenosOfflineActionQueue(
            store: FileActionQueueStore(directory: cacheDirectory.appendingPathComponent("queue"))
        )
    }

    func bootstrap() async {
        await repository.bootstrap()
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
}
