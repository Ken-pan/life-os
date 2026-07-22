#if os(macOS)
import KenosClient
import SwiftUI

// MARK: - Theme

/// Mac Command Center visual constants.
/// The web shell forces its canvas to #08090a on Mac (KenosMacWebSurfaceView CSS),
/// so native chrome is dark-only and must share the same canvas + accent.
enum KenosMacTheme {
    /// Matches `underPageBackgroundColor` and the injected `background:#08090a` web CSS.
    static let canvas = Color(red: 0.031, green: 0.035, blue: 0.039)
    /// Kenos accent — same value as the sidebar Kenos rows.
    static let accent = Color(red: 0.357, green: 0.549, blue: 1.0)
    /// Raised surface for fields / cards on the canvas.
    static let raised = Color.white.opacity(0.06)
    /// Hairline stroke for cards / fields.
    static let hairline = Color.white.opacity(0.09)

    static let panelCornerRadius: CGFloat = 10
}

/// Detail surfaces (shell / domain WK) blend the titlebar into the dark canvas.
struct KenosMacSeamlessChrome: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(KenosMacTheme.canvas)
            .toolbarBackground(.hidden, for: .windowToolbar)
    }
}

extension View {
    func kenosMacSeamlessChrome() -> some View {
        modifier(KenosMacSeamlessChrome())
    }
}

// MARK: - Quick Capture panel

/// Mac Quick Capture — a focused quick-entry panel (⌘N), not a settings Form.
struct KenosMacCapturePanel: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.dismiss) private var dismiss
    @FocusState private var draftFocused: Bool
    @State private var successPulse = 0

    private var draftEmpty: Bool {
        model.captureText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Label {
                    Text("Quick Capture")
                        .font(.title3.weight(.semibold))
                } icon: {
                    Image(systemName: "square.and.pencil")
                        .foregroundStyle(KenosMacTheme.accent)
                }
                Spacer()
                Text("⌘N")
                    .font(.caption.monospaced())
                    .foregroundStyle(.tertiary)
            }
            .padding(.bottom, 12)

            TextField("What's on your mind?", text: $model.captureText, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.body)
                .lineLimit(4...8)
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: KenosMacTheme.panelCornerRadius, style: .continuous)
                        .fill(KenosMacTheme.raised)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: KenosMacTheme.panelCornerRadius, style: .continuous)
                        .stroke(
                            draftFocused ? KenosMacTheme.accent.opacity(0.55) : KenosMacTheme.hairline,
                            lineWidth: 1
                        )
                )
                .focused($draftFocused)
                .accessibilityIdentifier("kenos.capture.input")

            Text("Saves a local draft only — no Task/Project/Decision is created.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.top, 8)

            if let draft = model.lastCapture {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    Text(draft.text)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Spacer(minLength: 12)
                    Text(draft.queueStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .font(.callout)
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: KenosMacTheme.panelCornerRadius, style: .continuous)
                        .fill(KenosMacTheme.raised.opacity(0.6))
                )
                .padding(.top, 12)
                .accessibilityElement(children: .combine)
            }

            Spacer(minLength: 16)

            HStack {
                Button("Close") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Spacer()
                Button("Save draft") {
                    model.submitCapture()
                    successPulse += 1
                }
                .buttonStyle(.borderedProminent)
                .tint(KenosMacTheme.accent)
                .keyboardShortcut(.defaultAction)
                .disabled(draftEmpty)
                .accessibilityIdentifier("kenos.capture.submit")
            }
        }
        .padding(20)
        .frame(minWidth: 440, idealWidth: 480, minHeight: 300, idealHeight: 320)
        .accessibilityIdentifier("kenos.capture")
        .sensoryFeedback(.success, trigger: successPulse)
        .onAppear { draftFocused = true }
    }
}

// MARK: - Space Switcher panel

/// Mac Switch Space / Continue — accent-tinted Space grid + filter, not an empty list.
struct KenosMacSpaceSwitcherPanel: View {
    @ObservedObject var model: KenosAppModel
    @State private var query = ""
    @FocusState private var searchFocused: Bool

    private var mode: KenosAppModel.SpaceChromeMode { model.spaceChromeMode }

