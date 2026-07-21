import Foundation
import SwiftUI
import BackgroundTasks
#if canImport(UIKit)
import UIKit
#endif

/// Read HealthKit → cache locally → deliver to Mac agent (iCloud / LAN).
@MainActor
final class KenosHealthSyncer: ObservableObject {
    static let shared = KenosHealthSyncer()
    static let bgTaskID = "space.kenos.app.ios.health.sync"
    private static let cacheKey = "kenos.healthkit.days.v2"
    private static let macHostKey = "kenos.healthkit.macHost"
    /// Legacy: previously meant "auth sheet completed". Now means usable samples present.
    private static let authorizedKey = "kenos.healthkit.authorized"
    private static let authPromptedKey = "kenos.healthkit.authPrompted"
    private static let enabledKey = "kenos.healthkit.enabled.v1"
    private static let lookbackKey = "kenos.healthkit.lookbackDays"

    @Published var status: String = "Not synced"
    @Published var lastSync: Date?
    /// True when we hold usable day aggregates (cache or live sync) — not merely that the auth sheet ran.
    @Published var authorized = false
    /// User has completed the HealthKit permission sheet at least once.
    @Published private(set) var authPrompted = false
    @Published var dayCount = 0
    @Published var lastDays: [KenosHealthDay] = []
    @Published var available = KenosHealthKitReader.isAvailable
    @Published var coverage: [KenosHealthMetricID: Bool] = [:]
    @Published var lookbackDays: Int = UserDefaults.standard.object(forKey: KenosHealthSyncer.lookbackKey) as? Int ?? 14 {
        didSet {
            UserDefaults.standard.set(lookbackDays, forKey: Self.lookbackKey)
        }
    }

    /// Optional LAN override; empty → use Daily Beta origin host.
    @Published var macHost: String = UserDefaults.standard.string(forKey: KenosHealthSyncer.macHostKey) ?? "" {
        didSet { UserDefaults.standard.set(macHost, forKey: Self.macHostKey) }
    }

    /// Enabled metrics (core always forced on).
    @Published private(set) var enabledMetrics: Set<KenosHealthMetricID>

    private let reader = KenosHealthKitReader()

    private init() {
        let prompted =
            UserDefaults.standard.bool(forKey: Self.authPromptedKey)
            || UserDefaults.standard.bool(forKey: Self.authorizedKey)
        authPrompted = prompted
        enabledMetrics = Self.loadEnabledMetrics()
        if let cached = Self.loadCachedDays(), !cached.isEmpty {
            lastDays = cached
            dayCount = cached.count
            coverage = KenosHealthMetricCatalog.coverage(in: cached, enabled: enabledMetrics)
            authorized = true
            UserDefaults.standard.set(true, forKey: Self.authorizedKey)
        } else {
            authorized = false
            UserDefaults.standard.set(false, forKey: Self.authorizedKey)
        }
    }

    var enabledOptionalCount: Int {
        enabledMetrics.filter { !$0.isCore }.count
    }

    var coveredCount: Int {
        coverage.values.filter { $0 }.count
    }

    func isEnabled(_ id: KenosHealthMetricID) -> Bool {
        id.isCore || enabledMetrics.contains(id)
    }

    /// Toggle an optional metric. Re-requests authorization when turning on, then syncs.
    func setMetric(_ id: KenosHealthMetricID, enabled: Bool) async {
        guard !id.isCore else { return }
        if enabled {
            enabledMetrics.insert(id)
        } else {
            enabledMetrics.remove(id)
        }
        Self.saveEnabledMetrics(enabledMetrics)
        if enabled {
            await authorize(andSync: true)
        } else {
            coverage = KenosHealthMetricCatalog.coverage(in: lastDays, enabled: enabledMetrics)
            await sync()
        }
    }

