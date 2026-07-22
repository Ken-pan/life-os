import AppKit
import Combine
import SwiftUI

@main
struct KenosMacApp: App {
    @StateObject private var model = KenosAppModel()
    @StateObject private var menuBar = MenuBarCaptureController()

    var body: some Scene {
        // Single main window (MAC-P0-06): prefer/allow "*" so an open scene
        // always claims kenos:// URLs. Empty sets never match (Apple docs) and
        // caused LaunchServices to spawn duplicate windows on every open.
        Window("Kenos", id: "main") {
            // Owner Device Lock (Touch ID → exchange → SSO) is owned solely by
            // KenosRootView → AppModel.unlockShellAndHydrate — do not prompt here.
            KenosRootView(model: model)
                .handlesExternalEvents(preferring: ["*"], allowing: ["*"])
                .background(MacSettingsOpener())
                .onAppear {
                    NSWindow.allowsAutomaticWindowTabbing = false
                }
        }
        .defaultSize(width: 1180, height: 760)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Quick Capture…") {
                    model.openCapture()
                }
                .keyboardShortcut("n", modifiers: [.command])
            }
            CommandGroup(after: .toolbar) {
                Button("Reload") {
                    NotificationCenter.default.post(name: .kenosMacReloadWeb, object: nil)
                }
                .keyboardShortcut("r", modifiers: [.command])
            }
            CommandMenu("Kenos") {
                Button("Spaces…") { model.openSpaceShelf() }
                    .keyboardShortcut("s", modifiers: [.command, .shift])
                Divider()
                Button("Today") { model.selectMacSidebar(.today) }
                    .keyboardShortcut("1", modifiers: [.command])
                Button("Ask") { model.selectMacSidebar(.assistant) }
                    .keyboardShortcut("2", modifiers: [.command])
                Button("Inbox") { model.selectMacSidebar(.inbox) }
                    .keyboardShortcut("3", modifiers: [.command])
                Divider()
                Button("Work") { model.selectMacSidebar(.domain("work")) }
                Button("Plan") { model.selectMacSidebar(.domain("plan")) }
                Button("Training") { model.selectMacSidebar(.domain("training")) }
                Button("Money") { model.selectMacSidebar(.domain("money")) }
                Button("Approvals") { model.open(.approvals) }
                Button("Capture") { model.openCapture() }
                // ⌘, is owned by the Settings scene below (system convention).
                Button("Settings…") { model.presentSettings() }
                Divider()
                Button("Start Training Focus") { model.startTrainingFocus() }
                Button("Start Deep Work Focus") { model.startDeepWorkFocus() }
                Button("End Focus") { model.endFocus() }
                    .disabled(!model.focusStore.isForeground && !model.focusStore.showCompletedSummary)
            }
        }

        // MAC-P1-02: system Settings window (⌘,) — not a sidebar page.
        Settings {
            DailyBetaSettingsView(model: model)
                .frame(minWidth: 480, idealWidth: 520, minHeight: 420, idealHeight: 560)
        }

        MenuBarExtra(menuBarTitle, systemImage: menuBarSystemImage) {
            VStack(alignment: .leading, spacing: 10) {
                Text(focusStatusLine)
                    .font(.headline)
                    .accessibilityIdentifier("kenos.menubar.focus")

                HStack {
                    Text("Approvals")
                    Spacer()
                    Text("\(model.pendingApprovalCount)")
                        .foregroundStyle(model.pendingApprovalCount > 0 ? Color.orange : Color.secondary)
                        .monospacedDigit()
                }
                .font(.subheadline)
                .accessibilityIdentifier("kenos.menubar.approvals")

                if model.shellMode == .domain {
                    Text("In \(model.domainDisplayTitle)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("kenos.menubar.domain")
                }

                Divider()

                Text("Quick Capture")
                    .font(.subheadline.weight(.semibold))
                TextField("Draft only", text: $menuBar.draft)
                    .onSubmit {
                        guard !menuBar.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
                        model.captureText = menuBar.draft
                        model.submitCapture()
                        menuBar.draft = ""
                        model.openCapture()
                    }
                Button("Save local draft") {
                    model.captureText = menuBar.draft
                    model.submitCapture()
                    menuBar.draft = ""
                    model.openCapture()
                }
                .disabled(menuBar.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .keyboardShortcut(.defaultAction)

                Text("Local draft only · no Space write")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Divider()

                Button("Open Today") {
                    model.selectMacSidebar(.today)
                }
                Button("Open Inbox") {
                    model.selectMacSidebar(.inbox)
                }
                Button("Spaces…") {
                    model.openSpaceShelf()
                }
                if model.shellMode == .domain {
                    Button("Leave Space") {
                        model.returnToKenosFromDomain()
                        model.selectMacSidebar(.today)
                    }
                }
                if model.focusStore.isForeground || model.focusStore.isPaused {
                    Button("End Focus", role: .destructive) {
                        model.endFocus()
                    }
                }
            }
            .padding(12)
            .frame(width: 300)
        }
        .menuBarExtraStyle(.window)
    }

    private var menuBarTitle: String {
        if model.focusStore.isForeground || model.focusStore.isPaused {
            return "Kenos Focus"
        }
        if model.pendingApprovalCount > 0 {
            return "Kenos · \(model.pendingApprovalCount)"
        }
        return "Kenos"
    }

    private var menuBarSystemImage: String {
        if model.focusStore.isForeground || model.focusStore.isPaused {
            return "target"
        }
        if model.pendingApprovalCount > 0 {
            return "tray.full"
        }
        return "tray.and.arrow.down"
    }

    private var focusStatusLine: String {
        if let focus = model.focusStore.focus, model.focusStore.isForeground || model.focusStore.isPaused {
            let state = model.focusStore.isPaused ? "Paused" : "Focus"
            return "\(state) · \(focus.title)"
        }
        if model.focusStore.showCompletedSummary {
            return "Focus complete"
        }
        return "Focus idle"
    }
}

@MainActor
final class MenuBarCaptureController: ObservableObject {
    @Published var draft = ""
}

/// Bridges `model.presentSettings()` → system Settings scene (⌘,).
private struct MacSettingsOpener: View {
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
            .onReceive(NotificationCenter.default.publisher(for: .kenosOpenMacSettings)) { _ in
                openSettings()
            }
    }
}

