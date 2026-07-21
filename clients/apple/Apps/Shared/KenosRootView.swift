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
            if model.focusStore.showCompletedSummary {
                NavigationStack {
                    FocusSummaryView(model: model)
                }
            } else if model.hideGlobalNavForFocus || model.focusStore.isPaused {
                // Active hides global nav; paused keeps session chrome so Resume stays reachable.
                NavigationStack {
                    FocusSessionView(model: model)
                }
            } else {
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
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if model.focusStore.showReturnBanner {
                FocusReturnBanner(model: model)
            }
        }
        .sheet(isPresented: $model.showCaptureSheet) {
            NavigationStack {
                CaptureView(model: model)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Close") { model.showCaptureSheet = false }
                        }
                    }
            }
        }
        .sheet(isPresented: $model.showSpaceSwitcher) {
            SpaceSwitcherSheet(model: model)
        }
        .sheet(isPresented: $model.showSettingsSheet) {
            NavigationStack {
                DailyBetaSettingsView(model: model)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Close") { model.showSettingsSheet = false }
                        }
                    }
            }
        }
        .task { await model.bootstrap() }
        .onOpenURL { url in
            model.open(urlString: url.absoluteString)
        }
        #if os(iOS)
        .onReceive(NotificationCenter.default.publisher(for: .kenosOpenDomainContinuity)) { note in
            if let url = note.object as? URL {
                model.continuityURL = url
                model.showSpaceSwitcher = false
            }
        }
        .fullScreenCover(isPresented: Binding(
            get: { model.continuityURL != nil },
            set: { if !$0 { model.dismissContinuity() } }
        )) {
            NavigationStack {
                Group {
                    if let url = model.continuityURL {
                        KenosWebSurfaceView(url: url, stayInApp: true)
                            .ignoresSafeArea(edges: .bottom)
                    } else {
                        Color.clear
                    }
                }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") { model.dismissContinuity() }
                            .accessibilityIdentifier("kenos.continuity.done")
                    }
                }
                .navigationTitle(continuityTitle)
                .navigationBarTitleDisplayMode(.inline)
            }
        }
        #endif
    }

    #if os(iOS)
    private var continuityTitle: String {
        guard let url = model.continuityURL else { return "Continue" }
        let port = url.port
        if port == 5188 || (url.host ?? "").contains("planner") { return "Plan" }
        if port == 5190 || (url.host ?? "").contains("fitness") { return "Training" }
        return "Continue"
    }
    #endif

    #if os(iOS)
    private var iPhoneTabs: some View {
        TabView(selection: $model.selectedTab) {
            NavigationStack {
                Group {
                    if KenosDailyBetaConfig.isEnabled {
                        KenosDailyBetaSurface(path: model.dailyBetaPath(for: .today))
                    } else {
                        TodayView(model: model)
                    }
                }
                .toolbar { spaceSwitcherToolbar }
            }
            .tabItem { Label("Today", systemImage: "sun.max") }
            .tag(KenosAppModel.Tab.today)

            NavigationStack {
                Group {
                    if KenosDailyBetaConfig.isEnabled {
                        KenosDailyBetaSurface(path: model.dailyBetaPath(for: .assistant))
                    } else {
                        AssistantView(model: model)
                    }
                }
                .toolbar { spaceSwitcherToolbar }
            }
            .tabItem { Label("Assistant", systemImage: "bubble.left.and.bubble.right") }
            .tag(KenosAppModel.Tab.assistant)

            NavigationStack {
                Group {
                    if KenosDailyBetaConfig.isEnabled {
                        KenosDailyBetaSurface(path: model.dailyBetaPath(for: .spaces))
                    } else {
                        SpacesHubView(model: model)
                    }
                }
                .toolbar { spaceSwitcherToolbar }
            }
            .tabItem { Label("Spaces", systemImage: "square.grid.2x2") }
            .tag(KenosAppModel.Tab.spaces)

            NavigationStack {
                Group {
                    if KenosDailyBetaConfig.isEnabled {
                        KenosDailyBetaSurface(path: model.dailyBetaPath(for: .inbox))
                    } else {
                        InboxView(model: model)
                    }
                }
                .toolbar {
                    spaceSwitcherToolbar
                    ToolbarItem(placement: .primaryAction) {
                        Button("Settings", systemImage: "gearshape") {
                            model.presentSettings()
                        }
                    }
                }
            }
            .tabItem { Label("Inbox", systemImage: "tray") }
            .tag(KenosAppModel.Tab.inbox)
        }
        .accessibilityIdentifier("kenos.tabs")
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let live = model.liveAccessory {
                KenosLiveAccessoryBar(accessory: live) {
                    model.activateLiveAccessory(live)
                }
            }
        }
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
            Button {
                model.openQuickSwitch()
            } label: {
                Label("Quick Switch", systemImage: "magnifyingglass")
            }
            .labelStyle(.iconOnly)
            .accessibilityLabel("Quick Switch")
            .accessibilityHint("Search and jump to Spaces or recent objects")
            .accessibilityIdentifier("kenos.quickSwitch.trigger")
            Button {
                model.openSpaceSwitcher()
            } label: {
                Label("Switch Space", systemImage: "square.grid.2x2")
            }
            .labelStyle(.iconOnly)
            .accessibilityLabel("Switch Space")
            .accessibilityHint("Opens pinned and all Spaces without adding a fifth tab")
            .accessibilityIdentifier("kenos.spaceSwitcher.trigger")
        }
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
                    Button("Spaces", systemImage: "square.grid.2x2") { model.openSpaceSwitcher() }
                        .accessibilityIdentifier("kenos.spaceSwitcher.trigger")
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
                    Button("Spaces") { model.openSpaceSwitcher() }
                        .keyboardShortcut("s", modifiers: [.command, .shift])
                        .accessibilityIdentifier("kenos.spaceSwitcher.trigger")
                }
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

