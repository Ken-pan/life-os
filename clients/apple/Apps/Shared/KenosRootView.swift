import SwiftUI
import KenosClient
import KenosContracts
import KenosDesign
import KenosNotifications
import KenosStore

struct KenosRootView: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        Group {
            #if os(iOS)
            if UIDevice.current.userInterfaceIdiom == .pad {
                iPadSplit
            } else {
                iPhoneTabs
            }
            #else
            macSidebar
            #endif
        }
        .task { await model.bootstrap() }
        .onOpenURL { url in
            model.open(urlString: url.absoluteString)
        }
    }

    #if os(iOS)
    private var iPhoneTabs: some View {
        TabView(selection: $model.selectedTab) {
            NavigationStack { TodayView(model: model) }
                .tabItem { Label("Today", systemImage: "sun.max") }
                .tag(KenosAppModel.Tab.today)
            NavigationStack { AssistantView(model: model) }
                .tabItem { Label("Assistant", systemImage: "bubble.left.and.bubble.right") }
                .tag(KenosAppModel.Tab.assistant)
            NavigationStack { WorkHubView(model: model) }
                .tabItem { Label("Work", systemImage: "briefcase") }
                .tag(KenosAppModel.Tab.work)
            NavigationStack { InboxView(model: model) }
                .tabItem { Label("Inbox", systemImage: "tray") }
                .tag(KenosAppModel.Tab.inbox)
            NavigationStack { MoreView(model: model) }
                .tabItem { Label("More", systemImage: "ellipsis.circle") }
                .tag(KenosAppModel.Tab.more)
        }
        .accessibilityIdentifier("kenos.tabs")
    }

    private var iPadSplit: some View {
        NavigationSplitView {
            List(KenosAppModel.Tab.allCases, selection: Binding(
                get: { Optional(model.selectedTab) },
                set: { if let value = $0 { model.selectedTab = value } }
            )) { tab in
                Text(tab.title).tag(tab)
            }
            .navigationTitle("Kenos")
            .accessibilityIdentifier("kenos.ipad.sidebar")
        } detail: {
            detailForSelection
        }
    }
    #endif

    #if os(macOS)
    private var macSidebar: some View {
        NavigationSplitView {
            List(selection: Binding(
                get: { Optional(model.selectedTab) },
                set: { if let value = $0 { model.selectedTab = value } }
            )) {
                ForEach(KenosAppModel.Tab.allCases) { tab in
                    Text(tab.title).tag(tab)
                }
            }
            .navigationTitle("Kenos")
            .accessibilityIdentifier("kenos.mac.sidebar")
        } detail: {
            detailForSelection
        }
        .frame(minWidth: 900, minHeight: 600)
    }
    #endif

    @ViewBuilder
    private var detailForSelection: some View {
        switch model.selectedTab {
        case .today: TodayView(model: model)
        case .assistant: AssistantView(model: model)
        case .work: WorkHubView(model: model)
        case .inbox: InboxView(model: model)
        case .more: MoreView(model: model)
        }
    }
}

struct SurfaceChrome: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        Group {
            switch model.repository.state {
            case .loading:
                KenosStatusBanner(title: "Loading", detail: "Fetching domain projections", tone: .info)
            case .stale:
                KenosStatusBanner(title: "Stale", detail: "Showing cached projections · network unavailable", tone: .warning)
            case .unavailable:
                KenosStatusBanner(title: "Unavailable", detail: "No cache · source unavailable", tone: .danger)
            case .permissionDenied:
                KenosStatusBanner(title: "Permission denied", detail: "Owner boundary closed this surface", tone: .danger)
            case .sessionExpired:
                KenosStatusBanner(title: "Session expired", detail: "Sign in again · fail closed", tone: .danger)
            case .malformed:
                KenosStatusBanner(title: "Malformed payload", detail: "Fail closed · not shown as empty", tone: .danger)
            case .partial:
                KenosStatusBanner(title: "Partial", detail: "Some domains unavailable", tone: .warning)
            case .empty:
                KenosEmptyState(title: "Nothing for Today", detail: "Domains returned an authentic empty set.")
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
                Text("Kenos")
                    .font(.largeTitle.weight(.bold))
                    .accessibilityIdentifier("kenos.brand")
                Text("Today")
                    .font(KenosTypography.title)
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
                            title: message.role == .user ? "You" : "Assistant",
                            subtitle: message.text
                        )
                    }
                    if model.streaming {
                        KenosStatusBanner(title: "Streaming", detail: "Mock adapter", tone: .info)
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
        .navigationTitle("Assistant")
        .accessibilityIdentifier("kenos.assistant")
    }
}

