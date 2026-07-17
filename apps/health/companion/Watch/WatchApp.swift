import SwiftUI
import HealthKit

/// watchOS 表侧 app:腕上一瞥当前 HealthOS 状态 + 手动触发一次同步。
/// 数据采集主力在 iPhone(Watch 的数据已自动同步到手机健康库);此 target 主要给
/// 表盘 complication 和腕上快速触发用。iCloud 交付逻辑与 iPhone 共用 Shared/。
@main
struct HealthOSWatchApp: App {
    var body: some Scene { WindowGroup { WatchRootView() } }
}

@MainActor
final class WatchSyncer: ObservableObject {
    @Published var status = "点一下同步"
    private let reader = HealthKitReader()

    func sync() async {
        status = "读取中…"
        do { try await reader.requestAuthorization() } catch { status = "需在 iPhone 授权"; return }
        let days = await reader.fetchDays(7)
        guard !days.isEmpty else { status = "暂无数据"; return }
        status = Delivery.writeICloud(days) ? "已交付 \(days.count) 天" : "交付失败"
    }
}

struct WatchRootView: View {
    @StateObject private var syncer = WatchSyncer()
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "figure.mind.and.body").font(.largeTitle)
            Text("HealthOS").font(.headline)
            Text(syncer.status).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Button("同步") { Task { await syncer.sync() } }
        }
        .padding()
    }
}