struct KenosLiveAccessoryBar: View {
    let accessory: KenosAppModel.LiveAccessory
    let onActivate: () -> Void

    var body: some View {
        Button(action: onActivate) {
            HStack(spacing: KenosSpacing.sm) {
                Image(systemName: accessory.kind == .focus ? "target" : "play.circle.fill")
                    .foregroundStyle(.primary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(accessory.title)
                        .font(KenosTypography.caption.weight(.semibold))
                        .lineLimit(1)
                    Text(accessory.subtitle)
                        .font(KenosTypography.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.up")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, KenosSpacing.md)
            .padding(.vertical, KenosSpacing.sm)
            .frame(maxWidth: .infinity)
            .background(.ultraThinMaterial)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("kenos.liveAccessory")
        .accessibilityLabel("\(accessory.title), \(accessory.subtitle)")
        .accessibilityHint("Returns to the running activity")
    }
}

struct FocusReturnBanner: View {
    @ObservedObject var model: KenosAppModel

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
                .accessibilityIdentifier("kenos.focus.return")
            Button("End") { model.endFocus() }
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
        case .hosted: return "hosted"
        case .external: return "external"
        case .comingSoon: return "coming soon"
        }
    }
}

struct SpaceSwitcherSheet: View {
    @ObservedObject var model: KenosAppModel
    @State private var query = ""

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
            .searchable(text: $query, prompt: searchPrompt)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { model.dismissSpaceChrome() }
                }
            }
            .accessibilityIdentifier(accessibilityId)
        }
        #if os(iOS)
        .presentationDetents(model.spaceChromeMode == .continueRecent ? [.medium, .large] : [.large, .medium])
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
        Section("All Domains") {
            ForEach(filteredCatalog) { entry in
                spaceRowWithPin(entry, meta: meta(for: entry))
            }
        }
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
        case .hosted: return "hosted"
        case .external: return "external"
        case .comingSoon: return "coming soon"
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

struct DailyBetaSettingsView: View {
    @ObservedObject var model: KenosAppModel
    @State private var originDraft = KenosDailyBetaConfig.kenOsOrigin.absoluteString

    var body: some View {
        Form {
            Section("Kenos shell origin") {
                TextField("http://10.x.x.x:5219", text: $originDraft)
                    #if os(iOS)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    #endif
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("kenos.settings.origin")
                Button("Save origin") {
                    if let url = URL(string: originDraft.trimmingCharacters(in: .whitespacesAndNewlines)),
                       url.host != "127.0.0.1",
                       url.host != "localhost"
                    {
                        KenosDailyBetaConfig.setUserOrigin(url)
                    }
                }
                .accessibilityIdentifier("kenos.settings.origin.save")
                Text("Current: \(KenosDailyBetaConfig.kenOsOrigin.absoluteString)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Section("Safety") {
                Text("Session tokens stay in Keychain (SecItem). Never paste tokens into this field or URLs.")
                    .font(.caption)
            }
            Section {
                Button("Sign out", role: .destructive) {
                    Task { await model.logout() }
                }
                .accessibilityIdentifier("kenos.settings.logout")
            }
        }
        .navigationTitle("Settings")
        .accessibilityIdentifier("kenos.settings")
    }
}

extension KenosAppModel {
    func presentSettings() {
        showSettingsSheet = true
    }
}

#Preview {
    KenosRootView(model: KenosAppModel())
}

#if os(iOS)
import UIKit
#endif
