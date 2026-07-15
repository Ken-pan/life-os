import SwiftUI

@main
struct HomeScanApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .task { await model.bootstrap() }
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        switch model.route {
        case .loading:
            ProgressView("正在恢复会话…")
        case .signedOut:
            SignInView()
        case .home, .scanning, .reviewing, .uploading:
            HomeView()
        }
    }
}