struct InboxView: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        List {
            SurfaceChrome(model: model)
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
        .navigationTitle("Inbox")
        .accessibilityIdentifier("kenos.inbox")
    }
}

struct ApprovalsView: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        List {
            KenosStatusBanner(
                title: "Approvals are read-only",
                detail: "Production Executor off · buttons disabled",
                tone: .warning
            )
            ForEach(model.repository.snapshot.approvals, id: \.id) { approval in
                VStack(alignment: .leading, spacing: KenosSpacing.xs) {
                    KenosRow(
                        title: approval.safeSummary,
                        subtitle: "\(approval.actionType) · \(approval.risk.rawValue) · \(approval.status.rawValue)",
                        meta: "expires \(approval.expiresAt.rawValue)"
                    )
                    HStack {
                        Button("Approve") {}
                            .disabled(!model.approvalsActionsEnabled)
                        Button("Reject") {}
                            .disabled(!model.approvalsActionsEnabled)
                    }
                    .accessibilityIdentifier("kenos.approvals.actions.disabled")
                }
            }
        }
        .navigationTitle("Approvals")
        .accessibilityIdentifier("kenos.approvals")
    }
}

struct ActivityView: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        List {
            ForEach(model.repository.snapshot.activity) { item in
                KenosRow(
                    title: item.safeSummary,
                    subtitle: "\(item.result) · undo=\(item.undoAvailable ? "metadata" : "none")",
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

    var body: some View {
        Form {
            Section("Quick Capture") {
                TextField("Capture text", text: $model.captureText, axis: .vertical)
                    .lineLimit(3...6)
                    .accessibilityIdentifier("kenos.capture.input")
                Button("Save draft") {
                    model.submitCapture()
                }
                .disabled(model.captureText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityIdentifier("kenos.capture.submit")
            }
            if let draft = model.lastCapture {
                Section("Review") {
                    KenosRow(
                        title: "Local CaptureEnvelope draft",
                        subtitle: draft.text,
                        meta: "\(draft.queueStatus) · \(draft.correlationId.uuidString)"
                    )
                }
            }
            Section("Note") {
                Text("Does not auto-create Task/Project/Decision or upload clipboard secrets.")
                    .font(KenosTypography.caption)
            }
        }
        .navigationTitle("Capture")
        .accessibilityIdentifier("kenos.capture")
    }
}

struct SystemStatusView: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        List {
            KenosRow(
                title: "Local services",
                subtitle: "Mock API · File projection cache · Offline queue",
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

struct MoreView: View {
    @ObservedObject var model: KenosAppModel

    var body: some View {
        List {
            NavigationLink("Approvals", value: KenosAppModel.MoreDestination.approvals)
            NavigationLink("Activity", value: KenosAppModel.MoreDestination.activity)
            NavigationLink("Library links", value: KenosAppModel.MoreDestination.library)
            NavigationLink("Quick Capture", value: KenosAppModel.MoreDestination.capture)
            NavigationLink("System status", value: KenosAppModel.MoreDestination.system)
            NavigationLink("Settings", value: KenosAppModel.MoreDestination.settings)
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
            if !model.notificationInbox.isEmpty {
                Section("Notifications (mock)") {
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
        .navigationTitle("More")
        .accessibilityIdentifier("kenos.more")
        .navigationDestination(item: $model.moreDestination) { destination in
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
                    Text("Mock auth · tokens in Keychain abstraction only")
                    Text("Approvals actions: \(model.approvalsActionsEnabled ? "ON" : "OFF")")
                    Button("Simulate session expiry") {
                        Task {
                            await model.session.markExpired()
                            await model.repository.logoutClear()
                        }
                    }
                }
                .navigationTitle("Settings")
            }
        }
    }
}

#if os(iOS)
import UIKit
#endif
