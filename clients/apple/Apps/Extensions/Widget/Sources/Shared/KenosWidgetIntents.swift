import AppIntents
import Foundation
import KenosClient

/// Interactive Widget taps write a pending deep link, then open Kenos (`openAppWhenRun`).
/// Host consumes via `KenosWidgetGlanceBridge.consumePendingDeepLink`.
struct KenosWidgetCaptureIntent: AppIntent {
    nonisolated static let title: LocalizedStringResource = "Capture in Korben"
    nonisolated static let openAppWhenRun = true
    nonisolated static let description = IntentDescription("Open compose / capture in Korben.")

    @MainActor
    func perform() async throws -> some IntentResult {
        let store = KenosAppGroupStore(ownerId: nil)
        KenosWidgetGlanceBridge.postPendingDeepLink("kenos://compose", store: store)
        return .result()
    }
}

struct KenosWidgetStartTrainingIntent: AppIntent {
    nonisolated static let title: LocalizedStringResource = "Start Training"
    nonisolated static let openAppWhenRun = true
    nonisolated static let description = IntentDescription("Open Training workout in Korben.")

    @MainActor
    func perform() async throws -> some IntentResult {
        let store = KenosAppGroupStore(ownerId: nil)
        KenosWidgetGlanceBridge.postPendingDeepLink("kenos://training?path=/program", store: store)
        return .result()
    }
}

struct KenosWidgetOpenAssistantIntent: AppIntent {
    nonisolated static let title: LocalizedStringResource = "Open Ask"
    nonisolated static let openAppWhenRun = true
    nonisolated static let description = IntentDescription("Open Korben Ask.")

    @MainActor
    func perform() async throws -> some IntentResult {
        let store = KenosAppGroupStore(ownerId: nil)
        KenosWidgetGlanceBridge.postPendingDeepLink("kenos://assistant", store: store)
        return .result()
    }
}
