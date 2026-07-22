#if os(iOS)
import Foundation

/// Last-known shell / Continuity / breadcrumb trail persisted across launches.
/// Survives hard crashes so the next boot's unclean-exit report has triage context
/// (the Music Now Playing crash only left a MetricKit fingerprint without "where").
enum KenosCrashContextStore {
    private static let key = "kenos.crash.lastContext.v1"
    private static let maxBreadcrumbs = 16

    struct Snapshot: Codable, Equatable, Sendable {
        var updatedAt: Date
        var build: String
        var sessionId: String
        var shellMode: String
        var domainId: String
        var continuityHost: String
        var continuityPath: String
        var lastSpace: String
        var nowPlaying: String
        var breadcrumbs: [String]

        var trailSummary: String {
            breadcrumbs.suffix(8).joined(separator: " ← ")
        }

        var continuitySummary: String {
            if domainId.isEmpty, continuityHost.isEmpty { return "" }
            let path = continuityPath.isEmpty ? "/" : continuityPath
            if continuityHost.isEmpty { return "\(domainId)\(path)" }
            return "\(domainId)@\(continuityHost)\(path)"
        }
    }

    static func load() -> Snapshot? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: data)
    }

    /// Call on launch after session id is ready.
    static func noteLaunch(sessionId: String, build: String) {
        mutate { snap in
            snap.sessionId = sessionId
            if !build.isEmpty { snap.build = build }
            snap.shellMode = snap.shellMode.isEmpty ? "kenos" : snap.shellMode
        }
    }

    static func noteShellMode(_ mode: String) {
        guard !mode.isEmpty else { return }
        mutate { $0.shellMode = mode }
    }

    static func noteSpace(_ spaceId: String) {
        guard !spaceId.isEmpty else { return }
        mutate { $0.lastSpace = spaceId }
    }

    static func noteDomain(url: URL, shellMode: String = "domain") {
        let domainId = KenosDomainRegistry.domainId(fromContinuity: url)
        mutate { snap in
            snap.shellMode = shellMode
            snap.domainId = domainId
            snap.continuityHost = url.host ?? ""
            snap.continuityPath = url.path.isEmpty ? "/" : url.path
            if !domainId.isEmpty { snap.lastSpace = domainId }
        }
    }

    static func noteNowPlaying(trackId: String, title: String, playing: Bool) {
        let label: String
        if title.isEmpty, trackId.isEmpty {
            label = ""
        } else {
            let state = playing ? "playing" : "paused"
            let name = title.isEmpty ? trackId : title
            label = "\(state):\(name)"
        }
        mutate { $0.nowPlaying = String(label.prefix(80)) }
    }

    static func clearNowPlaying() {
        mutate { $0.nowPlaying = "" }
    }

    static func noteBreadcrumb(_ line: String) {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        mutate { snap in
            snap.breadcrumbs.append(String(trimmed.prefix(120)))
            if snap.breadcrumbs.count > maxBreadcrumbs {
                snap.breadcrumbs = Array(snap.breadcrumbs.suffix(maxBreadcrumbs))
            }
        }
    }

    /// Flatten for KenosLog / unclean-exit metadata (string values only).
    static func metadata(from snap: Snapshot?) -> [String: String] {
        guard let snap else { return [:] }
        var meta: [String: String] = [:]
        if !snap.build.isEmpty { meta["ctxBuild"] = snap.build }
        if !snap.shellMode.isEmpty { meta["ctxShell"] = snap.shellMode }
        if !snap.domainId.isEmpty { meta["ctxDomain"] = snap.domainId }
        if !snap.lastSpace.isEmpty { meta["ctxSpace"] = snap.lastSpace }
        if !snap.continuityHost.isEmpty { meta["ctxHost"] = snap.continuityHost }
        if !snap.continuityPath.isEmpty { meta["ctxPath"] = snap.continuityPath }
        if !snap.nowPlaying.isEmpty { meta["ctxNowPlaying"] = snap.nowPlaying }
        let trail = snap.trailSummary
        if !trail.isEmpty { meta["ctxTrail"] = String(trail.prefix(400)) }
        meta["ctxUpdatedAt"] = KenosLogFormatting.iso8601(snap.updatedAt)
        return meta
    }

    // MARK: Private

    private static func mutate(_ body: (inout Snapshot) -> Void) {
        var snap = load() ?? Snapshot(
            updatedAt: Date(),
            build: KenosBugDeviceInfo.build,
            sessionId: "",
            shellMode: "",
            domainId: "",
            continuityHost: "",
            continuityPath: "",
            lastSpace: "",
            nowPlaying: "",
            breadcrumbs: []
        )
        body(&snap)
        snap.updatedAt = Date()
        if snap.build.isEmpty { snap.build = KenosBugDeviceInfo.build }
        if let data = try? JSONEncoder().encode(snap) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}
#endif