    func authorize(andSync: Bool = false) async {
        guard available else {
            status = "HealthKit unavailable"
            KenosLog.warning("HealthKit unavailable", category: .health)
            return
        }
        do {
            try await reader.requestAuthorization(for: enabledMetrics)
            // HK does not report read grants; only a later sync proves usable data.
            authPrompted = true
            UserDefaults.standard.set(true, forKey: Self.authPromptedKey)
            status = authorized
                ? "Permission updated — syncing…"
                : "Permission requested — sync to verify access"
            KenosLog.breadcrumb("HealthKit auth sheet completed", category: .health, metadata: [
                "metrics": enabledMetrics.map(\.rawValue).sorted().joined(separator: ","),
                "hasCache": authorized ? "1" : "0",
            ])
            if andSync {
                await sync()
            }
        } catch {
            let detail = error.localizedDescription
            // Empty / stripped HealthKit entitlement never presents the system sheet.
            if detail.localizedCaseInsensitiveContains("entitlement")
                || detail.localizedCaseInsensitiveContains("authorization")
            {
                status =
                    "HealthKit entitlement missing or unsigned — enable HealthKit for this App ID, set a Development Team, rebuild, then tap Connect"
            } else {
                status = "Authorization failed: \(detail)"
            }
            KenosLog.error("HealthKit authorization failed", category: .health, metadata: [
                "error": detail,
            ])
        }
    }

    @discardableResult
    func sync(days: Int? = nil) async -> Bool {
        guard available else {
            status = "HealthKit unavailable"
            KenosLog.warning("Health sync skipped — unavailable", category: .health)
            return false
        }
        let window = days ?? lookbackDays
        status = "Reading Apple Health…"
        KenosLog.info("Health sync begin", category: .health, metadata: [
            "days": String(window),
            "metrics": String(enabledMetrics.count),
        ])
        let fetchStarted = ContinuousClock.now
        // Ensure auth sheet has been shown for current selection (idempotent).
        if !authPrompted {
            await authorize(andSync: false)
        }
        let fetched = await reader.fetchDays(window, metrics: enabledMetrics)
        let fetchMs = max(0, Int(fetchStarted.duration(to: ContinuousClock.now) / .milliseconds(1)))
        KenosLog.debug("healthkit.fetchDays ok", category: .health, metadata: [
            "days": String(window),
            "durationMs": String(fetchMs),
            "count": String(fetched.count),
        ])
        guard !fetched.isEmpty else {
            // Keep prior cache — empty reads often mean denied/partial permission or a glitch.
            if lastDays.isEmpty {
                authorized = false
                UserDefaults.standard.set(false, forKey: Self.authorizedKey)
                status = "No samples in the last \(window) days — check Health permissions"
            } else {
                authorized = true
                UserDefaults.standard.set(true, forKey: Self.authorizedKey)
                status =
                    "No new samples — kept \(lastDays.count)d cache. Check Health permissions if this persists."
            }
            KenosLog.notice("Health sync empty — cache preserved", category: .health, metadata: [
                "days": String(window),
                "cached": String(lastDays.count),
            ])
            return false
        }

        lastDays = fetched
        dayCount = fetched.count
        coverage = KenosHealthMetricCatalog.coverage(in: fetched, enabled: enabledMetrics)
        Self.saveCachedDays(fetched)
        authorized = true
        UserDefaults.standard.set(true, forKey: Self.authorizedKey)

        var via: [String] = []
        if KenosHealthDelivery.writeICloud(fetched) {
            via.append("iCloud")
        }
        let host = KenosHealthDelivery.preferredMacHost(override: macHost)
        if !host.isEmpty, await KenosHealthDelivery.postLAN(fetched, macHost: host) {
            via.append("LAN")
        }

        lastSync = Date()
        let covered = coveredCount
        let enabled = enabledMetrics.count
        if via.isEmpty {
            status = "Cached \(fetched.count)d · \(covered)/\(enabled) metrics (local)"
        } else {
            status = "Synced \(fetched.count)d · \(covered)/\(enabled) metrics via \(via.joined(separator: "+"))"
        }
        KenosLog.breadcrumb("Health sync complete", category: .health, metadata: [
            "dayCount": String(fetched.count),
            "covered": String(covered),
            "enabled": String(enabled),
            "via": via.isEmpty ? "local" : via.joined(separator: "+"),
        ])
        NotificationCenter.default.post(name: .kenosAppleHealthDidSync, object: nil)
        return true
    }

