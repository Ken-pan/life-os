#if os(iOS)
import Foundation

/// Uploads redacted Kenos native logs to Supabase (`kenos_ingest_app_logs`).
@MainActor
final class KenosLogCloudSync: ObservableObject {
    static let shared = KenosLogCloudSync()

    private static let enabledKey = "kenos.log.cloudUploadEnabled"
    private static let minLevelKey = "kenos.log.cloudMinLevel"
    private static let lastUploadAtKey = "kenos.log.lastUploadAt"
    private static let lastErrorKey = "kenos.log.lastUploadError"
    private static let uploadedIdsKey = "kenos.log.uploadedIds"

    @Published var isUploading = false
    @Published var lastUploadAt: Date?
    @Published var lastUploadError: String?
    @Published var lastInsertedCount: Int = 0
    @Published var pendingCount: Int = 0

    /// Default on for personal dogfood — requires web shell sign-in JWT.
    @Published var enabled: Bool {
        didSet {
            UserDefaults.standard.set(enabled, forKey: Self.enabledKey)
            if enabled, !oldValue {
                kick(reason: "enabled")
            }
        }
    }

    /// Minimum level sent to Supabase (local disk can still keep debug).
    @Published var cloudMinLevel: KenosLogLevel {
        didSet {
            UserDefaults.standard.set(cloudMinLevel.label.lowercased(), forKey: Self.minLevelKey)
            refreshPendingCount()
        }
    }

    private var uploadedIds: Set<String>
    private var autoTask: Task<Void, Never>?
    private var contentReadyObserver: NSObjectProtocol?
    private var cachedAuth: KenosWebAuthSession?
    private var cachedAuthAt: Date?
    private var lastKickAt: Date?
    private var lastNoAuthLogAt: Date?
    private let maxBatch = 100
    private let maxUploadedIdMemory = 4_000
    private let maxDrainRounds = 8
    private let authCacheTTL: TimeInterval = 50 * 60
    private let minKickInterval: TimeInterval = 6
    private let pollIntervalNanoseconds: UInt64 = 45_000_000_000

    private init() {
        if UserDefaults.standard.object(forKey: Self.enabledKey) == nil {
            enabled = true
        } else {
            enabled = UserDefaults.standard.bool(forKey: Self.enabledKey)
        }
        if let raw = UserDefaults.standard.string(forKey: Self.minLevelKey),
           let level = KenosLogLevel.parse(raw)
        {
            cloudMinLevel = level
        } else {
            cloudMinLevel = .notice
        }
        lastUploadAt = UserDefaults.standard.object(forKey: Self.lastUploadAtKey) as? Date
        lastUploadError = UserDefaults.standard.string(forKey: Self.lastErrorKey)
        let saved = UserDefaults.standard.stringArray(forKey: Self.uploadedIdsKey) ?? []
        uploadedIds = Set(saved)
        refreshPendingCount()
    }

    func startAutoSync() {
        autoTask?.cancel()
        if let contentReadyObserver {
            NotificationCenter.default.removeObserver(contentReadyObserver)
            self.contentReadyObserver = nil
        }

        contentReadyObserver = NotificationCenter.default.addObserver(
            forName: .kenosFirstContentReady,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.kick(reason: "first-content")
            }
        }

