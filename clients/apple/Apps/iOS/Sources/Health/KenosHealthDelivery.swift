import Foundation

/// Deliver aggregated HealthKit days to the Mac Focus agent.
/// 1) iCloud Drive inbox (same container as HealthOS companion)
/// 2) LAN POST `http://<mac-host>:5193/ingest`
enum KenosHealthDelivery {
    static let iCloudContainer = "iCloud.space.kenos.healthos"
    static let agentPort = 5193

    static func writeICloud(_ days: [KenosHealthDay]) -> Bool {
        guard let container = FileManager.default.url(
            forUbiquityContainerIdentifier: iCloudContainer
        ) else { return false }
        let inbox = container.appendingPathComponent("Documents/inbox", isDirectory: true)
        try? FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        let payload: [String: Any] = ["days": days.map(\.payload)]
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return false }
        let name = "\(Int(Date().timeIntervalSince1970)).json"
        do {
            try data.write(to: inbox.appendingPathComponent(name))
            return true
        } catch {
            return false
        }
    }

    static func postLAN(_ days: [KenosHealthDay], macHost: String, port: Int = agentPort) async -> Bool {
        let host = macHost.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !host.isEmpty,
              let url = URL(string: "http://\(host):\(port)/ingest")
        else { return false }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["days": days.map(\.payload)])
        req.timeoutInterval = 5
        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            return (resp as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }

    /// Prefer Daily Beta shell host (same Mac) when no explicit override.
    static func preferredMacHost(override: String?) -> String {
        let trimmed = override?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !trimmed.isEmpty { return trimmed }
        return KenosDailyBetaConfig.kenOsOrigin.host ?? ""
    }
}
