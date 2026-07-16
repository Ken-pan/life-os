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
        ZStack {
            switch model.route {
            case .loading:
                loading
            case .signedOut:
                SignInView()
            case .home:
                HomeView()
            case .scanning:
                ScanView()
            case .reviewing:
                ReviewView()
            case .uploading:
                UploadView()
            }
        }
        // 整个 App 以前是 switch 硬切:登录→首页→扫描→预览→上传全靠瞬间闪现,
        // 人根本看不出「我是往前走了还是被弹回来了」。淡入淡出不是装饰 ——
        // 上传失败会把人从上传页弹回预览页,有过渡才读得出那是"退回来了"。
        //
        // 只用 opacity,不用滑动:route 不是线性的栈(上传失败→预览是"回退",
        // 恢复落盘扫描→预览是"前进"),滑错方向比不滑更误导。
        .animation(.easeInOut(duration: 0.28), value: model.route)
        .transition(.opacity)
    }

    /// 纯 ProgressView 在弱网下就是个「App 卡死了」的画面。等久了要说清楚
    /// 在等什么,并且给一条自己走的路 —— 干等是用户唯一无法自救的状态。
    private var loading: some View {
        VStack(spacing: HS.Space.snug) {
            ProgressView()
                .controlSize(.large)
            Text(model.bootstrapSlow ? "网络有点慢,还在恢复会话…" : "正在恢复会话…")
                .font(.footnote)
                .foregroundStyle(.secondary)
            if model.bootstrapSlow {
                Button("用账号密码登录") { model.route = .signedOut }
                    .buttonStyle(.glass)
                    .hsBigHit()
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .animation(.easeOut(duration: 0.2), value: model.bootstrapSlow)
        .accessibilityElement(children: .combine)
    }
}
