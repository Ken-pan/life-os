import Combine
import SwiftUI
import KenosActions
import KenosClient
import KenosHandoff
import KenosStore

@main
struct KenosWatchApp: App {
    @StateObject private var model = KenosWatchModel()

    var body: some Scene {
        WindowGroup {
            KenosWatchRootView(model: model)
                .task { await model.bootstrap() }
        }
    }
}

@MainActor
final class KenosWatchModel: ObservableObject {
    enum Tab: String, CaseIterable, Identifiable {
        case today, capture, inbox, approvals, activity
        var id: String { rawValue }
        var title: String {
            switch self {
            case .today: return "Today"
            case .capture: return "Capture"
            case .inbox: return "Inbox"
            case .approvals: return "Approvals"
            case .activity: return "Activity"
            }
        }
    }

    @Published var tab: Tab = .today
    @Published var captureText = ""
    @Published var lastCapture: CaptureDraft?
    @Published var glance: TodayGlance = TodayGlance(freshness: "unavailable", offlineStatus: "unavailable", state: "loading")
    @Published var approvals: [ApprovalGlance] = []
    @Published var activity: [ActivityGlance] = []
    @Published var inboxCountLabel = "—"
    @Published var statusMessage: String?

    let repository: KenosReadRepository
    let handoff: KenosHandoffSession
    let approvalsActionsEnabled = false
    private let ownerId = UUID(uuidString: "20000000-0000-4000-8000-000000000001")!

    init() {
        let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("kenos-phase4b-watch")
        let session = MockSessionProvider(owner: ownerId)
        self.repository = KenosReadRepository(
            client: MockKenosAPIClient(),
            store: FileProjectionStore(directory: cache.appendingPathComponent("projections")),
            session: session
        )
        self.handoff = KenosHandoffSession(
            transport: FakeCompanionTransport(),
            ownerId: ownerId,
            persistDirectory: cache.appendingPathComponent("handoff")
        )
    }

    func bootstrap() async {
        await repository.bootstrap()
        refreshGlances()
    }

    func refreshGlances() {
        let snap = repository.snapshot
        let hasSource = snap.today != nil || snap.work != nil
        glance = KenosGlanceMapper.todayGlance(
            today: snap.today,
            inbox: snap.inbox,
            approvals: snap.approvals,
            work: snap.work,
            freshness: snap.meta.freshness.rawValue,
            lastSync: snap.meta.lastSuccessfulSync,
            repositoryState: surfaceStateLabel(repository.state),
            hasSource: hasSource
        )
        approvals = KenosGlanceMapper.approvalGlances(from: snap.approvals)
        activity = KenosGlanceMapper.activityGlances(from: snap.activity)
        if let count = glance.pendingInboxCount {
            inboxCountLabel = "\(count)"
        } else if glance.state == "unavailable" || glance.state == "offline" {
            inboxCountLabel = "—"
        } else {
            inboxCountLabel = "0"
        }
    }

    func submitCapture() {
        let draft = KenosCaptureFactory.makeDraft(text: captureText, sourceContext: "watch_quick_capture")
        lastCapture = draft
        captureText = ""
        try? handoff.enqueueCaptureTransfer(draft)
        Task {
            await handoff.processOutgoing()
            statusMessage = handoff.transfers.last.map { "Capture \($0.state.rawValue)" }
        }
    }

    func openOnPhone(_ deepLink: String) {
        try? handoff.enqueueOpenOnPhone(deepLink: deepLink)
        Task {
            await handoff.processOutgoing()
            statusMessage = "Handoff queued"
        }
    }

    private func surfaceStateLabel(_ state: KenosReadRepository.SurfaceState) -> String {
        switch state {
        case .loading: return "loading"
        case .ready: return "ready"
        case .stale: return "stale"
        case .unavailable: return "unavailable"
        case .permissionDenied: return "permission_denied"
        case .sessionExpired: return "session_expired"
        case .malformed: return "malformed"
        case .empty: return "empty"
        case .partial: return "partial"
        }
    }
}

struct KenosWatchRootView: View {
    @ObservedObject var model: KenosWatchModel

    var body: some View {
        TabView(selection: $model.tab) {
            WatchTodayView(model: model).tag(KenosWatchModel.Tab.today)
            WatchCaptureView(model: model).tag(KenosWatchModel.Tab.capture)
            WatchInboxView(model: model).tag(KenosWatchModel.Tab.inbox)
            WatchApprovalsView(model: model).tag(KenosWatchModel.Tab.approvals)
            WatchActivityView(model: model).tag(KenosWatchModel.Tab.activity)
        }
        .tabViewStyle(.verticalPage)
        .accessibilityIdentifier("kenos.watch.root")
    }
}