    func openSystemHealthSettings() {
        #if canImport(UIKit)
        // Prefer Health app; fall back to app Settings if scheme unavailable.
        if let health = URL(string: "x-apple-health://"),
           UIApplication.shared.canOpenURL(health)
        {
            UIApplication.shared.open(health)
            return
        }
        if let settings = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(settings)
        }
        #endif
    }

    /// Raw day aggregates — inject only into Health Continuity origins.
    func injectionJSON() -> String {
        let enabled = enabledMetrics.map(\.rawValue).sorted()
        let covered = coverage.compactMap { $0.value ? $0.key.rawValue : nil }.sorted()
        let payload: [String: Any] = [
            "source": "healthkit",
            "syncedAt": (lastSync ?? Date()).timeIntervalSince1970,
            "lookbackDays": lookbackDays,
            "enabledMetrics": enabled,
            "coveredMetrics": covered,
            "days": lastDays.map(\.payload),
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let raw = String(data: data, encoding: .utf8)
        else { return #"{"source":"healthkit","days":[]}"# }
        return raw
    }

    /// Privacy-safe readiness JSON object (or `null`) for Kenos shell / Health.
    func readinessInjectionJSON() -> String {
        KenosHealthReadinessNative.summaryJSON(
            days: lastDays.map(\.payload),
            now: Date(),
            source: "healthkit"
        )
    }

    static func registerBackgroundSync() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: bgTaskID, using: nil) { task in
            handleBackground(task as! BGAppRefreshTask)
        }
        scheduleBackgroundSync()
    }

    static func scheduleBackgroundSync() {
        let req = BGAppRefreshTaskRequest(identifier: bgTaskID)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 2 * 3600)
        try? BGTaskScheduler.shared.submit(req)
    }

    private static func handleBackground(_ task: BGAppRefreshTask) {
        scheduleBackgroundSync()
        let work = Task { @MainActor in
            _ = await KenosHealthSyncer.shared.sync()
            task.setTaskCompleted(success: true)
        }
        task.expirationHandler = { work.cancel() }
    }

    private static func defaultEnabledMetrics() -> Set<KenosHealthMetricID> {
        Set(KenosHealthMetricID.allCases.filter(\.defaultEnabled))
    }

    private static func loadEnabledMetrics() -> Set<KenosHealthMetricID> {
        guard let raw = UserDefaults.standard.array(forKey: enabledKey) as? [String] else {
            return defaultEnabledMetrics()
        }
        var set = Set(raw.compactMap(KenosHealthMetricID.init(rawValue:)))
        // Core always on.
        set.formUnion(KenosHealthMetricID.core)
        return set.isEmpty ? defaultEnabledMetrics() : set
    }

    private static func saveEnabledMetrics(_ set: Set<KenosHealthMetricID>) {
        let raw = set.map(\.rawValue).sorted()
        UserDefaults.standard.set(raw, forKey: enabledKey)
    }

    private static func saveCachedDays(_ days: [KenosHealthDay]) {
        guard let data = try? JSONEncoder().encode(days) else { return }
        UserDefaults.standard.set(data, forKey: cacheKey)
    }

    private static func loadCachedDays() -> [KenosHealthDay]? {
        if let data = UserDefaults.standard.data(forKey: cacheKey),
           let days = try? JSONDecoder().decode([KenosHealthDay].self, from: data)
        {
            return days
        }
        // Migrate v1 cache if present.
        if let data = UserDefaults.standard.data(forKey: "kenos.healthkit.days.v1"),
           let days = try? JSONDecoder().decode([KenosHealthDay].self, from: data)
        {
            return days
        }
        return nil
    }
}

extension Notification.Name {
    static let kenosAppleHealthDidSync = Notification.Name("kenos.appleHealth.didSync")
}