        autoTask = Task { @MainActor in
            // Warm-up: try a few times while WKWebView auth becomes readable.
            let startupDelays: [UInt64] = [
                3_000_000_000,
                8_000_000_000,
                18_000_000_000,
            ]
            var elapsed: UInt64 = 0
            for delay in startupDelays {
                let wait = delay > elapsed ? delay - elapsed : 0
                if wait > 0 {
                    try? await Task.sleep(nanoseconds: wait)
                    elapsed = delay
                }
                guard !Task.isCancelled, enabled else { break }
                let result = await uploadPending(reason: "startup")
                if case .success = result { break }
                if case .skipped(let reason) = result, reason == "Nothing pending" { break }
            }

            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: pollIntervalNanoseconds)
                guard enabled, !isUploading else { continue }
                _ = await uploadPending(reason: "auto")
            }
        }
        KenosLog.debug("cloud auto-sync started", category: .cloud)
    }

    func stopAutoSync() {
        autoTask?.cancel()
        autoTask = nil
        if let contentReadyObserver {
            NotificationCenter.default.removeObserver(contentReadyObserver)
            self.contentReadyObserver = nil
        }
    }

    /// Drop cached JWT after logout so uploads stop until the next sign-in.
    func clearCachedAuth() {
        cachedAuth = nil
        cachedAuthAt = nil
    }

    /// Opportunistic upload when auth / surface is likely ready.
    func kick(reason: String) {
        guard enabled else { return }
        let now = Date()
        if reason != "background",
           let lastKickAt,
           now.timeIntervalSince(lastKickAt) < minKickInterval
        {
            return
        }
        lastKickAt = now
        Task { @MainActor in
            _ = await uploadPending(reason: reason)
        }
    }

    func refreshPendingCount() {
        pendingCount = pendingEvents(limit: 500).count
    }

    @discardableResult
    func uploadPending(
        reason: String = "manual",
        bugId: String? = nil,
        auth: KenosWebAuthSession? = nil,
        drain: Bool = true
    ) async -> KenosLogCloudUploadResult {
        guard enabled || bugId != nil else {
            return .skipped("Cloud upload disabled")
        }
        guard !isUploading else {
            return .skipped("Upload already in progress")
        }

        let sessionAuth = await resolveAuth(explicit: auth)
        guard let sessionAuth else {
            let message = "Sign in on the Kenos web shell to sync logs."
            lastUploadError = message
            UserDefaults.standard.set(message, forKey: Self.lastErrorKey)
            logNoAuthIfNeeded(reason: reason)
            return .skipped(message)
        }

        var totalInserted = 0
        var totalSkipped = 0
        var lastBatchId: String?
        var rounds = 0

        isUploading = true
        defer {
            isUploading = false
            refreshPendingCount()
        }

        repeat {
            rounds += 1
            let events = pendingEvents(limit: maxBatch)
            if events.isEmpty, bugId == nil || rounds > 1 {
                break
            }

            do {
                let result = try await KenosLogCloudClient.ingest(
                    session: KenosLog.shared.sessionInfo,
                    events: events,
                    bugId: rounds == 1 ? bugId : nil,
                    auth: sessionAuth
                )
                markUploaded(events.map(\.id))
                totalInserted += result.inserted
                totalSkipped += result.skipped
                lastBatchId = result.batchId ?? lastBatchId
            } catch {
                let message = error.localizedDescription
                lastUploadError = message
                UserDefaults.standard.set(message, forKey: Self.lastErrorKey)
                // Drop cached auth on HTTP auth failures so the next kick reloads JWT.
                if message.contains("(401)") || message.contains("(403)") {
                    cachedAuth = nil
                    cachedAuthAt = nil
                }
                KenosLog.warning("cloud upload failed", category: .cloud, metadata: [
                    "reason": reason,
                    "error": message,
                    "round": String(rounds),
                ])
                return .failed(message)
            }
        } while drain && rounds < maxDrainRounds && !pendingEvents(limit: 1).isEmpty

        lastInsertedCount = totalInserted
        lastUploadAt = Date()
        lastUploadError = nil
        UserDefaults.standard.set(lastUploadAt, forKey: Self.lastUploadAtKey)
        UserDefaults.standard.removeObject(forKey: Self.lastErrorKey)
        KenosLog.notice("cloud upload ok", category: .cloud, metadata: [
            "reason": reason,
            "inserted": String(totalInserted),
            "skipped": String(totalSkipped),
            "batchId": lastBatchId ?? "",
            "rounds": String(rounds),
            "breadcrumb": "1",
        ])

        if totalInserted == 0 && totalSkipped == 0 {
            return .skipped("Nothing pending")
        }
        return .success(
            KenosLogCloudIngestResponse(
                ok: true,
                sessionId: KenosLog.shared.sessionId,
                batchId: lastBatchId,
                inserted: totalInserted,
                skipped: totalSkipped,
                bugId: bugId
            )
        )
    }

    private func resolveAuth(explicit: KenosWebAuthSession?) async -> KenosWebAuthSession? {
        if let explicit {
            cacheAuth(explicit)
            return explicit
        }

        if let live = await KenosBugReportWebAuth.load(from: KenosActiveWebRegistry.preferred) {
            cacheAuth(live)
            return live
        }

        // Domain Continuity may not hold Life OS auth — also probe the shell WKWebView.
        let shellView = KenosActiveWebRegistry.shellWebView
        if shellView !== nil, shellView !== KenosActiveWebRegistry.preferred,
           let shell = await KenosBugReportWebAuth.load(from: shellView)
        {
            cacheAuth(shell)
            return shell
        }

        // Cross-origin SSO vault (Keychain) — works even when current WK origin has no life_os_auth yet.
        if let shared = KenosSharedWebAuth.loadSharedTokens(),
           let userId = shared.userId, !userId.isEmpty
        {
            let fromVault = KenosWebAuthSession(accessToken: shared.accessToken, userId: userId)
            cacheAuth(fromVault)
            return fromVault
        }

        if let cachedAuth,
           let cachedAuthAt,
           Date().timeIntervalSince(cachedAuthAt) < authCacheTTL
        {
            return cachedAuth
        }

        return nil
    }

    private func cacheAuth(_ auth: KenosWebAuthSession) {
        cachedAuth = auth
        cachedAuthAt = Date()
    }

    private func logNoAuthIfNeeded(reason: String) {
        let now = Date()
        // Avoid spamming the ring every 45s before sign-in.
        if ["auto", "startup", "first-content", "webview", "active", "foreground"].contains(reason) {
            if let lastNoAuthLogAt, now.timeIntervalSince(lastNoAuthLogAt) < 120 {
                return
            }
            lastNoAuthLogAt = now
            KenosLog.debug("cloud upload skipped — no auth", category: .cloud, metadata: [
                "reason": reason,
            ])
            return
        }
        KenosLog.info("cloud upload skipped — no auth", category: .cloud, metadata: [
            "reason": reason,
        ])
    }

    private func pendingEvents(limit: Int) -> [KenosLogEvent] {
        KenosLog.recent(limit: 800, minLevel: cloudMinLevel)
            .filter { !uploadedIds.contains($0.id.uuidString.lowercased()) }
            .suffix(limit)
            .map { $0 }
    }

    private func markUploaded(_ ids: [UUID]) {
        for id in ids {
            uploadedIds.insert(id.uuidString.lowercased())
        }
        if uploadedIds.count > maxUploadedIdMemory {
            uploadedIds = Set(Array(uploadedIds).suffix(maxUploadedIdMemory / 2))
        }
        UserDefaults.standard.set(Array(uploadedIds), forKey: Self.uploadedIdsKey)
    }
}

