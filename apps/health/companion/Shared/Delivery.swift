import Foundation

/// 把聚合好的 [HealthDay] 交付给 Mac 代理。两条路,优先 iCloud(无需联网):
///  1. iCloud Drive:写 iCloud 容器 Documents/inbox/<ts>.json → 同步到 Mac →
///     代理 scanInbox() 摄入。无需和 Mac 同一 wifi,不暴露任何端口。
///  2. LAN 直连(可选):同一 wifi 下 POST 到 http://<mac-ip>:5193/ingest,近实时。
enum Delivery {
    /// iCloud Drive 交付(推荐)。容器 id 需与 Mac 代理 inboxDirs() 中的路径一致:
    /// iCloud.space.kenos.healthos
    static func writeICloud(_ days: [HealthDay]) -> Bool {
        guard let container = FileManager.default.url(
            forUbiquityContainerIdentifier: "iCloud.space.kenos.healthos") else { return false }
        let inbox = container.appendingPathComponent("Documents/inbox", isDirectory: true)
        try? FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        let payload: [String: Any] = ["days": days.map(\.payload)]
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return false }
        let name = "\(Int(Date().timeIntervalSince1970)).json"
        do { try data.write(to: inbox.appendingPathComponent(name)); return true } catch { return false }
    }

    /// LAN 直连交付(可选,需在同一网络且知道 Mac IP)
    static func postLAN(_ days: [HealthDay], macHost: String, port: Int = 5193) async -> Bool {
        guard let url = URL(string: "http://\(macHost):\(port)/ingest") else { return false }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["days": days.map(\.payload)])
        req.timeoutInterval = 5
        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            return (resp as? HTTPURLResponse)?.statusCode == 200
        } catch { return false }
    }
}
