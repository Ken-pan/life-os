import SwiftUI

@main
struct KenosApp: App {
    @StateObject private var model = KenosAppModel()

    var body: some Scene {
        WindowGroup {
            KenosRootView(model: model)
                .privacySensitive()
        }
    }
}