enum KenosLogCloudUploadResult: Equatable {
    case success(KenosLogCloudIngestResponse)
    case skipped(String)
    case failed(String)

    var summary: String {
        switch self {
        case .success(let r):
            return "Uploaded \(r.inserted) · skipped \(r.skipped)"
        case .skipped(let reason):
            return reason
        case .failed(let message):
            return "Failed: \(message)"
        }
    }
}

struct KenosLogCloudIngestResponse: Equatable {
    var ok: Bool
    var sessionId: String?
    var batchId: String?
    var inserted: Int
    var skipped: Int
    var bugId: String?
}

enum KenosLogCloudClient {
    enum CloudError: LocalizedError {
        case missingConfig
        case http(Int, String)
        case decode

        var errorDescription: String? {
            switch self {
            case .missingConfig: return "Supabase URL missing."
            case .http(let code, let body): return "Upload failed (\(code)): \(body)"
            case .decode: return "Unexpected Supabase response."
            }
        }
    }

    static func ingest(
        session: KenosLogSessionInfo,
        events: [KenosLogEvent],
        bugId: String?,
        auth: KenosWebAuthSession
    ) async throws -> KenosLogCloudIngestResponse {
        guard let url = KenosSupabaseConfig.rpcURL("kenos_ingest_app_logs") else {
            throw CloudError.missingConfig
        }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(auth.accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue(KenosSupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let sessionPayload: [String: Any] = [
            "id": session.sessionId,
            "startedAt": KenosLogFormatting.iso8601(session.startedAt),
            "platform": session.platform,
            "app": session.app,
            "appVersion": session.marketingVersion,
            "build": session.build,
            "deviceModel": session.deviceModel,
            "systemVersion": session.systemVersion,
            "locale": session.locale,
            "metadata": [
                "client": "kenos-ios-native",
            ],
        ]

        let eventPayloads: [[String: Any]] = events.map { event in
            [
                "id": event.id.uuidString.lowercased(),
                "loggedAt": KenosLogFormatting.iso8601(event.timestamp),
                "level": event.level.label.lowercased(),
                "category": event.category.rawValue,
                "message": event.message,
                "metadata": event.metadata,
                "file": event.file,
                "function": event.function,
                "line": Int(event.line),
            ]
        }

        var body: [String: Any] = [
            "p_session": sessionPayload,
            "p_events": eventPayloads,
        ]
        if let bugId, UUID(uuidString: bugId) != nil {
            body["p_bug_id"] = bugId.lowercased()
        } else {
            body["p_bug_id"] = NSNull()
        }

        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? -1
        let text = String(data: data, encoding: .utf8) ?? ""
        guard (200..<300).contains(code) else {
            throw CloudError.http(code, String(text.prefix(240)))
        }

        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw CloudError.decode
        }

        return KenosLogCloudIngestResponse(
            ok: obj["ok"] as? Bool ?? true,
            sessionId: obj["sessionId"] as? String,
            batchId: obj["batchId"] as? String,
            inserted: obj["inserted"] as? Int ?? 0,
            skipped: obj["skipped"] as? Int ?? 0,
            bugId: obj["bugId"] as? String
        )
    }
}
#endif