struct WatchTodayView: View {
    @ObservedObject var model: KenosWatchModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text("Kenos")
                    .font(.headline)
                    .accessibilityIdentifier("kenos.watch.brand")
                Text(model.glance.state.uppercased())
                    .font(.caption2)
                    .accessibilityIdentifier("kenos.watch.today.state")
                if let plan = model.glance.nextPlanTitle {
                    Text(plan)
                        .font(.title3.weight(.semibold))
                        .accessibilityIdentifier("kenos.watch.today.plan")
                }
                if let deliverable = model.glance.activeDeliverableTitle {
                    Text(deliverable)
                        .font(.body)
                        .accessibilityIdentifier("kenos.watch.today.work")
                }
                Text(inboxApprovalLine)
                    .font(.caption)
                    .accessibilityIdentifier("kenos.watch.today.counts")
                if let sync = model.glance.lastSync {
                    Text("Synced \(sync)")
                        .font(.caption2)
                }
                Button("Open on iPhone") {
                    model.openOnPhone(model.glance.nextPlanDeepLink ?? "kenos://today")
                }
                .accessibilityIdentifier("kenos.watch.today.handoff")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle("Today")
        .accessibilityIdentifier("kenos.watch.today")
    }

    private var inboxApprovalLine: String {
        let inbox = model.glance.pendingInboxCount.map(String.init) ?? "—"
        let approvals = model.glance.pendingApprovalCount.map(String.init) ?? "—"
        return "Inbox \(inbox) · Approvals \(approvals)"
    }
}

struct WatchCaptureView: View {
    @ObservedObject var model: KenosWatchModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Quick capture", text: $model.captureText)
                .accessibilityIdentifier("kenos.watch.capture.input")
            Button("Queue") {
                model.submitCapture()
            }
            .disabled(model.captureText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityIdentifier("kenos.watch.capture.submit")
            if let draft = model.lastCapture {
                let glance = KenosGlanceMapper.captureGlance(from: draft)
                Text(glance.safePreview)
                    .font(.caption)
                Text(glance.queueState)
                    .font(.caption2)
                    .accessibilityIdentifier("kenos.watch.capture.queue")
            }
            Text("Draft only · no Task auto-create")
                .font(.caption2)
        }
        .accessibilityIdentifier("kenos.watch.capture")
    }
}

struct WatchInboxView: View {
    @ObservedObject var model: KenosWatchModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Inbox")
                .font(.headline)
            Text(model.inboxCountLabel)
                .font(.largeTitle)
                .accessibilityIdentifier("kenos.watch.inbox.count")
            Text(model.glance.state == "unavailable" ? "Source unavailable" : "Pending items")
                .font(.caption)
            Button("Review on iPhone") {
                model.openOnPhone("kenos://inbox")
            }
        }
        .accessibilityIdentifier("kenos.watch.inbox")
    }
}

struct WatchApprovalsView: View {
    @ObservedObject var model: KenosWatchModel

    var body: some View {
        List {
            Text("Read-only · decision on iPhone")
                .font(.caption2)
            ForEach(model.approvals) { approval in
                VStack(alignment: .leading, spacing: 4) {
                    Text(approval.safeSummary)
                        .font(.headline)
                    Text("\(approval.risk.rawValue) · expires \(approval.expiry)")
                        .font(.caption2)
                    Button("Approve") {}
                        .disabled(!model.approvalsActionsEnabled)
                    Button("Open on iPhone") {
                        model.openOnPhone(approval.handoffDeepLink)
                    }
                }
                .accessibilityIdentifier("kenos.watch.approval.\(approval.id.uuidString)")
            }
        }
        .accessibilityIdentifier("kenos.watch.approvals")
    }
}

struct WatchActivityView: View {
    @ObservedObject var model: KenosWatchModel

    var body: some View {
        List {
            ForEach(model.activity) { item in
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.safeResult)
                    Text("\(item.success ? "succeeded" : "other") · \(item.domain.rawValue)")
                        .font(.caption2)
                }
                .accessibilityIdentifier("kenos.watch.activity.\(item.id.uuidString)")
            }
        }
        .accessibilityIdentifier("kenos.watch.activity")
    }
}
