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
            NavigationStack {
                TodayView(model: model)
            }
            .tabItem { Label("Today", systemImage: "sun.max") }
            .tag(KenosAppModel.Tab.today)

            NavigationStack {
                AssistantView(model: model)
            }
            .tabItem { Label("Assistant", systemImage: "bubble.left.and.bubble.right") }
            .tag(KenosAppModel.Tab.assistant)

            NavigationStack {
                SpacesHubView(model: model)
            }
            .tabItem { Label("Spaces", systemImage: "square.grid.2x2") }
            .tag(KenosAppModel.Tab.spaces)

            NavigationStack {
                InboxView(model: model)
            }
            .tabItem { Label("Inbox", systemImage: "tray") }
            .tag(KenosAppModel.Tab.inbox)
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
            .toolbar {
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
            .toolbar {
                ToolbarItem {
                    Button("Capture") { model.openCapture() }
                        .keyboardShortcut("k", modifiers: [.command])
                }
            }
        } detail: {
            NavigationStack { detailForSelection }
        }
        .frame(minWidth: 900, minHeight: 600)
    }
    #endif

    @ViewBuilder
    private var detailForSelection: some View {
        switch model.selectedTab {
        case .today: TodayView(model: model)
        case .assistant: AssistantView(model: model)
        case .spaces: SpacesHubView(model: model)
        case .inbox: InboxView(model: model)
        }
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
                KenosStatusBanner(title: "Temporarily unavailable", detail: "Nothing cached for this surface", tone: .danger)
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
                Button("Settings", systemImage: "gearshape") {
                    model.presentSettings()
                }
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
                            title: message.role == .user ? "You" : "Assistant",
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
        .navigationTitle("Assistant")
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
            Section("Spaces") {
                NavigationLink("Work") {
                    WorkHubView(model: model)
                }
                .accessibilityIdentifier("kenos.spaces.work")
                KenosRow(title: "Training", subtitle: "Opens Fitness Space", meta: "external")
                KenosRow(title: "Money", subtitle: "Opens Finance Space", meta: "external")
                KenosRow(title: "Home", subtitle: "Opens Home Space", meta: "external")
                KenosRow(title: "Library", subtitle: "Documents and references", meta: "coming soon")
            }
        }
        .navigationTitle("Spaces")
        .navigationDestination(item: $model.spacesDestination) { destination in
            switch destination {
            case .work:
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
                Button("Settings") { model.inboxDestination = .settings }
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
            KenosStatusBanner(
                title: "Approvals not fully enabled",
                detail: "You can review requests; write actions stay off until enabled.",
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
                        title: "Local draft",
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

extension KenosAppModel {
    func presentSettings() {
        inboxDestination = nil
        selectedTab = .inbox
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 350_000_000)
            inboxDestination = .settings
        }
    }
}

#if os(iOS)
import UIKit
#endif
