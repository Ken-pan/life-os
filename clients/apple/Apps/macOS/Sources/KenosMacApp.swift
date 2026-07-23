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
        Window("Korben", id: "main") {
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
            CommandMenu("Korben") {
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
            // NavigationStack so the Advanced NavigationLink can push.
            NavigationStack {
                DailyBetaSettingsView(model: model)
            }
            .formStyle(.grouped)
            .frame(minWidth: 520, idealWidth: 560, minHeight: 480, idealHeight: 600)
            // Content canvas is dark-only on Mac (web forces #08090a) — match it.
            .preferredColorScheme(.dark)
        }

        MenuBarExtra(menuBarTitle, systemImage: menuBarSystemImage) {
            KenosMenuBarPanel(model: model, menuBar: menuBar)
        }
        .menuBarExtraStyle(.window)
    }

    private var menuBarTitle: String {
        if model.focusStore.isForeground || model.focusStore.isPaused {
            return "Korben Focus"
        }
        if model.pendingApprovalCount > 0 {
            return "Korben · \(model.pendingApprovalCount)"
        }
        return "Korben"
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

