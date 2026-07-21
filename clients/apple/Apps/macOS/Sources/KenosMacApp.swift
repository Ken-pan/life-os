import Combine
import SwiftUI

@main
struct KenosMacApp: App {
    @StateObject private var model = KenosAppModel()
    @StateObject private var menuBar = MenuBarCaptureController()

    var body: some Scene {
        WindowGroup {
            KenosRootView(model: model)
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
                Button("Command Bar…") {
                    model.openQuickSwitch()
                }
                .keyboardShortcut(" ", modifiers: [.command, .shift])
                Divider()
                Button("Today") { model.selectMacSidebar(.today) }
                    .keyboardShortcut("1", modifiers: [.command])
                Button("Assistant") { model.selectMacSidebar(.assistant) }
                    .keyboardShortcut("2", modifiers: [.command])
                Button("Inbox") { model.selectMacSidebar(.inbox) }
                    .keyboardShortcut("3", modifiers: [.command])
                Button("Spaces…") { model.openSpaceSwitcher() }
                    .keyboardShortcut("s", modifiers: [.command, .shift])
                Divider()
                Button("Work") { model.selectMacSidebar(.domain("work")) }
                Button("Plan") { model.selectMacSidebar(.domain("plan")) }
                Button("Training") { model.selectMacSidebar(.domain("training")) }
                Button("Money") { model.selectMacSidebar(.domain("money")) }
                Button("Approvals") { model.open(.approvals) }
                Button("Capture") { model.openCapture() }
                Button("Settings") { model.selectMacSidebar(.settings) }
                    .keyboardShortcut(",", modifiers: [.command])
                Divider()
                Button("Start Training Focus") { model.startTrainingFocus() }
                Button("Start Deep Work Focus") { model.startDeepWorkFocus() }
                Button("End Focus") { model.endFocus() }
                    .disabled(!model.focusStore.isForeground && !model.focusStore.showCompletedSummary)
            }
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
                Button("Command Bar…") {
                    model.openQuickSwitch()
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
