import Foundation
import SwiftUI

/// 读 HealthKit → 交付 Mac 的一次同步动作。前台按钮触发,后台 BGTask 触发。
@MainActor
final class Syncer: ObservableObject {
    @Published var status: String = "尚未同步"
    @Published var lastSync: Date?
    @Published var authorized = false
    @Published var dayCount = 0

    /// LAN 直连的 Mac 主机名/IP;留空则只走 iCloud。存 UserDefaults。
    @AppStorage("macHost") var macHost: String = ""

    private let reader = HealthKitReader()

    func authorize() async {
        do {
            try await reader.requestAuthorization()
            authorized = true
            status = "已授权,准备同步"
        } catch {
            status = "HealthKit 授权失败:\(error.localizedDescription)"
        }
    }

    func sync() async {
        status = "读取健康数据…"
        let days = await reader.fetchDays(14)
        dayCount = days.count
        guard !days.isEmpty else { status = "近 14 天无数据"; return }

        var ok = false
        var via = ""
        if Delivery.writeICloud(days) { ok = true; via = "iCloud" }
        if !macHost.isEmpty, await Delivery.postLAN(days, macHost: macHost) { ok = true; via = via.isEmpty ? "LAN" : "\(via)+LAN" }

        if ok {
            lastSync = Date()
            status = "已交付 \(days.count) 天(\(via))"
        } else {
            status = "交付失败:检查 iCloud 登录或 Mac IP"
        }
    }
}
