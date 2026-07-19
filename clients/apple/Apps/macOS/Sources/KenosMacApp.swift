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
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Quick Capture…") {
                    model.openCapture()
                }
                .keyboardShortcut("n", modifiers: [.command])
            }
            CommandMenu("Kenos") {
                Button("Today") { model.open(.today) }
                Button("Assistant") { model.open(.assistant) }
                Button("Spaces") { model.selectedTab = .spaces }
                Button("Work") { model.open(.work) }
                Button("Inbox") { model.open(.inbox) }
                Button("Approvals") { model.open(.approvals) }
                Button("Capture") { model.openCapture() }
                Button("System") { model.open(.system) }
                Divider()
                Button("Start Training Focus") { model.startTrainingFocus() }
                Button("Start Deep Work Focus") { model.startDeepWorkFocus() }
                Button("End Focus") { model.endFocus() }
                    .disabled(!model.focusStore.isForeground && !model.focusStore.showCompletedSummary)
            }
        }

        MenuBarExtra("Kenos Capture", systemImage: "tray.and.arrow.down") {
            VStack(alignment: .leading, spacing: 8) {
                Text("Quick Capture")
                    .font(.headline)
                TextField("Draft only", text: $menuBar.draft)
                Button("Save local draft") {
                    model.captureText = menuBar.draft
                    model.submitCapture()
                    menuBar.draft = ""
                    model.openCapture()
                }
                .disabled(menuBar.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Text("Local draft only · no Space write")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(12)
            .frame(width: 280)
        }
        .menuBarExtraStyle(.window)
    }
}

@MainActor
final class MenuBarCaptureController: ObservableObject {
    @Published var draft = ""
}
