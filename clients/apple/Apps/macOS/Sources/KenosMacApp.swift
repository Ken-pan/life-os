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
                    model.open(.capture)
                    model.selectedTab = .more
                }
                .keyboardShortcut("n", modifiers: [.command])
            }
            CommandMenu("Kenos") {
                Button("Today") { model.open(.today) }
                Button("Work") { model.open(.work) }
                Button("Inbox") { model.open(.inbox) }
                Button("System") { model.open(.system) }
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
                }
                .disabled(menuBar.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Text("Mock routing · no canonical write")
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