    private var title: String {
        switch mode {
        case .continueRecent: return "Continue"
        case .switchSpace: return "Switch Space"
        case .quickSwitch: return "Quick Switch"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 12)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if mode != .switchSpace, !filteredResume.isEmpty {
                        section("Resume") {
                            VStack(spacing: 4) {
                                ForEach(filteredResume, id: \.key) { item in
                                    resumeRow(item)
                                }
                            }
                        }
                    }
                    if mode == .continueRecent, !filteredRecent.isEmpty {
                        section("Recent Spaces") {
                            spaceGrid(filteredRecent)
                        }
                    }
                    if mode != .continueRecent {
                        if !filteredPinned.isEmpty {
                            section("Pinned") {
                                spaceGrid(filteredPinned)
                            }
                        }
                        section("Spaces") {
                            spaceGrid(filteredCatalog)
                        }
                        section("System") {
                            systemRow
                        }
                    }
                    if emptyResults {
                        Text("No matches for “\(query)”.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.vertical, 24)
                    }
                }
                .padding(20)
            }

            Divider()

            HStack {
                Text("Return opens the first match · ⌥ click to pin")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                Spacer()
                Button("Close") { model.dismissSpaceChrome() }
                    .keyboardShortcut(.cancelAction)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .frame(minWidth: 520, idealWidth: 560, minHeight: 480, idealHeight: 560)
        .accessibilityIdentifier(accessibilityId)
        .onAppear { searchFocused = true }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.title3.weight(.semibold))
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField(mode == .continueRecent ? "Filter recent" : "Filter Spaces", text: $query)
                    .textFieldStyle(.plain)
                    .focused($searchFocused)
                    .onSubmit(openFirstMatch)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: KenosMacTheme.panelCornerRadius, style: .continuous)
                    .fill(KenosMacTheme.raised)
            )
            .overlay(
                RoundedRectangle(cornerRadius: KenosMacTheme.panelCornerRadius, style: .continuous)
                    .stroke(
                        searchFocused ? KenosMacTheme.accent.opacity(0.55) : KenosMacTheme.hairline,
                        lineWidth: 1
                    )
            )
        }
    }

    @ViewBuilder
    private func section(_ label: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .kerning(0.6)
            content()
        }
    }

    private func spaceGrid(_ entries: [KenosAppModel.SpaceCatalogEntry]) -> some View {
        LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 156, maximum: 220), spacing: 10)],
            alignment: .leading,
            spacing: 10
        ) {
            ForEach(entries) { entry in
                KenosMacSpaceCard(
                    entry: entry,
                    isCurrent: model.recentSpaceIds.first == entry.id
                        || model.spacesDestination?.rawValue == entry.id,
                    isPinned: model.pinnedSpaceIds.contains(entry.id),
                    open: { model.openSpace(entry) },
                    togglePin: { model.togglePinnedSpace(id: entry.id) }
                )
            }
        }
    }

    private var systemRow: some View {
        HStack(spacing: 10) {
            ForEach([KenosAppModel.Tab.today, .assistant, .inbox]) { tab in
                Button {
                    model.returnToSystem(tab)
                } label: {
                    Label(tab.title, systemImage: systemIcon(for: tab))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(
                            Capsule(style: .continuous).fill(KenosMacTheme.raised)
                        )
                        .overlay(
                            Capsule(style: .continuous).stroke(KenosMacTheme.hairline, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func systemIcon(for tab: KenosAppModel.Tab) -> String {
        switch tab {
        case .today: return "sun.max"
        case .assistant: return "bubble.left.and.bubble.right"
        case .inbox: return "tray"
        case .spaces: return "square.grid.2x2"
        case .settings: return "gearshape"
        }
    }

    private func resumeRow(
        _ item: (key: String, descriptor: KenosSpaceSwitcherStore.ResumeDescriptor)
    ) -> some View {
        Button {
            model.continueSpace(listKey: item.key)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "clock.arrow.circlepath")
                    .foregroundStyle(KenosMacTheme.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.descriptor.displayTitle)
                        .font(.callout.weight(.medium))
                    Text(item.descriptor.displaySubtitle ?? item.descriptor.spaceId)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                Text(item.descriptor.isExpired ? "expired → home" : "resume")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: KenosMacTheme.panelCornerRadius, style: .continuous)
                    .fill(KenosMacTheme.raised.opacity(0.6))
            )
            .contentShape(RoundedRectangle(cornerRadius: KenosMacTheme.panelCornerRadius, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("kenos.continue.\(item.descriptor.spaceId)")
    }

    // MARK: filtering

    private var accessibilityId: String {
        switch mode {
        case .continueRecent: return "kenos.continue.sheet"
        case .switchSpace: return "kenos.spaceSwitcher"
        case .quickSwitch: return "kenos.quickSwitch"
        }
    }

    private var emptyResults: Bool {
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        switch mode {
        case .continueRecent:
            return filteredResume.isEmpty && filteredRecent.isEmpty
        case .switchSpace, .quickSwitch:
            return filteredResume.isEmpty && filteredPinned.isEmpty && filteredCatalog.isEmpty
        }
    }

    private func matches(_ text: String) -> Bool {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return true }
        return text.localizedCaseInsensitiveContains(q)
    }

    private var filteredResume: [(key: String, descriptor: KenosSpaceSwitcherStore.ResumeDescriptor)] {
        guard mode != .switchSpace else { return [] }
        return model.spaceSwitcherStore.resumeByListKey
            .map { (key: $0.key, descriptor: $0.value) }
            .sorted { $0.descriptor.updatedAt > $1.descriptor.updatedAt }
            .filter {
                matches($0.descriptor.displayTitle)
                    || matches($0.descriptor.displaySubtitle ?? "")
                    || matches($0.descriptor.spaceId)
            }
    }

    private var filteredRecent: [KenosAppModel.SpaceCatalogEntry] {
        model.recentSpaceIds
            .compactMap { id in KenosAppModel.spaceCatalog.first { $0.id == id } }
            .filter { matches($0.title) || matches($0.subtitle) }
    }

    private var filteredPinned: [KenosAppModel.SpaceCatalogEntry] {
        model.pinnedSpaceIds
            .compactMap { id in KenosAppModel.spaceCatalog.first { $0.id == id } }
            .filter { matches($0.title) || matches($0.subtitle) }
    }

    private var filteredCatalog: [KenosAppModel.SpaceCatalogEntry] {
        KenosAppModel.spaceCatalog.filter { matches($0.title) || matches($0.subtitle) }
    }

    private func openFirstMatch() {
        if let resume = filteredResume.first, mode != .switchSpace {
            model.continueSpace(listKey: resume.key)
            return
        }
        if let entry = filteredPinned.first ?? filteredCatalog.first ?? filteredRecent.first {
            model.openSpace(entry)
        }
    }
}

/// One Space card — accent icon plate + title/subtitle; ⌥click or hover star to pin.
private struct KenosMacSpaceCard: View {
    let entry: KenosAppModel.SpaceCatalogEntry
    let isCurrent: Bool
    let isPinned: Bool
    let open: () -> Void
    let togglePin: () -> Void

    @State private var hovering = false

    private var accent: Color {
        KenosDomainRegistry.accentColor(for: entry.id)
    }

    private var icon: String {
        KenosDomainRegistry.definition(for: entry.id)?.systemImage ?? "app"
    }

    private var comingSoon: Bool {
        entry.kind == .comingSoon
    }

    var body: some View {
        Button {
            if NSEvent.modifierFlags.contains(.option) {
                togglePin()
            } else {
                open()
            }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(accent)
                    .frame(width: 30, height: 30)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(accent.opacity(0.16))
                    )
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 4) {
                        Text(entry.title)
                            .font(.callout.weight(.medium))
                            .lineLimit(1)
                        if isCurrent {
                            Circle()
                                .fill(accent)
                                .frame(width: 5, height: 5)
                                .accessibilityLabel("Current Space")
                        }
                    }
                    Text(comingSoon ? "Coming soon" : entry.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if hovering || isPinned {
                    Button {
                        togglePin()
                    } label: {
                        Image(systemName: isPinned ? "star.fill" : "star")
                            .font(.system(size: 11))
                            .foregroundStyle(isPinned ? Color.yellow : Color.secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(isPinned ? "Unpin \(entry.title)" : "Pin \(entry.title)")
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: KenosMacTheme.panelCornerRadius, style: .continuous)
                    .fill(hovering ? KenosMacTheme.raised : KenosMacTheme.raised.opacity(0.55))
            )
            .overlay(
                RoundedRectangle(cornerRadius: KenosMacTheme.panelCornerRadius, style: .continuous)
                    .stroke(isCurrent ? accent.opacity(0.4) : KenosMacTheme.hairline, lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: KenosMacTheme.panelCornerRadius, style: .continuous))
            .opacity(comingSoon ? 0.55 : 1)
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.12), value: hovering)
    }
}

// MARK: - Menu Bar panel

/// Menu Bar Extra content — status, quick draft, and shortcuts in one compact panel.
struct KenosMenuBarPanel: View {
    @ObservedObject var model: KenosAppModel
    @ObservedObject var menuBar: MenuBarCaptureController

    private var draftEmpty: Bool {
        menuBar.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var focusActive: Bool {
        model.focusStore.isForeground || model.focusStore.isPaused
    }

    private var focusStatusLine: String {
        if let focus = model.focusStore.focus, focusActive {
            let state = model.focusStore.isPaused ? "Paused" : "Focus"
            return "\(state) · \(focus.title)"
        }
        if model.focusStore.showCompletedSummary {
            return "Focus complete"
        }
        return "Focus idle"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Status
            HStack(spacing: 8) {
                Image(systemName: focusActive ? "target" : "moon.zzz")
                    .foregroundStyle(focusActive ? KenosMacTheme.accent : .secondary)
                Text(focusStatusLine)
                    .font(.subheadline.weight(.semibold))
                Spacer()
                if model.pendingApprovalCount > 0 {
                    Label("\(model.pendingApprovalCount)", systemImage: "checkmark.seal")
                        .font(.caption.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(.orange)
                        .labelStyle(.titleAndIcon)
                        .accessibilityLabel("\(model.pendingApprovalCount) pending approvals")
                }
            }
            .accessibilityIdentifier("kenos.menubar.focus")

            if model.shellMode == .domain {
                Text("In \(model.domainDisplayTitle)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.top, 2)
                    .accessibilityIdentifier("kenos.menubar.domain")
            }

            // Quick draft
            HStack(spacing: 6) {
                Image(systemName: "square.and.pencil")
                    .foregroundStyle(.secondary)
                    .font(.system(size: 12))
                TextField("Quick draft…", text: $menuBar.draft)
                    .textFieldStyle(.plain)
                    .font(.callout)
                    .onSubmit(saveDraft)
                Button("Save") { saveDraft() }
                    .controlSize(.small)
                    .disabled(draftEmpty)
                    .keyboardShortcut(.defaultAction)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.primary.opacity(0.06))
            )
            .padding(.top, 10)

            Text("Local draft only · no Space write")
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .padding(.top, 4)

            Divider()
                .padding(.vertical, 8)

            // Shortcuts
            VStack(alignment: .leading, spacing: 2) {
                menuRow("Open Today", systemImage: "sun.max") {
                    model.selectMacSidebar(.today)
                }
                menuRow("Open Inbox", systemImage: "tray") {
                    model.selectMacSidebar(.inbox)
                }
                menuRow("Spaces…", systemImage: "square.grid.2x2") {
                    model.openSpaceShelf()
                }
                if model.shellMode == .domain {
                    menuRow("Leave Space", systemImage: "arrow.uturn.backward") {
                        model.returnToKenosFromDomain()
                        model.selectMacSidebar(.today)
                    }
                }
                if focusActive {
                    menuRow("End Focus", systemImage: "stop.circle", role: .destructive) {
                        model.endFocus()
                    }
                }
            }
        }
        .padding(12)
        .frame(width: 300)
    }

    private func saveDraft() {
        guard !draftEmpty else { return }
        model.captureText = menuBar.draft
        model.submitCapture()
        menuBar.draft = ""
        model.openCapture()
    }

    private func menuRow(
        _ title: String,
        systemImage: String,
        role: ButtonRole? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(role: role, action: action) {
            Label(title, systemImage: systemImage)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(KenosMenuRowButtonStyle())
    }
}

/// Hover-highlight row style matching system menu items.
private struct KenosMenuRowButtonStyle: ButtonStyle {
    @State private var hovering = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(hovering ? Color.primary.opacity(0.08) : .clear)
            )
            .opacity(configuration.isPressed ? 0.7 : 1)
            .onHover { hovering = $0 }
    }
}
#endif
