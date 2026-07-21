import SwiftUI

@main
struct HomeScanApp: App {
    @State private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .task {
                    // 日志会话先立起来,后面 bootstrap 的失败才有处落
                    ScanLog.shared.beginSession(kind: "app", env: ScanLog.envSnapshot())
                    ScanLog.shared.markLaunch()
                    await model.bootstrap()
                    model.consumePendingDeepLinkIfReady()
                }
                .onChange(of: scenePhase) { _, phase in
                    // 进后台视作善终(iOS 随时可能无声回收后台进程,那不是事故);
                    // 回前台重新立 flag —— 前台死掉才是要追查的崩溃/OOM
                    switch phase {
                    case .background:
                        ScanLog.shared.log("app", "background")
                        ScanLog.shared.markCleanExit()
                    case .active:
                        ScanLog.shared.log("app", "active")
                        ScanLog.shared.markActive()
                        model.consumePendingDeepLinkIfReady()
                    default:
                        break
                    }
                }
                .onOpenURL { url in
                    model.handleDeepLink(url)
                }
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
        .onChange(of: model.route) { _, newRoute in
            if newRoute == .home {
                model.consumePendingDeepLinkIfReady()
            }
        }
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
