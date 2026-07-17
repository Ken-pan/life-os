import SwiftUI
import BackgroundTasks

private let kSyncTaskID = "space.kenos.healthos.sync"

@main
struct HealthOSCompanionApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    var body: some Scene { WindowGroup { ContentView() } }
}

/// 注册后台刷新任务:系统会择机唤起,读 HealthKit 并交付,让 Mac 无需你打开 app 也能拿到最新数据。
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ app: UIApplication,
                     didFinishLaunchingWithOptions opts: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: kSyncTaskID, using: nil) { task in
            Self.handle(task as! BGAppRefreshTask)
        }
        Self.schedule()
        return true
    }

    static func schedule() {
        let req = BGAppRefreshTaskRequest(identifier: kSyncTaskID)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 2 * 3600) // 每 ~2 小时
        try? BGTaskScheduler.shared.submit(req)
    }

    static func handle(_ task: BGAppRefreshTask) {
        schedule() // 链式排下一次
        let syncer = Syncer()
        let work = Task { await syncer.sync(); task.setTaskCompleted(success: true) }
        task.expirationHandler = { work.cancel() }
    }
}

struct ContentView: View {
    @StateObject private var syncer = Syncer()

    var body: some View {
        NavigationStack {
            Form {
                Section("状态") {
                    Text(syncer.status).font(.callout)
                    if let last = syncer.lastSync {
                        Text("上次同步 \(last.formatted(date: .abbreviated, time: .shortened))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    if syncer.dayCount > 0 {
                        Text("\(syncer.dayCount) 天测量数据").font(.caption).foregroundStyle(.secondary)
                    }
                }
                Section("Mac 直连(可选)") {
                    TextField("Mac IP(留空只走 iCloud)", text: $syncer.macHost)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    Text("同一 wifi 下填 Mac 的局域网 IP 可近实时;否则走 iCloud Drive,几分钟内同步。")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section {
                    if !syncer.authorized {
                        Button("授权读取健康数据") { Task { await syncer.authorize() } }
                    }
                    Button("立即同步") { Task { await syncer.sync() } }
                        .disabled(!syncer.authorized)
                }
                Section {
                    Text("HealthOS 从 Apple Watch 被动读取睡眠、心率、HRV、活动量,自动推导你的状态——无需手动记录。授权一次后交给后台。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("HealthOS")
            .task { await syncer.authorize(); await syncer.sync() }
        }
    }
}
